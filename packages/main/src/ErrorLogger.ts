/**
 * Local error logger for testing and pre-release debugging.
 * Appends structured records to a JSONL file in the app's userData directory.
 * Capped at MAX_RECORDS entries — oldest are dropped when the cap is reached.
 *
 * Location: ~/Library/Application Support/CLUI/error-log.jsonl  (macOS)
 *           ~/.config/CLUI/error-log.jsonl                       (Linux)
 *           %APPDATA%\CLUI\error-log.jsonl                       (Windows)
 */

import * as fs from 'fs';
import * as path from 'path';
import { getUserDataDir } from './paths.js';

export type ErrorCategory =
  | 'run-failure'       // Tool run exited with non-zero exit code
  | 'run-crash'         // Tool run threw an unexpected exception
  | 'autofix-failed'    // Autofix LLM call produced no usable suggestion
  | 'autofix-applied'   // Autofix was accepted by user (track if subsequent run succeeded)
  | 'autofix-rerun-ok'  // Re-run after autofix succeeded
  | 'autofix-rerun-fail'// Re-run after autofix still failed
  | 'schema-warnings'   // Schema generation produced validator warnings
  | 'schema-error'      // Schema generation threw / returned ok:false
  | 'install-error'     // Project install failed
  | 'analyzer-error';   // CLI analysis failed

export interface ErrorRecord {
  /** Short timestamp-based unique id */
  id: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  category: ErrorCategory;
  /** Installed project id, e.g. "yt-dlp--yt-dlp" */
  projectId?: string;
  /** Workflow id within the project schema */
  workflowId?: string;
  /** One-line human summary */
  message: string;
  /**
   * Structured detail: last N chars of stderr, LLM output, list of warnings, etc.
   * Kept short (≤1000 chars) to avoid bloating the log file.
   */
  detail?: string;
  /** Arbitrary extra context: exitCode, errorClass, diagnosisText, etc. */
  metadata?: Record<string, unknown>;
}

const MAX_RECORDS = 500;

export class ErrorLogger {
  private readonly logPath: string;
  /** In-memory cache of parsed records — loaded lazily */
  private records: ErrorRecord[] | null = null;

