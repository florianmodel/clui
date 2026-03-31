import * as fs from 'fs';
import * as path from 'path';
import type { InputBinding, ResolvedExecution } from '@gui-bridge/shared';
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
    execution: ResolvedExecution,
    opts: ExecuteOptions,
    onLog: LogCallback,
  ): Promise<ExecutionResult> {
    const { inputBindings = [], outputDir, env, timeoutMs } = opts;

    const tempOutputDir = this.docker.createTempDir('output');
    const fileBindings = inputBindings.filter((binding) => binding.type === 'file_input');
    const directoryBindings = inputBindings.filter((binding) => binding.type === 'directory_input');

    let inputDir: string | undefined;

    if (fileBindings.length > 0) {
      inputDir = this.docker.createTempDir('input');
      for (const binding of fileBindings) {
        const stepDir = path.join(inputDir, binding.stepId);
        fs.mkdirSync(stepDir, { recursive: true });
        for (const src of binding.sourcePaths) {
          fs.copyFileSync(src, path.join(stepDir, path.basename(src)));
        }
      }
    }

    const extraVolumes = directoryBindings.map((binding) => ({
      hostPath: binding.sourcePaths[0],
      containerPath: binding.containerDir,
      readOnly: true,
    }));

    const command = execution.mode === 'shell'
      ? [execution.shellScript ?? '']
      : [execution.executable ?? '', ...(execution.args ?? [])];
    const entrypoint = execution.mode === 'shell' ? ['sh', '-lc'] : [];

    try {
      const result = await this.docker.runCommand(
        this.imageTag,
        command,
        {
          inputDir,
          outputDir: tempOutputDir,
          extraVolumes,
          entrypoint,
          network: 'bridge',
          env,
          timeout: timeoutMs,
        },
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
      if (inputDir) this.docker.removeTempDir(inputDir);
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
