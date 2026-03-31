import { ipcMain, BrowserWindow, shell, dialog, app, clipboard, Notification } from 'electron';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  IPCChannel,
  type ErrorLogGetResponse,
  type FolderScanRequest,
  type FolderScanResponse,
  type FolderListRecentsResponse,
  type FolderRunRequest,
  type FolderRunResponse,
  type FolderRunLogEvent,
  type FolderRunCompleteEvent,
  type FolderRunUrlEvent,
  type DockerBuildRequest,
  type DockerBuildResponse,
  type DockerHealthResponse,
  type ExecRunRequest,
  type ExecRunResponse,
  type ExecCompleteEvent,
  type ExecLogEvent,
  type FilePickRequest,
  type FilePickResponse,
  type FileSavePickRequest,
  type FileSavePickResponse,
  type FileCopyRequest,
  type SchemaLoadRequest,
  type SchemaLoadResponse,
  type ExecSchemaRunRequest,
  type AnalyzerRunRequest,
  type AnalyzerRunResponse,
  type SchemaGenerateRequest,
  type SchemaGenerateResponse,
  type ConfigGetResponse,
  type ConfigSetRequest,
  type ValidateKeyRequest,
  type ValidateKeyResponse,
  type AnalysisProgressEvent,
  type ExecAutofixRequest,
  type ExecAutofixResponse,
  type SchemaSaveRequest,
  type SchemaSaveResponse,
  type GithubSearchRequest,
  type GithubSearchResponse,
  type ProjectInstallRequest,
  type ProjectInstallResponse,
  type ProjectListResponse,
  type ProjectGetRequest,
  type ProjectGetResponse,
  type ProjectRemoveRequest,
  type ProjectGenerateUiRequest,
  type ProjectGenerateUiResponse,
  type ProjectImproveRequest,
  type ProjectImproveResponse,
  type WorkflowAddRequest,
  type WorkflowAddResponse,
  type GithubRecommendRequest,
  type GithubRecommendResponse,
  type ProjectGetHistoryRequest,
  type ProjectGetHistoryResponse,
  type WorkflowFillRequest,
  type WorkflowFillResponse,
  type ProjectCheckUpdateRequest,
  type ProjectCheckUpdateResponse,
  type ProjectApplyUpdateRequest,
  type ProjectApplyUpdateResponse,
  type FileGetInfoRequest,
  type FileGetInfoResponse,
  type FileInfo,
  type FileType,
  type FileScanRequest,
  type FileScanResponse,
  type FileListRecentsResponse,
  type FileApplyChangesRequest,
  type FileApplyChangesResponse,
  type AppConfirmRequest,
  type AppConfirmResponse,
  type AppNotifyRequest,
  type InstallProgressEvent,
  type Workflow,
} from '@gui-bridge/shared';

import { DockerManager } from '../docker/index.js';
import {
  buildCommand,
  describeExecution,
  resolveExecution,
  ExecutorRouter,
  DockerExecutor,
} from '../executor/index.js';
import { Analyzer } from '../analyzer/index.js';
import { LLMClient, MockLLMClient, type ILLMClient } from '../analyzer/LLMClient.js';
import { OpenAIClient } from '../analyzer/OpenAIClient.js';
import type { AppConfig, NativeCapabilities } from '@gui-bridge/shared';
import { SchemaCache } from '../analyzer/SchemaCache.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { NativeInstallManager } from '../native/index.js';
import { getScriptsDir, getProjectsDir } from '../paths.js';
import { buildFixCommandPrompt } from '../analyzer/prompts/fix-command.js';
import { buildDiagnosePrompt } from '../analyzer/prompts/diagnose-error.js';
import { buildAddWorkflowPrompt } from '../analyzer/prompts/add-workflow.js';
import { TOKEN_LIMITS } from '../analyzer/models.js';
import { buildRepoRecommendationPrompt } from '../analyzer/prompts/recommend-repos.js';
import { buildFormFillPrompt } from '../analyzer/prompts/fill-form.js';
import { SchemaValidator } from '../analyzer/SchemaValidator.js';
import { GitHubClient } from '../github/GitHubClient.js';
import { ProjectManager } from '../projects/ProjectManager.js';
import { HistoryStore } from '../projects/HistoryStore.js';
import {
  FileContextService,
  FolderActionRunner,
  FolderContextService,
  RecentFilesStore,
  RecentFoldersStore,
} from '../finder/index.js';
import { errorLogger } from '../ErrorLogger.js';

/** Instantiate the correct LLM client based on config. Returns MockLLMClient if no key. */
function makeLLMClient(config: AppConfig): ILLMClient {
  if (config.mockMode) return new MockLLMClient();
  if (config.llmProvider === 'openai' && config.openaiApiKey) {
    return new OpenAIClient(config.openaiApiKey);
  }
  if (config.anthropicApiKey) return new LLMClient(config.anthropicApiKey);
  if (config.openaiApiKey) return new OpenAIClient(config.openaiApiKey);
  return new MockLLMClient();
}

const docker = new DockerManager();
const executorRouter = new ExecutorRouter(docker);
const configManager = new ConfigManager();
const schemaCache = new SchemaCache();
const schemaValidator = new SchemaValidator();
const githubClient = new GitHubClient();
const historyStore = new HistoryStore();
const recentFoldersStore = new RecentFoldersStore();
const recentFilesStore = new RecentFilesStore();

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function categorizeFile(ext: string): FileType {
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'].includes(ext)) return 'image';
  if (['.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'].includes(ext)) return 'audio';
  if (['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf'].includes(ext)) return 'document';
  if (['.json', '.csv', '.tsv', '.xml', '.yaml', '.yml'].includes(ext)) return 'data';
  if (['.js', '.ts', '.py', '.rb', '.go', '.rs', '.sh'].includes(ext)) return 'data';
  return 'other';
}

