// All IPC channels defined in one place.
// Main process uses ipcMain.handle() for request/response channels.
// Main process uses webContents.send() for push channels (streaming).

import type { ExecutionConfig, UISchema, Workflow } from './ui-schema.js';
import type { CapabilityDump } from './capability-dump.js';
import type {
  FileAction,
  FileChanges,
  FileContext,
  FileKind,
  FolderAction,
  FolderContext,
  RecentFile,
  RecentFolder,
} from './finder-types.js';

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

  // Auto-fix (LLM-powered command correction)
  EXEC_AUTOFIX = 'exec:autofix',

  // Schema save (persist fixed schema to cache)
  SCHEMA_SAVE = 'schema:save',

  // GitHub search
  GITHUB_SEARCH = 'github:search',

  // Project management
  PROJECT_INSTALL = 'project:install',
  PROJECT_INSTALL_PROGRESS = 'project:installProgress', // push: main → renderer
  PROJECT_LIST = 'project:list',
  PROJECT_GET = 'project:get',
  PROJECT_REMOVE = 'project:remove',
  PROJECT_OPEN_FOLDER = 'project:openFolder',
  PROJECT_GENERATE_UI = 'project:generateUi',
  PROJECT_IMPROVE = 'project:improve',
  WORKFLOW_ADD = 'workflow:add',
  WORKFLOW_FILL = 'workflow:fill',

  // GitHub AI recommendation
  GITHUB_RECOMMEND = 'github:recommend',

  // Run history
  PROJECT_GET_HISTORY = 'project:getHistory',
  PROJECT_CLEAR_HISTORY = 'project:clearHistory',

  // One-click update
  PROJECT_CHECK_UPDATE = 'project:checkUpdate',
  PROJECT_APPLY_UPDATE = 'project:applyUpdate',

  // Native runtime (Docker-free execution)
  NATIVE_CHECK_CAPABILITIES = 'native:checkCapabilities',

  // App
  APP_GET_PATH = 'app:getPath',
  APP_CONFIRM = 'app:confirm',
  APP_CLIPBOARD_WRITE = 'app:clipboardWrite',
  APP_NOTIFY = 'app:notify',
  APP_OPEN_EXTERNAL = 'app:openExternal',

  // Files — request/response
  FILE_PICK = 'file:pick',
  FILE_SAVE_PICK = 'file:savePick',
  FILE_COPY = 'file:copy',
  FILE_SHOW_IN_FINDER = 'file:showInFinder',
  FILE_OPEN = 'file:open',
  FILE_GET_INFO = 'file:getInfo',
  FILE_SCAN = 'file:scan',
  FILE_LIST_RECENTS = 'file:listRecents',
  FILE_APPLY_CHANGES = 'file:applyChanges',

  // Docker status push (main → renderer)
  DOCKER_STATUS = 'docker:status',

  // Local error log (testing / pre-release debugging)
  ERROR_LOG_GET = 'errorLog:get',
  ERROR_LOG_CLEAR = 'errorLog:clear',

  // Finder mode
  FOLDER_SCAN = 'folder:scan',
  FOLDER_LIST_RECENTS = 'folder:listRecents',
  FOLDER_RUN = 'folder:run',
  FOLDER_CANCEL = 'folder:cancel',
  FOLDER_RUN_LOG = 'folder:runLog',
  FOLDER_RUN_COMPLETE = 'folder:runComplete',
  FOLDER_RUN_URL = 'folder:runUrl',
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
  runId?: string;
  containerId?: string;
  error?: string;
}

export interface ExecLogEvent {
  runId: string;
  stream: 'stdout' | 'stderr' | 'system';
  line: string;
  timestamp: number;
}

export interface ExecCompleteEvent {
  runId: string;
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
  /** If provided, run is appended to this project's history. */
  projectId?: string;
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
  /** Non-fatal warnings from schema validation (e.g. repaired placeholders, multi-file issues) */
  warnings?: string[];
}

