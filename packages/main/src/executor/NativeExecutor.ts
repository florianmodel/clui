import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import type { InputBinding, ResolvedExecution } from '@gui-bridge/shared';
import type { ExecutionResult, LogCallback } from '../docker/DockerManager.js';
import type { IExecutor, ExecuteOptions, CaptureResult } from './IExecutor.js';

/**
 * Executor strategy that runs commands directly on the host OS.
 * No Docker required. Used for known tools installed via Homebrew/pip/npm/cargo.
 *
 * Path convention: command strings may contain /input/ and /output/ path tokens
 * (the same convention Docker uses). NativeExecutor rewrites these to real host paths
 * before running, so all existing UISchemas and LLM-generated commands work unchanged.
 */
export class NativeExecutor implements IExecutor {
  readonly name = 'Native';

  private activeProcess: ReturnType<typeof spawn> | null = null;

  async run(
    execution: ResolvedExecution,
    opts: ExecuteOptions,
    onLog: LogCallback,
  ): Promise<ExecutionResult> {
    const { inputBindings = [], outputDir, env, timeoutMs = 5 * 60 * 1000 } = opts;

    const fileBindings = inputBindings.filter((binding) => binding.type === 'file_input');
    const tempInputDir = fileBindings.length > 0 ? fs.mkdtempSync(path.join(os.tmpdir(), 'clui-input-')) : null;
    const tempOutputDir = outputDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'clui-output-'));
    const ownedOutput = !outputDir;

    try {
      // Copy file_input steps into a temp /input tree with per-step subdirectories.
      if (tempInputDir) {
        for (const binding of fileBindings) {
          const stepDir = path.join(tempInputDir, binding.stepId);
          fs.mkdirSync(stepDir, { recursive: true });
          for (const src of binding.sourcePaths) {
            fs.copyFileSync(src, path.join(stepDir, path.basename(src)));
          }
        }
      }

      const rewritten = this.rewriteExecution(execution, inputBindings, tempInputDir, tempOutputDir);
      const preview = rewritten.mode === 'shell'
        ? `sh -lc ${rewritten.shellScript ?? ''}`
        : [rewritten.executable ?? '', ...(rewritten.args ?? [])].filter(Boolean).join(' ');

      onLog('system', `[Native] ${preview}`);

      const result = await this.spawnExecution(rewritten, { env, timeoutMs }, onLog);

      const outputFiles: string[] = [];
      if (fs.existsSync(tempOutputDir)) {
        try {
          for (const entry of fs.readdirSync(tempOutputDir)) {
            outputFiles.push(path.join(tempOutputDir, entry));
          }
        } catch {
          // Permissions issue or race with cleanup — return empty list rather than crash
        }
      }

      return {
        exitCode: result.exitCode,
        outputFiles,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.exitCode !== 0 ? result.stderr || `Exited with code ${result.exitCode}` : undefined,
      };
    } finally {
      if (tempInputDir) fs.rmSync(tempInputDir, { recursive: true, force: true });
      // Output dir: only clean up if we created it (caller didn't provide one)
      if (ownedOutput) fs.rmSync(tempOutputDir, { recursive: true, force: true });
    }
  }

  async capture(command: string[], timeoutMs = 15_000): Promise<CaptureResult> {
    const cmd = command.join(' ');
    return this.spawnCommand(cmd, { timeoutMs }, () => {});
  }

  async cancel(): Promise<void> {
    if (this.activeProcess) {
      this.activeProcess.kill('SIGTERM');
      this.activeProcess = null;
    }
  }

  private spawnCommand(
    cmd: string,
    opts: { env?: Record<string, string>; timeoutMs: number },
    onLog: LogCallback,
  ): Promise<CaptureResult> {
    return new Promise((resolve) => {
      const proc = spawn('sh', ['-c', cmd], {
        env: { ...process.env, ...(opts.env ?? {}) },
      });
      this.activeProcess = proc;

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      proc.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
        for (const line of chunk.toString().split('\n')) {
          if (line.trim()) onLog('stdout', line);
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
        for (const line of chunk.toString().split('\n')) {
          if (line.trim()) onLog('stderr', line);
        }
      });

      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        onLog('system', `[Native] Timed out after ${opts.timeoutMs}ms`);
      }, opts.timeoutMs);

      proc.on('close', (code) => {
        clearTimeout(timer);
        this.activeProcess = null;
        resolve({
          exitCode: code ?? -1,
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        this.activeProcess = null;
        onLog('system', `[Native] Process error: ${err.message}`);
        resolve({ exitCode: -1, stdout: '', stderr: err.message });
      });
    });
  }

  private rewriteExecution(
    execution: ResolvedExecution,
    inputBindings: InputBinding[],
    tempInputDir: string | null,
    outputDir: string,
  ): ResolvedExecution {
    const replacements = inputBindings
      .map((binding) => {
        const hostDir = binding.type === 'directory_input'
          ? binding.sourcePaths[0]
          : `${tempInputDir ?? ''}/${binding.stepId}`;
        const hostValue = binding.multiple || binding.type === 'directory_input'
          ? hostDir
          : `${hostDir}/${path.basename(binding.sourcePaths[0])}`;
        return [
          [binding.containerValue, hostValue] as const,
          [binding.containerDir, hostDir] as const,
        ];
      })
      .flat()
      .sort((a, b) => b[0].length - a[0].length);

    const rewriteValue = (value: string): string => {
      let rewritten = value;
      for (const [needle, replacement] of replacements) {
        rewritten = rewritten.replaceAll(needle, replacement);
      }
      rewritten = rewritten.replace(/\/output\b/g, outputDir);
      return rewritten;
    };

    if (execution.mode === 'shell') {
      return {
        ...execution,
        shellScript: execution.shellScript ? rewriteValue(execution.shellScript) : execution.shellScript,
      };
    }

    return {
      ...execution,
      executable: execution.executable ? rewriteValue(execution.executable) : execution.executable,
      args: (execution.args ?? []).map(rewriteValue),
    };
  }

  private spawnExecution(
    execution: ResolvedExecution,
    opts: { env?: Record<string, string>; timeoutMs: number },
    onLog: LogCallback,
  ): Promise<CaptureResult> {
    return new Promise((resolve) => {
      const proc = execution.mode === 'shell'
        ? spawn('sh', ['-lc', execution.shellScript ?? ''], {
            env: { ...process.env, ...(opts.env ?? {}) },
          })
        : spawn(execution.executable ?? '', execution.args ?? [], {
            env: { ...process.env, ...(opts.env ?? {}) },
          });

      this.activeProcess = proc;

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      proc.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
        for (const line of chunk.toString().split('\n')) {
          if (line.trim()) onLog('stdout', line);
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
        for (const line of chunk.toString().split('\n')) {
          if (line.trim()) onLog('stderr', line);
        }
      });

      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        onLog('system', `[Native] Timed out after ${opts.timeoutMs}ms`);
      }, opts.timeoutMs);

      proc.on('close', (code) => {
        clearTimeout(timer);
        this.activeProcess = null;
        resolve({
          exitCode: code ?? -1,
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        this.activeProcess = null;
        onLog('system', `[Native] Process error: ${err.message}`);
        resolve({ exitCode: -1, stdout: '', stderr: err.message });
      });
    });
  }
}