/** Resolve a path that may be relative (from renderer) to an absolute host path. */
function resolveAppPath(p: string): string {
  if (path.isAbsolute(p)) return p;
  // app.getAppPath() returns the project root (where root package.json lives)
  return path.resolve(app.getAppPath(), p);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validateSchemaWarnings(schema: { projectId: string; projectName: string; description: string; version: string; dockerImage: string; workflows: Workflow[] }): string[] {
  const cloned = cloneJson(schema);
  return schemaValidator.validate(cloned);
}

function buildUpdatedExecute(
  base: Workflow['execute'],
  execute: NonNullable<ExecAutofixResponse['execute']>,
): Workflow['execute'] {
  if (execute.shellScript?.trim()) {
    return {
      ...base,
      shellScript: execute.shellScript.trim(),
      executable: undefined,
      args: undefined,
      command: undefined,
    };
  }

  if (execute.executable?.trim()) {
    return {
      ...base,
      executable: execute.executable.trim(),
      args: execute.args ?? [],
      shellScript: undefined,
      command: undefined,
    };
  }

  throw new Error('Auto-fix response did not include a valid execution config');
}

/** Fire a system notification if the platform supports it. */
function notify(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {

  const scriptsDir = getScriptsDir();
  const projectManager = new ProjectManager(docker, scriptsDir);
  const folderContextService = new FolderContextService({
    recentStore: recentFoldersStore,
    listInstalledProjects: () => projectManager.listInstalled(),
  });
  const fileContextService = new FileContextService({
    recentStore: recentFilesStore,
    listInstalledProjects: () => projectManager.listInstalled(),
  });

  // Track the currently running executor so exec:cancel works regardless of mode
  let activeExecutor: import('../executor/IExecutor.js').IExecutor | null = null;
  let activeRunId: string | null = null;
  let activeFolderRunner: FolderActionRunner | null = null;
  let activeFolderRunId: string | null = null;

  // ── app:getPath ────────────────────────────────────────────────────────
  ipcMain.handle(IPCChannel.APP_GET_PATH, (_event, name: string): string => {
    return app.getPath(name as Parameters<typeof app.getPath>[0]);
  });

  // ── docker:health ──────────────────────────────────────────────────────
  ipcMain.handle(IPCChannel.DOCKER_HEALTH, async (): Promise<DockerHealthResponse> => {
    return docker.checkHealth();
  });

  // ── native:checkCapabilities ────────────────────────────────────────────
  ipcMain.handle(IPCChannel.NATIVE_CHECK_CAPABILITIES, async (): Promise<NativeCapabilities> => {
    const nativeMgr = new NativeInstallManager();
    return nativeMgr.detectCapabilities();
  });

  // ── docker:build ───────────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.DOCKER_BUILD,
    async (_event, req: DockerBuildRequest): Promise<DockerBuildResponse> => {
      const runId = `build:${req.tag}`;
      // Check if image already exists — skip build if so
      const exists = await docker.imageExists(req.tag);
      if (exists) {
        const win = getWindow();
        const event: ExecLogEvent = {
          runId,
          stream: 'system',
          line: `Image "${req.tag}" already exists — skipping build.`,
          timestamp: Date.now(),
        };
        win?.webContents.send(IPCChannel.EXEC_LOG, event);
        return { ok: true, imageId: req.tag };
      }

      const win = getWindow();
      const dockerfilePath = resolveAppPath(req.dockerfilePath);
      const contextPath = resolveAppPath(req.contextPath);

      const result = await docker.buildImage(
        req.tag,
        dockerfilePath,
        contextPath,
        (stream, line) => {
          const event: ExecLogEvent = { runId, stream, line, timestamp: Date.now() };
          win?.webContents.send(IPCChannel.EXEC_LOG, event);
        },
      );
      return result.ok
        ? { ok: true, imageId: req.tag }
        : { ok: false, error: result.error };
    },
  );

  // ── exec:run ───────────────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.EXEC_RUN,
    async (_event, req: ExecRunRequest): Promise<ExecRunResponse> => {
      const win = getWindow();
      if (activeExecutor) {
        return {
          ok: false,
          error: `A run is already in progress${activeRunId ? ` (${activeRunId})` : ''}.`,
        };
      }

      const runId = randomUUID();

      // Create temp output dir
      const outputDir = req.outputDir ?? docker.createTempDir('output');

      // Create temp input dir and copy input files into it
      let inputDir: string | undefined;
      let ownedInput = false;
      if (req.inputFiles && req.inputFiles.length > 0) {
        inputDir = docker.createTempDir('input');
        ownedInput = true;
        for (const src of req.inputFiles) {
          const dest = path.join(inputDir, path.basename(src));
          fs.copyFileSync(src, dest);
        }
      } else if (req.inputDir) {
        inputDir = req.inputDir;
      }
      // else: no input dir — command generates its own input (e.g. lavfi test source)

      const sendLog = (stream: 'stdout' | 'stderr' | 'system', line: string) => {
        const event: ExecLogEvent = { runId, stream, line, timestamp: Date.now() };
        win?.webContents.send(IPCChannel.EXEC_LOG, event);
      };

      const executor = new DockerExecutor(docker, req.image);
      activeExecutor = executor;
      activeRunId = runId;

      void (async () => {
        try {
          const result = await docker.runCommand(
            req.image,
            req.command,
            { inputDir, outputDir, env: req.env },
            sendLog,
          );

          const complete: ExecCompleteEvent = {
            runId,
            exitCode: result.exitCode,
            outputFiles: result.outputFiles,
            error: result.error,
          };
          win?.webContents.send(IPCChannel.EXEC_COMPLETE, complete);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          sendLog('system', `Error: ${msg}`);
          const complete: ExecCompleteEvent = { runId, exitCode: -1, outputFiles: [], error: msg };
          win?.webContents.send(IPCChannel.EXEC_COMPLETE, complete);
        } finally {
          if (ownedInput && inputDir) docker.removeTempDir(inputDir);
          activeExecutor = null;
          activeRunId = null;
          // outputDir is intentionally kept so the renderer can open files
        }
      })();

      return { ok: true, runId };
    },
  );

  // ── exec:cancel ────────────────────────────────────────────────────────
  ipcMain.handle(IPCChannel.EXEC_CANCEL, async (): Promise<void> => {
    if (activeExecutor) {
      await activeExecutor.cancel();
    } else {
      await docker.cancelRunning(); // fallback for exec:run (low-level)
    }
  });

  // ── file:pick ──────────────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.FILE_PICK,
    async (_event, req: FilePickRequest): Promise<FilePickResponse> => {
      const win = getWindow();
      const result = await dialog.showOpenDialog(win ?? new BrowserWindow(), {
        title: req.title,
        filters: req.filters,
        properties: req.properties ?? ['openFile'],
      });
      return { canceled: result.canceled, filePaths: result.filePaths };
    },
  );

  // ── file:savePick ──────────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.FILE_SAVE_PICK,
    async (_event, req: FileSavePickRequest): Promise<FileSavePickResponse> => {
      const win = getWindow();
      const result = await dialog.showSaveDialog(win ?? new BrowserWindow(), {
        title: req.title,
        defaultPath: req.defaultPath,
        filters: req.filters,
      });
      return { canceled: result.canceled, filePath: result.filePath };
    },
  );

  // ── file:copy ──────────────────────────────────────────────────────────
  ipcMain.handle(IPCChannel.FILE_COPY, async (_event, req: FileCopyRequest): Promise<void> => {
    fs.copyFileSync(req.src, req.dest);
  });

  // ── file:showInFinder ──────────────────────────────────────────────────
  ipcMain.handle(IPCChannel.FILE_SHOW_IN_FINDER, async (_event, filePath: string) => {
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
    } else {
      shell.openPath(path.dirname(filePath));
    }
  });

  // ── schema:load ────────────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.SCHEMA_LOAD,
    async (_event, req: SchemaLoadRequest): Promise<SchemaLoadResponse> => {
      try {
        const filePath = resolveAppPath(req.filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        const schema = JSON.parse(content) as SchemaLoadResponse['schema'];
        return { ok: true, schema };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
  );

  // ── exec:schema-run ────────────────────────────────────────────────────
  // High-level execution: receives workflow + inputs, builds command,
  // routes to the right executor (Docker or Native), streams logs.
  ipcMain.handle(
    IPCChannel.EXEC_SCHEMA_RUN,
    async (_event, req: ExecSchemaRunRequest): Promise<ExecRunResponse> => {
      const win = getWindow();
      const startedAt = Date.now();
      if (activeExecutor) {
        return {
          ok: false,
          error: `A run is already in progress${activeRunId ? ` (${activeRunId})` : ''}.`,
        };
      }
      const runId = randomUUID();

      const sendLog = (stream: 'stdout' | 'stderr' | 'system', line: string) => {
        const event: ExecLogEvent = { runId, stream, line, timestamp: Date.now() };
        win?.webContents.send(IPCChannel.EXEC_LOG, event);
      };

      // Resolve executor: use project meta if available, otherwise fall back to DockerExecutor
      let executor;
      if (req.projectId) {
        const meta = projectManager.getMeta(req.projectId);
        executor = meta
          ? await executorRouter.forProject(meta)
          : new DockerExecutor(docker, req.dockerImage);
      } else {
        executor = new DockerExecutor(docker, req.dockerImage);
      }

      activeExecutor = executor;
      activeRunId = runId;
      sendLog('system', `Executor: ${executor.name}`);

      const resolvedExecution = resolveExecution(req.workflow, req.inputs);
      const builtCommand = resolvedExecution.preview || buildCommand(req.workflow, req.inputs) || describeExecution(req.workflow);
      sendLog('system', `Command: ${builtCommand}`);

      void (async () => {
        try {
          // For Docker executor: build image if needed (native skips this)
          if (executor.name === 'Docker' && req.dockerfilePath) {
            const exists = await docker.imageExists(req.dockerImage);
            if (!exists) {
              const dockerfilePath = resolveAppPath(req.dockerfilePath);
              const contextPath = resolveAppPath('.');
              const buildResult = await docker.buildImage(req.dockerImage, dockerfilePath, contextPath, sendLog);
              if (!buildResult.ok) {
                const complete: ExecCompleteEvent = {
                  runId,
                  exitCode: 1,
                  outputFiles: [],
                  error: buildResult.error,
                };
                win?.webContents.send(IPCChannel.EXEC_COMPLETE, complete);
                return;
              }
            } else {
              sendLog('system', `Image "${req.dockerImage}" already exists — skipping build.`);
            }
          }

          const result = await executor.run(
            resolvedExecution,
            { inputBindings: resolvedExecution.inputBindings, outputDir: req.outputDir },
            sendLog,
          );

          const complete: ExecCompleteEvent = {
            runId,
            exitCode: result.exitCode,
            outputFiles: result.outputFiles,
            error: result.error,
          };
          win?.webContents.send(IPCChannel.EXEC_COMPLETE, complete);

          if (result.exitCode === 0) {
            notify(`${req.workflow.name} complete`, `Finished successfully — ${result.outputFiles.length} output file(s).`);
          } else {
            notify(`${req.workflow.name} failed`, `Exited with code ${result.exitCode}.`);
            errorLogger.logRunFailure({
              projectId: req.projectId,
              workflowId: req.workflow.id,
              workflowName: req.workflow.name,
              exitCode: result.exitCode,
              command: builtCommand,
              stderrTail: result.error,
            });
          }

          if (req.projectId) {
            historyStore.append(req.projectId, {
              id: runId,
              workflowId: req.workflow.id,
              workflowName: req.workflow.name,
              startedAt: new Date(startedAt).toISOString(),
              durationMs: Date.now() - startedAt,
              success: result.exitCode === 0,
              exitCode: result.exitCode,
              outputFiles: result.outputFiles,
            });
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          sendLog('system', `Error: ${msg}`);
          const complete: ExecCompleteEvent = { runId, exitCode: -1, outputFiles: [], error: msg };
          win?.webContents.send(IPCChannel.EXEC_COMPLETE, complete);
          notify(`${req.workflow.name} failed`, msg.slice(0, 100));
          errorLogger.logRunCrash({
            projectId: req.projectId,
            workflowId: req.workflow.id,
            error: msg,
          });

          if (req.projectId) {
            historyStore.append(req.projectId, {
              id: runId,
              workflowId: req.workflow.id,
              workflowName: req.workflow.name,
              startedAt: new Date(startedAt).toISOString(),
              durationMs: Date.now() - startedAt,
              success: false,
              exitCode: -1,
              outputFiles: [],
              error: msg,
            });
          }
        } finally {
          activeExecutor = null;
          activeRunId = null;
        }
      })();

      return { ok: true, runId };
    },
  );

  // ── analyzer:run ───────────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.ANALYZER_RUN,
    async (_event, req: AnalyzerRunRequest): Promise<AnalyzerRunResponse> => {
      try {
        const analyzer = new Analyzer(docker, scriptsDir);
        const repoDir = resolveAppPath(req.repoDir);
        const dump = await analyzer.analyze(repoDir, req.dockerImage);
        return { ok: true, dump };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
  );

  // ── config:get ─────────────────────────────────────────────────────────
  ipcMain.handle(IPCChannel.CONFIG_GET, (): ConfigGetResponse => {
    const config = configManager.getConfig();
    return { config, hasApiKey: configManager.hasApiKey() };
  });

  // ── config:set ─────────────────────────────────────────────────────────
  ipcMain.handle(IPCChannel.CONFIG_SET, (_event, req: ConfigSetRequest): void => {
    configManager.setConfig(req);
  });

  // ── config:validateKey ─────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.CONFIG_VALIDATE_KEY,
    async (_event, req: ValidateKeyRequest): Promise<ValidateKeyResponse> => {
      if (req.provider === 'openai') return OpenAIClient.validateKey(req.apiKey);
      return LLMClient.validateKey(req.apiKey);
    },
  );

  // ── schema:generate ────────────────────────────────────────────────────
  // Generates a UISchema from a CapabilityDump via the LLM.
  // Sends ANALYSIS_PROGRESS push events during processing.
  ipcMain.handle(
    IPCChannel.SCHEMA_GENERATE,
    async (_event, req: SchemaGenerateRequest): Promise<SchemaGenerateResponse> => {
      const win = getWindow();

      const sendProgress = (event: AnalysisProgressEvent) => {
        win?.webContents.send(IPCChannel.ANALYSIS_PROGRESS, event);
      };

      try {
        const config = configManager.getConfig();

        if (!config.anthropicApiKey && !config.openaiApiKey && !config.mockMode) {
          return { ok: false, error: 'No API key configured. Please add your API key in settings.' };
        }

        const llmClient = makeLLMClient(config);

        const analyzer = new Analyzer(docker, scriptsDir);

        let schema;
        let warnings: string[] = [];

        if (req.currentSchema && req.feedback) {
          // Refinement with feedback
          schema = await analyzer.refineSchema(
            req.dump.repoDir,
            req.dockerImage,
            req.currentSchema,
            llmClient,
            sendProgress,
            req.feedback,
            req.dump.stack.analyzerCommand,
          );
        } else {
          // Fresh generation
          const result = await analyzer.analyzeAndGenerate(
            req.dump.repoDir,
            req.dockerImage,
            llmClient,
            sendProgress,
            { forceRegenerate: req.forceRegenerate },
            req.dump.stack.analyzerCommand,
          );
          schema = result.schema;
          warnings = result.warnings;
        }

        if (warnings.length > 0) {
          errorLogger.logSchemaWarnings({
            dockerImage: req.dockerImage,
            warnings,
            repaired: true, // two-turn repair already attempted
          });
        }

        return { ok: true, schema, warnings: warnings.length > 0 ? warnings : undefined };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendProgress({ stage: 'error', message: msg });
        errorLogger.logSchemaError({ dockerImage: req.dockerImage, error: msg });
        return { ok: false, error: msg };
      }
    },
  );

  // ── exec:autofix ───────────────────────────────────────────────────────
  // Two-turn: (1) diagnose the error class, (2) fix the command with diagnosis context.
  ipcMain.handle(
    IPCChannel.EXEC_AUTOFIX,
    async (_event, req: ExecAutofixRequest): Promise<ExecAutofixResponse> => {
      const config = configManager.getConfig();

      if (config.mockMode || (!config.anthropicApiKey && !config.openaiApiKey)) {
        return { ok: false, error: 'Auto-fix requires an API key. Add one in Settings.' };
      }

      try {
        const llm = makeLLMClient(config) as LLMClient | OpenAIClient;

        // Turn 1: classify the error (small call, 256 tokens)
        let diagnosis: { errorClass: string; shortReason: string; relevantLine?: string | null } | undefined;
        try {
          const diagnoseText = await llm.rawComplete(buildDiagnosePrompt(req.errorOutput, req.failedCommand), TOKEN_LIMITS.diagnosis);
          const ds = diagnoseText.replace(/^```json\s*/m, '').replace(/```\s*$/m, '').trim();
          const df = ds.indexOf('{'); const dl = ds.lastIndexOf('}');
          if (df !== -1 && dl !== -1) {
            const dp = JSON.parse(ds.slice(df, dl + 1)) as { errorClass: string; shortReason: string; relevantLine?: string | null };
            if (dp.errorClass && dp.shortReason) diagnosis = dp;
          }
        } catch {
          // Diagnosis is best-effort; continue without it
        }

        // Turn 2: fix the command, with diagnosis context and actual input values
        const prompt = buildFixCommandPrompt(
          req.workflow,
          req.failedCommand,
          req.errorOutput,
          req.inputValues,
          diagnosis,
        );
        const text = await llm.rawComplete(prompt);

        // Strip markdown fences if present, then extract the JSON object
        const stripped = text.replace(/^```json\s*/m, '').replace(/```\s*$/m, '').trim();
        const firstBrace = stripped.indexOf('{');
        const lastBrace = stripped.lastIndexOf('}');
        if (firstBrace === -1 || lastBrace === -1) {
          return { ok: false, error: 'Auto-fix: LLM returned no JSON object. Try again or check your API key.' };
        }

        let parsed: { execute?: ExecAutofixResponse['execute']; explanation?: string };
        try {
          parsed = JSON.parse(stripped.slice(firstBrace, lastBrace + 1)) as { execute?: ExecAutofixResponse['execute']; explanation?: string };
        } catch (parseErr) {
          const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          return { ok: false, error: `Auto-fix: could not parse LLM response (${parseMsg}). The model may have returned malformed JSON.` };
        }

        if (!parsed.execute || !parsed.explanation) {
          return { ok: false, error: 'Auto-fix: LLM response was missing the execution config or explanation.' };
        }

        const updatedWorkflow: Workflow = {
          ...req.workflow,
          execute: buildUpdatedExecute(req.workflow.execute, parsed.execute),
        };

        // Validate that user-text placeholders from the original template are preserved.
        // The LLM sometimes replaces {output_filename} with the literal value used in the
        // failed run (e.g. "merged.pdf"), which permanently breaks the template for future runs.
        const originalCmd = describeExecution(req.workflow);
        const fixedCmd = describeExecution(updatedWorkflow);
        const droppedPlaceholders = (req.workflow.steps ?? [])
          .filter((s) => s.type !== 'file_input' && s.type !== 'directory_input')
          .map((s) => s.id)
          .filter((id) => originalCmd.includes(`{${id}}`) && !fixedCmd.includes(`{${id}}`));
        if (droppedPlaceholders.length > 0) {
          return {
            ok: false,
            error: `Auto-fix dropped required input placeholder(s): {${droppedPlaceholders.join('}, {')}}.  The AI hardcoded a literal value instead of keeping the variable. Please try again.`,
          };
        }

        const warnings = validateSchemaWarnings({
          projectId: 'autofix',
          projectName: 'Auto-fix',
          description: 'Validation wrapper',
          version: '1.0.0',
          dockerImage: req.workflow.id,
          workflows: [updatedWorkflow],
        });
        if (warnings.length > 0) {
          return { ok: false, error: `Auto-fix produced an invalid workflow: ${warnings.join('; ')}` };
        }

        errorLogger.logAutofix({
          workflowId: req.workflow.id,
          ok: true,
          errorClass: diagnosis?.errorClass,
          shortReason: diagnosis?.shortReason,
          explanation: parsed.explanation,
        });

        return {
          ok: true,
          execute: {
            executable: updatedWorkflow.execute.executable,
            args: updatedWorkflow.execute.args,
            shellScript: updatedWorkflow.execute.shellScript,
          },
          explanation: parsed.explanation,
          diagnosis: diagnosis ? { errorClass: diagnosis.errorClass, shortReason: diagnosis.shortReason } : undefined,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errorLogger.logAutofix({ workflowId: req.workflow.id, ok: false, error: msg });
        return { ok: false, error: msg };
      }
    },
  );

  // ── schema:save ────────────────────────────────────────────────────────
  // Persists a (possibly fixed) schema to the project's cache directory.
  ipcMain.handle(
    IPCChannel.SCHEMA_SAVE,
    async (_event, req: SchemaSaveRequest): Promise<SchemaSaveResponse> => {
      try {
        const warnings = validateSchemaWarnings(req.schema);
        if (warnings.length > 0) {
          return { ok: false, saved: false, error: `Schema is invalid: ${warnings.join('; ')}` };
        }
        const saved = schemaCache.saveByDockerImage(req.schema);
        return { ok: true, saved };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, saved: false, error: msg };
      }
    },
  );

  // ── github:search ──────────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.GITHUB_SEARCH,
    async (_event, req: GithubSearchRequest): Promise<GithubSearchResponse> => {
      return githubClient.search(req.query);
    },
  );

  // ── project:install ────────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.PROJECT_INSTALL,
    async (_event, req: ProjectInstallRequest): Promise<ProjectInstallResponse> => {
      const win = getWindow();

      const sendProgress = (event: InstallProgressEvent) => {
        win?.webContents.send(IPCChannel.PROJECT_INSTALL_PROGRESS, event);
      };

      try {
        const config = configManager.getConfig();
        const llmClient = makeLLMClient(config);

        const meta = await projectManager.install(
          req.owner,
          req.repo,
          req.searchResult,
          llmClient,
          sendProgress,
        );

        notify(`${req.owner}/${req.repo} ready`, 'Tool installed and ready to use.');
        return { ok: true, meta };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        notify(`${req.owner}/${req.repo} install failed`, msg.slice(0, 100));
        errorLogger.logInstallError({ owner: req.owner, repo: req.repo, error: msg });
        return { ok: false, error: msg };
      }
    },
  );

  // ── project:list ───────────────────────────────────────────────────────
  ipcMain.handle(IPCChannel.PROJECT_LIST, (): ProjectListResponse => {
    return { projects: projectManager.listInstalled() };
  });

  // ── project:get ────────────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.PROJECT_GET,
    (_event, req: ProjectGetRequest): ProjectGetResponse => {
      const meta = projectManager.getMeta(req.projectId);
      if (!meta) return { ok: false, error: `Project "${req.projectId}" not found` };

      const schema = projectManager.getSchema(req.projectId);
      return { ok: true, meta, schema: schema ?? undefined };
    },
  );

  // ── project:remove ─────────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.PROJECT_REMOVE,
    async (_event, req: ProjectRemoveRequest): Promise<{ ok: boolean; error?: string }> => {
      try {
        await projectManager.uninstall(req.projectId);
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
  );

  // ── project:openFolder ─────────────────────────────────────────────────
  ipcMain.handle(IPCChannel.PROJECT_OPEN_FOLDER, (_event, projectId: string): void => {
    const folderPath = projectManager.openFolder(projectId);
    if (folderPath) shell.openPath(folderPath);
  });

  // ── file:open ──────────────────────────────────────────────────────────
  ipcMain.handle(IPCChannel.FILE_OPEN, async (_event, filePath: string): Promise<void> => {
    await shell.openPath(filePath);
  });

  // ── file:getInfo ───────────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.FILE_GET_INFO,
    (_event, req: FileGetInfoRequest): FileGetInfoResponse => {
      try {
        const stats = fs.statSync(req.filePath);
        const ext = path.extname(req.filePath).toLowerCase();
        const type = categorizeFile(ext);
        const previewable = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext);
        return {
          ok: true,
          info: {
            name: path.basename(req.filePath),
            path: req.filePath,
            size: stats.size,
            sizeLabel: formatFileSize(stats.size),
            extension: ext,
            type,
            previewable,
          } satisfies FileInfo,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
  );

  // ── file:scan ─────────────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.FILE_SCAN,
    (_event, req: FileScanRequest): FileScanResponse => {
      try {
        const filePath = resolveAppPath(req.filePath);
        const context = fileContextService.scan(filePath);
        return { ok: true, context };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
  );

  // ── file:listRecents ──────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.FILE_LIST_RECENTS,
    (): FileListRecentsResponse => {
      return { recents: fileContextService.listRecents() };
    },
  );

  // ── file:applyChanges ────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.FILE_APPLY_CHANGES,
    (_event, req: FileApplyChangesRequest): FileApplyChangesResponse => {
      try {
        const filePath = resolveAppPath(req.filePath);
        const context = fileContextService.applyChanges(filePath, req.changes);
        return { ok: true, context };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
  );

  // ── app:confirm ────────────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.APP_CONFIRM,
    async (_event, req: AppConfirmRequest): Promise<AppConfirmResponse> => {
      const win = getWindow();
      const result = await dialog.showMessageBox(win ?? new BrowserWindow(), {
        type: 'question',
        buttons: [req.confirmLabel ?? 'Confirm', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        title: req.title,
        message: req.message,
        detail: req.detail,
      });
      return { confirmed: result.response === 0 };
    },
  );

  // ── app:clipboardWrite ─────────────────────────────────────────────────
  ipcMain.handle(IPCChannel.APP_CLIPBOARD_WRITE, (_event, text: string): void => {
    clipboard.writeText(text);
  });

  // ── app:notify ─────────────────────────────────────────────────────────
  ipcMain.handle(IPCChannel.APP_NOTIFY, (_event, req: AppNotifyRequest): void => {
    notify(req.title, req.body);
  });

  // ── app:openExternal ──────────────────────────────────────────────────
  ipcMain.handle(IPCChannel.APP_OPEN_EXTERNAL, async (_event, url: string): Promise<void> => {
    await shell.openExternal(url);
  });

  // ── folder:scan ───────────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.FOLDER_SCAN,
    (_event, req: FolderScanRequest): FolderScanResponse => {
      try {
        const folderPath = resolveAppPath(req.folderPath);
        const context = folderContextService.scan(folderPath);
        return { ok: true, context };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
  );

  // ── folder:listRecents ────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.FOLDER_LIST_RECENTS,
    (): FolderListRecentsResponse => {
      return { recents: folderContextService.listRecents() };
    },
  );

  // ── folder:run ────────────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.FOLDER_RUN,
    (_event, req: FolderRunRequest): FolderRunResponse => {
      const win = getWindow();

      if (activeExecutor || activeFolderRunner) {
        const activeId = activeRunId ?? activeFolderRunId;
        return {
          ok: false,
          error: `Another run is already in progress${activeId ? ` (${activeId})` : ''}.`,
        };
      }

      try {
        const folderPath = resolveAppPath(req.folderPath);
        const action = folderContextService.findAction(folderPath, req.actionId);
        if (!action) {
          return { ok: false, error: 'That action is no longer available for this folder.' };
        }
        if (action.type !== 'run' || !action.commandPreview) {
          return { ok: false, error: 'This action cannot be run directly.' };
        }

        const runId = randomUUID();
        const runner = new FolderActionRunner();
        activeFolderRunner = runner;
        activeFolderRunId = runId;

        const sendLog = (stream: FolderRunLogEvent['stream'], line: string) => {
          const event: FolderRunLogEvent = {
            runId,
            stream,
            line,
            timestamp: Date.now(),
          };
          win?.webContents.send(IPCChannel.FOLDER_RUN_LOG, event);
        };

        runner.run(action.commandPreview, folderPath, {
          onLog: sendLog,
          onUrl: (url) => {
            const event: FolderRunUrlEvent = {
              runId,
              url,
              timestamp: Date.now(),
            };
            win?.webContents.send(IPCChannel.FOLDER_RUN_URL, event);
          },
          onComplete: (result) => {
            const event: FolderRunCompleteEvent = {
              runId,
              exitCode: result.exitCode,
              error: result.error,
              canceled: result.canceled,
            };
            win?.webContents.send(IPCChannel.FOLDER_RUN_COMPLETE, event);
            activeFolderRunner = null;
            activeFolderRunId = null;
          },
        });

        return { ok: true, runId, action };
      } catch (err: unknown) {
        activeFolderRunner = null;
        activeFolderRunId = null;
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
  );

  // ── folder:cancel ─────────────────────────────────────────────────────
  ipcMain.handle(IPCChannel.FOLDER_CANCEL, async (): Promise<void> => {
    if (!activeFolderRunner) return;
    await activeFolderRunner.cancel();
  });

  // ── project:improve ────────────────────────────────────────────────────
  // Refines an installed project's schema with user feedback via the LLM.
  ipcMain.handle(
    IPCChannel.PROJECT_IMPROVE,
    async (_event, req: ProjectImproveRequest): Promise<ProjectImproveResponse> => {
      const config = configManager.getConfig();

      if (!config.anthropicApiKey && !config.openaiApiKey && !config.mockMode) {
        return { ok: false, error: 'No API key configured. Add one in Settings.' };
      }

      const meta = projectManager.getMeta(req.projectId);
      if (!meta) {
        return { ok: false, error: `Project "${req.projectId}" not found` };
      }

      try {
        const llmClient = makeLLMClient(config);
        const analyzer = new Analyzer(docker, scriptsDir);
        const refined = await analyzer.refineSchema(
          meta.repoDir,
          meta.dockerImage,
          req.currentSchema,
          llmClient,
          () => {},
          req.feedback,
          meta.analyzerCommand,
        );

        // Persist the improved schema so it loads correctly next time
        const schemaPath = path.join(getProjectsDir(), req.projectId, 'schema.json');
        fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
        fs.writeFileSync(schemaPath, JSON.stringify(refined, null, 2), 'utf8');

        return { ok: true, schema: refined };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
  );

  // ── project:generateUi ─────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.PROJECT_GENERATE_UI,
    async (_event, req: ProjectGenerateUiRequest): Promise<ProjectGenerateUiResponse> => {
      const win = getWindow();
      const config = configManager.getConfig();

      if (!config.anthropicApiKey && !config.openaiApiKey && !config.mockMode) {
        return { ok: false, error: 'No API key configured.' };
      }

      const sendProgress = (event: InstallProgressEvent) => {
        win?.webContents.send(IPCChannel.PROJECT_INSTALL_PROGRESS, event);
      };

      try {
        const llmClient = makeLLMClient(config);
        const schema = await projectManager.generateSchema(req.projectId, llmClient, sendProgress);
        return { ok: true, schema };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
  );

  // ── workflow:add ────────────────────────────────────────────────────────
  // LLM checks feasibility and generates a new Workflow for an installed project.
  ipcMain.handle(
    IPCChannel.WORKFLOW_ADD,
    async (_event, req: WorkflowAddRequest): Promise<WorkflowAddResponse> => {
      const config = configManager.getConfig();

      if (!config.anthropicApiKey && !config.openaiApiKey && !config.mockMode) {
        return { ok: false, error: 'No API key configured. Add one in Settings.' };
      }

      try {
        const llmClient = makeLLMClient(config);
        if (!('rawComplete' in llmClient)) {
          return { ok: false, error: 'Mock mode does not support workflow generation.' };
        }
        const raw = await (llmClient as LLMClient | OpenAIClient).rawComplete(buildAddWorkflowPrompt(req.description, req.currentSchema));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parsed: any;
        try {
          const trimmed = raw.replace(/^```json\s*/m, '').replace(/```\s*$/m, '').trim();
          const firstBrace = trimmed.indexOf('{');
          const lastBrace = trimmed.lastIndexOf('}');
          parsed = JSON.parse(firstBrace === -1 || lastBrace === -1 ? '{}' : trimmed.slice(firstBrace, lastBrace + 1));
        } catch {
          return { ok: false, error: 'AI returned malformed JSON for workflow generation. Please try again.' };
        }

        if (parsed.feasible === false) {
          return { ok: true, infeasible: (parsed.reason as string) ?? 'Not feasible for this tool.' };
        }

        if (!parsed.feasible || !parsed.workflow) {
          return { ok: false, error: 'Unexpected response from AI.' };
        }

        const updatedSchema = {
          ...req.currentSchema,
          workflows: [...req.currentSchema.workflows, parsed.workflow as Workflow],
        };

        const warnings = validateSchemaWarnings(updatedSchema);
        if (warnings.length > 0) {
          return { ok: false, error: `AI returned an invalid workflow: ${warnings.join('; ')}` };
        }

        // Persist updated schema
        const schemaPath = path.join(getProjectsDir(), req.projectId, 'schema.json');
        fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
        fs.writeFileSync(schemaPath, JSON.stringify(updatedSchema, null, 2), 'utf8');

        return { ok: true, schema: updatedSchema };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
  );

  // ── github:recommend ────────────────────────────────────────────────────
  // LLM suggests GitHub repos matching a natural-language description.
  ipcMain.handle(
    IPCChannel.GITHUB_RECOMMEND,
    async (_event, req: GithubRecommendRequest): Promise<GithubRecommendResponse> => {
      const config = configManager.getConfig();

      if (!config.anthropicApiKey && !config.openaiApiKey && !config.mockMode) {
        return { ok: false, error: 'No API key configured. Add one in Settings.' };
      }

      try {
        const llmClient = makeLLMClient(config);
        if (!('rawComplete' in llmClient)) {
          return { ok: false, error: 'Mock mode does not support AI recommendations.' };
        }
        const raw = await (llmClient as LLMClient | OpenAIClient).rawComplete(buildRepoRecommendationPrompt(req.description));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parsed: any;
        try {
          const trimmed = raw.trim();
          parsed = JSON.parse(trimmed || '[]');
        } catch {
          return { ok: false, error: 'AI returned malformed JSON for recommendations. Please try again.' };
        }

        if (!Array.isArray(parsed)) {
          return { ok: false, error: 'Unexpected response from AI.' };
        }

        return { ok: true, repos: parsed };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
  );

  // ── project:getHistory ─────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.PROJECT_GET_HISTORY,
    (_event, req: ProjectGetHistoryRequest): ProjectGetHistoryResponse => {
      const records = historyStore.list(req.projectId);
      return { ok: true, records };
    },
  );

  // ── project:clearHistory ───────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.PROJECT_CLEAR_HISTORY,
    (_event, projectId: string): void => {
      historyStore.clear(projectId);
    },
  );

  // ── workflow:fill ──────────────────────────────────────────────────────
  // LLM maps a natural-language description to form field values.
  ipcMain.handle(
    IPCChannel.WORKFLOW_FILL,
    async (_event, req: WorkflowFillRequest): Promise<WorkflowFillResponse> => {
      const config = configManager.getConfig();

      if (!config.anthropicApiKey && !config.openaiApiKey && !config.mockMode) {
        return { ok: false, error: 'No API key configured. Add one in Settings.' };
      }

      try {
        const llmClient = makeLLMClient(config);
        if (!('rawComplete' in llmClient)) {
          return { ok: false, error: 'Mock mode does not support form fill.' };
        }
        const raw = await (llmClient as LLMClient | OpenAIClient).rawComplete(buildFormFillPrompt(req.description, req.workflow));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parsed: any;
        try {
          const trimmed = raw.trim();
          parsed = JSON.parse(trimmed || '{}');
        } catch {
          return { ok: false, error: 'AI returned malformed JSON for form fill. Please try again.' };
        }
        return { ok: true, values: parsed as Record<string, unknown> };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
  );

  // ── project:checkUpdate ────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.PROJECT_CHECK_UPDATE,
    async (_event, req: ProjectCheckUpdateRequest): Promise<ProjectCheckUpdateResponse> => {
      try {
        const result = await projectManager.checkForUpdates(req.projectId);
        return { ok: true, ...result };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
  );

  // ── errorLog:get ──────────────────────────────────────────────────────
  // Returns all logged error records (newest first), plus the log file path.
  ipcMain.handle(IPCChannel.ERROR_LOG_GET, (): ErrorLogGetResponse => {
    const records = errorLogger.getAll();
    return {
      records,
      logPath: errorLogger.getLogPath(),
      total: records.length,
    };
  });

  // ── errorLog:clear ────────────────────────────────────────────────────
  ipcMain.handle(IPCChannel.ERROR_LOG_CLEAR, (): void => {
    errorLogger.clear();
  });

  // ── project:applyUpdate ────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.PROJECT_APPLY_UPDATE,
    async (_event, req: ProjectApplyUpdateRequest): Promise<ProjectApplyUpdateResponse> => {
      const win = getWindow();
      const config = configManager.getConfig();

      if (!config.anthropicApiKey && !config.openaiApiKey && !config.mockMode) {
        return { ok: false, error: 'No API key configured. Add one in Settings.' };
      }

      const sendProgress = (event: InstallProgressEvent) => {
        win?.webContents.send(IPCChannel.PROJECT_INSTALL_PROGRESS, event);
      };

      try {
        const llmClient = makeLLMClient(config);
        const schema = await projectManager.applyUpdate(req.projectId, llmClient, sendProgress);
        return { ok: true, schema };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    },
  );
}