export interface WindowConfig {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export interface AppConfig {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  /** Which LLM provider to use. Defaults to 'anthropic'. */
  llmProvider?: 'anthropic' | 'openai';
  /** Use mock LLM client (no API key needed, returns a basic schema) */
  mockMode?: boolean;
  /** Set to true after the user completes first-run onboarding */
  onboardingComplete?: boolean;
  /** Last window position/size — managed by main process */
  window?: WindowConfig;
  /** UI mode: 'simple' (default, new guided flow) or 'classic' (original interface) */
  uiMode?: 'simple' | 'classic';
}

export interface ConfigGetResponse {
  config: AppConfig;
  hasApiKey: boolean;
}

export interface ConfigSetRequest {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  llmProvider?: 'anthropic' | 'openai';
  mockMode?: boolean;
  onboardingComplete?: boolean;
  uiMode?: 'simple' | 'classic';
}

export interface ValidateKeyRequest {
  apiKey: string;
  provider?: 'anthropic' | 'openai';
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

export interface ExecAutofixRequest {
  workflow: Workflow;
  failedCommand: string;
  errorOutput: string;
  /** Actual form values the user entered — gives LLM concrete file/value context */
  inputValues?: Record<string, unknown>;
  /** Validator warnings from schema generation (helps LLM understand pre-existing issues) */
  schemaWarnings?: string[];
}

export interface ExecAutofixResponse {
  ok: boolean;
  execute?: Pick<ExecutionConfig, 'executable' | 'args' | 'shellScript'>;
  explanation?: string;
  error?: string;
  /** Error classification from the diagnosis step */
  diagnosis?: { errorClass: string; shortReason: string };
}

export interface SchemaSaveRequest {
  schema: UISchema;
}

export interface SchemaSaveResponse {
  ok: boolean;
  /** false = no cached entry matched the dockerImage (e.g. bundled example schema) */
  saved: boolean;
  error?: string;
}

// ── GitHub search ──────────────────────────────────────────────────────────

export interface SearchResult {
  owner: string;
  repo: string;
  fullName: string;
  description: string;
  stars: number;
  language: string;
  topics: string[];
  lastUpdated: string; // ISO date string
  license?: string;
  htmlUrl: string;
}

export interface GithubSearchRequest {
  query: string;
}

export interface GithubSearchResponse {
  ok: boolean;
  results?: SearchResult[];
  error?: string;
  rateLimited?: boolean;
}

// ── Project management ─────────────────────────────────────────────────────

export type ProjectStatus = 'ready' | 'no-schema' | 'error';

export interface ProjectMeta {
  projectId: string;  // "{owner}--{repo}"
  owner: string;
  repo: string;
  fullName: string;
  description: string;
  language: string;
  stars: number;
  installedAt: string;
  dockerImage: string;
  status: ProjectStatus;
  error?: string;
  repoDir: string;
  /** Absolute path to schema.json, if generated */
  schemaPath?: string;
  /** Git HEAD SHA at install time — used for staleness detection */
  commitSha?: string;
  /** How the UISchema was obtained */
  schemaSource?: 'registry' | 'llm' | 'cache';
  /** How the tool is executed — 'docker' (default) or 'native' (no Docker required) */
  executionMode?: 'docker' | 'native';
  /** Binary name for native execution (e.g. 'ffmpeg', 'yt-dlp') */
  nativeBinary?: string;
  /** Detected version of the natively-installed binary */
  nativeVersion?: string;
  /** Explicit invocation used for CLI analysis / help collection. */
  analyzerCommand?: string[];
}

export interface InstallProgressEvent {
  projectId: string;
  stage: 'cloning' | 'detecting' | 'registry' | 'installing' | 'building' | 'analyzing' | 'generating' | 'complete' | 'error';
  message: string;
}

export interface NativeCapabilities {
  hasDocker: boolean;
  hasHomebrew: boolean;
  hasPip: boolean;
  hasNpm: boolean;
  hasCargo: boolean;
  platform: string;
}

export interface ProjectInstallRequest {
  owner: string;
  repo: string;
  searchResult: SearchResult;
}

export interface ProjectInstallResponse {
  ok: boolean;
  meta?: ProjectMeta;
  error?: string;
}

export interface ProjectListResponse {
  projects: ProjectMeta[];
}

export interface ProjectGetRequest {
  projectId: string;
}

export interface ProjectGetResponse {
  ok: boolean;
  meta?: ProjectMeta;
  schema?: UISchema;
  error?: string;
}

export interface ProjectRemoveRequest {
  projectId: string;
}

export interface ProjectGenerateUiRequest {
  projectId: string;
}

export interface ProjectGenerateUiResponse {
  ok: boolean;
  schema?: UISchema;
  error?: string;
}

export interface ProjectImproveRequest {
  projectId: string;
  feedback: string;
  currentSchema: UISchema;
}

export interface ProjectImproveResponse {
  ok: boolean;
  schema?: UISchema;
  error?: string;
}

// ── File info ──────────────────────────────────────────────────────────────────

export type FileType = FileKind;

export interface FileInfo {
  name: string;
  path: string;
  size: number;       // bytes
  sizeLabel: string;  // e.g. "12.4 MB"
  extension: string;
  type: FileType;
  previewable: boolean; // image or short text file
}

export interface FileGetInfoRequest {
  filePath: string;
}

export interface FileGetInfoResponse {
  ok: boolean;
  info?: FileInfo;
  error?: string;
}

// ── App utilities ─────────────────────────────────────────────────────────────

export interface AppConfirmRequest {
  title: string;
  message: string;
  detail?: string;
  /** Label for the confirm button. Defaults to "OK". */
  confirmLabel?: string;
}

export interface AppConfirmResponse {
  confirmed: boolean;
}

export interface AppNotifyRequest {
  title: string;
  body: string;
}

// ── Finder mode ───────────────────────────────────────────────────────────────

export interface FolderScanRequest {
  folderPath: string;
}

export interface FolderScanResponse {
  ok: boolean;
  context?: FolderContext;
  error?: string;
}

export interface FolderListRecentsResponse {
  recents: RecentFolder[];
}

export interface FolderRunRequest {
  folderPath: string;
  actionId: string;
}

export interface FolderRunResponse {
  ok: boolean;
  runId?: string;
  action?: FolderAction;
  error?: string;
}

export interface FolderRunLogEvent {
  runId: string;
  stream: 'stdout' | 'stderr' | 'system';
  line: string;
  timestamp: number;
}

export interface FolderRunUrlEvent {
  runId: string;
  url: string;
  timestamp: number;
}

export interface FolderRunCompleteEvent {
  runId: string;
  exitCode: number;
  error?: string;
  canceled?: boolean;
}

export interface FileScanRequest {
  filePath: string;
}

export interface FileScanResponse {
  ok: boolean;
  context?: FileContext;
  error?: string;
}

export interface FileListRecentsResponse {
  recents: RecentFile[];
}

export interface FileApplyChangesRequest {
  filePath: string;
  changes: FileChanges;
}

export interface FileApplyChangesResponse {
  ok: boolean;
  context?: FileContext;
  error?: string;
}

// ── Workflow add (LLM-powered) ─────────────────────────────────────────────────

export interface WorkflowAddRequest {
  projectId: string;
  description: string;
  currentSchema: UISchema;
}

export interface WorkflowAddResponse {
  ok: boolean;
  schema?: UISchema;
  infeasible?: string;
  error?: string;
}

// ── GitHub AI recommendation ───────────────────────────────────────────────────

export interface RepoSuggestion {
  owner: string;
  repo: string;
  description: string;
  why: string;
}

export interface GithubRecommendRequest {
  description: string;
}

export interface GithubRecommendResponse {
  ok: boolean;
  repos?: RepoSuggestion[];
  error?: string;
}

// ── Run history ────────────────────────────────────────────────────────────────

export interface RunRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  startedAt: string;    // ISO timestamp
  durationMs: number;
  success: boolean;
  exitCode: number;
  outputFiles: string[];
  error?: string;
}

export interface ProjectGetHistoryRequest {
  projectId: string;
}

export interface ProjectGetHistoryResponse {
  ok: boolean;
  records?: RunRecord[];
}

// ── Workflow form fill (LLM-powered) ───────────────────────────────────────────

export interface WorkflowFillRequest {
  description: string;
  workflow: Workflow;
  projectId: string;
}

export interface WorkflowFillResponse {
  ok: boolean;
  values?: Record<string, unknown>;
  error?: string;
}

// ── One-click update ──────────────────────────────────────────────────────────

export interface ProjectCheckUpdateRequest {
  projectId: string;
}

export interface ProjectCheckUpdateResponse {
  ok: boolean;
  hasUpdate?: boolean;
  behindBy?: number;
  error?: string;
}

export interface ProjectApplyUpdateRequest {
  projectId: string;
}

export interface ProjectApplyUpdateResponse {
  ok: boolean;
  schema?: UISchema;
  error?: string;
}

// ── Docker status push ─────────────────────────────────────────────────────────

export interface DockerStatusEvent {
  running: boolean;
  version?: string;
}

// ── Local error log ────────────────────────────────────────────────────────────

export type ErrorCategory =
  | 'run-failure'
  | 'run-crash'
  | 'autofix-failed'
  | 'autofix-applied'
  | 'autofix-rerun-ok'
  | 'autofix-rerun-fail'
  | 'schema-warnings'
  | 'schema-error'
  | 'install-error'
  | 'analyzer-error';

export interface ErrorRecord {
  id: string;
  timestamp: string;
  category: ErrorCategory;
  projectId?: string;
  workflowId?: string;
  message: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}

export interface ErrorLogGetResponse {
  records: ErrorRecord[];
  /** Absolute path to the log file — so user can open it in Finder */
  logPath: string;
  /** Total count (before any truncation for the response) */
  total: number;
}
