import type { InputBinding, ResolvedExecution } from '@gui-bridge/shared';
import type { ExecutionResult, LogCallback } from '../docker/DockerManager.js';

export interface ExecuteOptions {
  /** Step-scoped mounts copied or bound into /input/<step_id>/ */
  inputBindings?: InputBinding[];
  /** Host directory where output files should be placed. If omitted, a temp dir is created. */
  outputDir?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface CaptureResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface IExecutor {
  /** Human-readable name shown in logs (e.g. 'Docker', 'Native') */
  readonly name: string;

  /**
   * Run a resolved execution plan.
   * Streams stdout/stderr/system lines to onLog.
   * Returns the execution result including exit code and output file paths.
   */
  run(
    execution: ResolvedExecution,
    opts: ExecuteOptions,
    onLog: LogCallback,
  ): Promise<ExecutionResult>;

  /**
   * Run a command silently (no streaming) and return captured output.
   * Used for --help introspection and binary verification.
   */
  capture(command: string[], timeoutMs?: number): Promise<CaptureResult>;

  /** Cancel any currently running command. */
  cancel(): Promise<void>;
}