  constructor(logPath?: string) {
    this.logPath = logPath ?? path.join(getUserDataDir(), 'error-log.jsonl');
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Log a failed tool run (non-zero exit code). */
  logRunFailure(opts: {
    projectId?: string;
    workflowId?: string;
    workflowName?: string;
    exitCode: number;
    command?: string;
    stderrTail?: string;
  }): void {
    this.append({
      category: 'run-failure',
      projectId: opts.projectId,
      workflowId: opts.workflowId,
      message: `Run failed: ${opts.workflowName ?? opts.workflowId ?? 'unknown'} (exit ${opts.exitCode})`,
      detail: opts.stderrTail ? opts.stderrTail.slice(-2000) : undefined,
      metadata: {
        exitCode: opts.exitCode,
        command: opts.command ? opts.command.slice(0, 500) : undefined,
      },
    });
  }

  /** Log an unexpected run crash (exception rather than exit code). */
  logRunCrash(opts: {
    projectId?: string;
    workflowId?: string;
    error: string;
  }): void {
    this.append({
      category: 'run-crash',
      projectId: opts.projectId,
      workflowId: opts.workflowId,
      message: `Run crashed: ${opts.error.slice(0, 120)}`,
      detail: opts.error.slice(0, 800),
    });
  }

  /** Log an autofix attempt result. */
  logAutofix(opts: {
    projectId?: string;
    workflowId?: string;
    ok: boolean;
    errorClass?: string;
    shortReason?: string;
    explanation?: string;
    error?: string;
  }): void {
    if (opts.ok) {
      this.append({
        category: 'autofix-applied',
        projectId: opts.projectId,
        workflowId: opts.workflowId,
        message: `Autofix applied: ${opts.explanation ?? 'no explanation'}`,
        metadata: { errorClass: opts.errorClass, shortReason: opts.shortReason },
      });
    } else {
      this.append({
        category: 'autofix-failed',
        projectId: opts.projectId,
        workflowId: opts.workflowId,
        message: `Autofix failed: ${opts.error ?? 'unknown error'}`,
        metadata: { errorClass: opts.errorClass },
      });
    }
  }

  /** Log the outcome of a re-run following an autofix. */
  logAutofixRerun(opts: {
    projectId?: string;
    workflowId?: string;
    success: boolean;
    exitCode?: number;
    stderrTail?: string;
  }): void {
    this.append({
      category: opts.success ? 'autofix-rerun-ok' : 'autofix-rerun-fail',
      projectId: opts.projectId,
      workflowId: opts.workflowId,
      message: opts.success
        ? 'Re-run after autofix succeeded'
        : `Re-run after autofix still failed (exit ${opts.exitCode ?? '?'})`,
      detail: !opts.success && opts.stderrTail ? opts.stderrTail.slice(-600) : undefined,
      metadata: opts.exitCode !== undefined ? { exitCode: opts.exitCode } : undefined,
    });
  }

  /** Log non-fatal schema generation warnings (e.g. placeholder mismatches). */
  logSchemaWarnings(opts: {
    projectId?: string;
    dockerImage?: string;
    warnings: string[];
    repaired: boolean;
  }): void {
    if (opts.warnings.length === 0) return;
    this.append({
      category: 'schema-warnings',
      projectId: opts.projectId,
      message: `Schema generated with ${opts.warnings.length} warning(s)${opts.repaired ? ' (auto-repaired)' : ''}`,
      detail: opts.warnings.join('\n').slice(0, 800),
      metadata: {
        dockerImage: opts.dockerImage,
        warningCount: opts.warnings.length,
        repaired: opts.repaired,
      },
    });
  }

  /** Log a fatal schema generation error. */
  logSchemaError(opts: {
    projectId?: string;
    dockerImage?: string;
    error: string;
  }): void {
    this.append({
      category: 'schema-error',
      projectId: opts.projectId,
      message: `Schema generation failed: ${opts.error.slice(0, 120)}`,
      detail: opts.error.slice(0, 800),
      metadata: { dockerImage: opts.dockerImage },
    });
  }

  /** Log a project install failure. */
  logInstallError(opts: {
    projectId?: string;
    owner?: string;
    repo?: string;
    error: string;
  }): void {
    this.append({
      category: 'install-error',
      projectId: opts.projectId,
      message: `Install failed for ${opts.owner}/${opts.repo}: ${opts.error.slice(0, 120)}`,
      detail: opts.error.slice(0, 800),
    });
  }

  /** Log a CLI analysis failure. */
  logAnalyzerError(opts: {
    projectId?: string;
    repoDir?: string;
    error: string;
  }): void {
    this.append({
      category: 'analyzer-error',
      projectId: opts.projectId,
      message: `Analyzer failed: ${opts.error.slice(0, 120)}`,
      detail: opts.error.slice(0, 800),
      metadata: { repoDir: opts.repoDir },
    });
  }

  /** Return all stored records, newest first. */
  getAll(): ErrorRecord[] {
    const records = this.load();
    return [...records].reverse();
  }

  /** Return a summary of how many records exist per category. */
  getSummary(): Record<string, number> {
    const records = this.load();
    const counts: Record<string, number> = {};
    for (const r of records) {
      counts[r.category] = (counts[r.category] ?? 0) + 1;
    }
    return counts;
  }

  /** Wipe the log file. */
  clear(): void {
    this.records = [];
    try {
      fs.writeFileSync(this.logPath, '', 'utf8');
    } catch {
      // best-effort
    }
  }

  /** Return the path to the log file (so the renderer can open it in Finder). */
  getLogPath(): string {
    return this.logPath;
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private append(partial: Omit<ErrorRecord, 'id' | 'timestamp'>): void {
    const record: ErrorRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...partial,
    };

    const records = this.load();
    records.push(record);

    // Trim to cap
    const trimmed = records.length > MAX_RECORDS ? records.slice(records.length - MAX_RECORDS) : records;
    this.records = trimmed;

    this.flush(trimmed);
  }

  private load(): ErrorRecord[] {
    if (this.records !== null) return this.records;

    try {
      if (!fs.existsSync(this.logPath)) {
        this.records = [];
        return this.records;
      }
      const content = fs.readFileSync(this.logPath, 'utf8');
      this.records = content
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try { return JSON.parse(line) as ErrorRecord; }
          catch { return null; }
        })
        .filter((r): r is ErrorRecord => r !== null);
    } catch {
      this.records = [];
    }

    return this.records;
  }

  private flush(records: ErrorRecord[]): void {
    try {
      fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
      const content = records.map((r) => JSON.stringify(r)).join('\n') + (records.length > 0 ? '\n' : '');
      fs.writeFileSync(this.logPath, content, 'utf8');
    } catch {
      // best-effort — never crash the app because of logging
    }
  }
}

/** Singleton instance used across the main process. */
export const errorLogger = new ErrorLogger();
