// All IPC channels defined in one place.
// Main process uses ipcMain.handle() for request/response channels.
// Main process uses webContents.send() for push channels (streaming).

export enum IPCChannel {
  // Docker — request/response via ipcMain.handle
  DOCKER_HEALTH = 'docker:health',
  DOCKER_BUILD = 'docker:build',

  // Execution — request/response to start; push for streaming
  EXEC_RUN = 'exec:run',
  EXEC_LOG = 'exec:log',           // main → renderer (streaming)
  EXEC_COMPLETE = 'exec:complete', // main → renderer (final result)

  // Files — request/response
  FILE_PICK = 'file:pick',
  FILE_SHOW_IN_FINDER = 'file:showInFinder',
}

// ── Request payloads (renderer → main) ────────────────────────────────────

export interface DockerBuildRequest {
  tag: string;
  dockerfilePath: string;
  contextPath: string;
}

export interface ExecRunRequest {
  image: string;
  command: string[];
  /** Host file paths to copy into the container's /input directory (read-only). */
  inputFiles?: string[];
  /** Pre-prepared host input directory. If omitted, main creates a temp dir. */
  inputDir?: string;
  /** Host path mounted read-write at /output. If omitted, main creates a temp dir. */
  outputDir?: string;
  env?: Record<string, string>;
}

export interface FilePickRequest {
  title?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
}

// ── Response payloads (main → renderer) ───────────────────────────────────

export interface DockerHealthResponse {
  ok: boolean;
  version?: string;
  error?: string;
}

export interface DockerBuildResponse {
  ok: boolean;
  imageId?: string;
  error?: string;
}

export interface ExecRunResponse {
  ok: boolean;
  containerId?: string;
  error?: string;
}

export interface ExecLogEvent {
  stream: 'stdout' | 'stderr' | 'system';
  line: string;
  timestamp: number;
}

export interface ExecCompleteEvent {
  exitCode: number;
  outputFiles: string[]; // absolute host paths
  error?: string;
}

export interface FilePickResponse {
  canceled: boolean;
  filePaths: string[];
}
