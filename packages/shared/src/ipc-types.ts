// All IPC channels defined in one place.
// Main process uses ipcMain.handle() for request/response channels.
// Main process uses webContents.send() for push channels (streaming).

import type { UISchema, Workflow } from './ui-schema.js';
import type { CapabilityDump } from './capability-dump.js';

export enum IPCChannel {
  // Docker — request/response via ipcMain.handle
  DOCKER_HEALTH = 'docker:health',
  DOCKER_BUILD = 'docker:build',

  // Execution — request/response to start; push for streaming
  EXEC_RUN = 'exec:run',
  EXEC_SCHEMA_RUN = 'exec:schema-run',  // high-level: workflow + inputs
  EXEC_CANCEL = 'exec:cancel',     // renderer → main (stop running container)
  EXEC_LOG = 'exec:log',           // main → renderer (streaming)
  EXEC_COMPLETE = 'exec:complete', // main → renderer (final result)

  // Schema
  SCHEMA_LOAD = 'schema:load',

  // Analyzer
  ANALYZER_RUN = 'analyzer:run',

  // Schema generation (LLM)
  SCHEMA_GENERATE = 'schema:generate',

  // Config
  CONFIG_GET = 'config:get',
  CONFIG_SET = 'config:set',
  CONFIG_VALIDATE_KEY = 'config:validateKey',

  // Progress events (push: main → renderer)
  ANALYSIS_PROGRESS = 'analysis:progress',

  // App
  APP_GET_PATH = 'app:getPath',

  // Files — request/response
  FILE_PICK = 'file:pick',
  FILE_SAVE_PICK = 'file:savePick',
  FILE_COPY = 'file:copy',
  FILE_SHOW_IN_FINDER = 'file:showInFinder',
}

// Re-export for convenience in handlers
export type { UISchema, Workflow, CapabilityDump };

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

export interface FileSavePickRequest {
  title?: string;
  defaultPath?: string; // suggested filename
  filters?: Array<{ name: string; extensions: string[] }>;
}

export interface FileSavePickResponse {
  canceled: boolean;
  filePath?: string;
}

export interface FileCopyRequest {
  src: string;
  dest: string;
}

export interface SchemaLoadRequest {
  filePath: string;  // relative path resolved by main process
}

export interface AnalyzerRunRequest {
  /** Absolute host path to the cloned repo directory */
  repoDir: string;
  /** Docker image tag to run the tool (must already exist) */
  dockerImage: string;
}

export interface AnalyzerRunResponse {
  ok: boolean;
  dump?: CapabilityDump;
  error?: string;
}

export interface SchemaLoadResponse {
  ok: boolean;
  schema?: UISchema;
  error?: string;
}

export interface ExecSchemaRunRequest {
  workflow: Workflow;
  dockerImage: string;
  dockerfilePath?: string;
  inputs: Record<string, unknown>;
  /** Host directory where output files are copied after the run. Defaults to a temp dir. */
  outputDir?: string;
}

export interface SchemaGenerateRequest {
  dump: CapabilityDump;
  /** Docker image the schema should target */
  dockerImage: string;
  /** Optional user feedback for regeneration */
  feedback?: string;
  /** Current schema (for regeneration with feedback) */
  currentSchema?: UISchema;
  /** Force regeneration even if cached */
  forceRegenerate?: boolean;
}

export interface SchemaGenerateResponse {
  ok: boolean;
  schema?: UISchema;
  error?: string;
  fromCache?: boolean;
}

export interface AppConfig {
  anthropicApiKey?: string;
  /** Use mock LLM client (no API key needed, returns a basic schema) */
  mockMode?: boolean;
}

export interface ConfigGetResponse {
  config: AppConfig;
  hasApiKey: boolean;
}

export interface ConfigSetRequest {
  anthropicApiKey?: string;
  mockMode?: boolean;
}

export interface ValidateKeyRequest {
  apiKey: string;
}

export interface ValidateKeyResponse {
  ok: boolean;
  error?: string;
}

export interface AnalysisProgressEvent {
  stage: 'detecting' | 'readme' | 'introspecting' | 'help' | 'generating-ui' | 'complete' | 'error';
  message: string;
  detail?: string;
}
