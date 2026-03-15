import * as fs from 'fs';
import * as path from 'path';
import { DockerManager } from '../docker/DockerManager.js';
import type { ExecutionResult, LogCallback } from '../docker/DockerManager.js';
import type { IExecutor, ExecuteOptions, CaptureResult } from './IExecutor.js';

/**
 * Executor strategy that runs commands inside Docker containers.
 * Wraps DockerManager — the original execution path, unchanged.
 */
export class DockerExecutor implements IExecutor {
  readonly name = 'Docker';

  constructor(
    private docker: DockerManager,
    private imageTag: string,
  ) {}

  async run(
    command: string,
    opts: ExecuteOptions,
    onLog: LogCallback,
  ): Promise<ExecutionResult> {
    const { inputFiles = [], outputDir, env, timeoutMs } = opts;

    const tempOutputDir = this.docker.createTempDir('output');
    let inputDir: string | undefined;
    let ownedInput = false;

    if (inputFiles.length > 0) {
      inputDir = this.docker.createTempDir('input');
      ownedInput = true;
      for (const src of inputFiles) {
        fs.copyFileSync(src, path.join(inputDir, path.basename(src)));
      }
    }

    try {
      const result = await this.docker.runCommand(
        this.imageTag,
        [command],
        { inputDir, outputDir: tempOutputDir, useShell: true, network: 'bridge', env, timeout: timeoutMs },
        onLog,
      );

      // If caller wants outputs in a specific dir, copy them there
      let outputFiles = result.outputFiles;
      if (outputDir && result.outputFiles.length > 0) {
        fs.mkdirSync(outputDir, { recursive: true });
        outputFiles = result.outputFiles.map((src) => {
          const dest = path.join(outputDir, path.basename(src));
          fs.copyFileSync(src, dest);
          return dest;
        });
      }

      return { ...result, outputFiles };
    } finally {
      if (ownedInput && inputDir) this.docker.removeTempDir(inputDir);
      this.docker.removeTempDir(tempOutputDir);
    }
  }

  async capture(command: string[], timeoutMs = 15_000): Promise<CaptureResult> {
    const cmd = command.join(' ');
    const result = await this.docker.runCommand(
      this.imageTag,
      [cmd],
      { useShell: true, network: 'none', timeout: timeoutMs },
      () => {},
    );
    return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
  }

  async cancel(): Promise<void> {
    await this.docker.cancelRunning();
  }
}
