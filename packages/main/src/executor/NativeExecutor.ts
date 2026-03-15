import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
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
    command: string,
    opts: ExecuteOptions,
    onLog: LogCallback,
  ): Promise<ExecutionResult> {
    const { inputFiles = [], outputDir, env, timeoutMs = 5 * 60 * 1000 } = opts;

    // Create temp dirs for input/output (mirrors Docker volume pattern)
    const tempInputDir = inputFiles.length > 0 ? fs.mkdtempSync(path.join(os.tmpdir(), 'clui-input-')) : null;
    const tempOutputDir = outputDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'clui-output-'));
    const ownedOutput = !outputDir;

    try {
      // Copy input files into temp input dir
      if (tempInputDir) {
        for (const src of inputFiles) {
          fs.copyFileSync(src, path.join(tempInputDir, path.basename(src)));
        }
      }

      // Rewrite /input/ and /output/ tokens to real host paths
      let rewritten = command;
      if (tempInputDir) {
        rewritten = rewritten.replace(/\/input\//g, tempInputDir + '/');
      }
      rewritten = rewritten.replace(/\/output\//g, tempOutputDir + '/');

      onLog('system', `[Native] ${rewritten}`);

      // Run via sh -c (same as Docker useShell: true)
      const result = await this.spawnCommand(rewritten, { env, timeoutMs }, onLog);

      // Collect output files
      const outputFiles: string[] = [];
      if (fs.existsSync(tempOutputDir)) {
        for (const entry of fs.readdirSync(tempOutputDir)) {
          outputFiles.push(path.join(tempOutputDir, entry));
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
}
