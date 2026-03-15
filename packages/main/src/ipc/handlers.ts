import { ipcMain, BrowserWindow, shell, dialog, app, clipboard } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  IPCChannel,
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
  type AppConfirmRequest,
  type AppConfirmResponse,
  type InstallProgressEvent,
} from '@gui-bridge/shared';

import { DockerManager } from '../docker/index.js';
import { buildCommand, collectInputFiles } from '../executor/index.js';
import { Analyzer } from '../analyzer/index.js';
import { LLMClient, MockLLMClient, type ILLMClient } from '../analyzer/LLMClient.js';
import { OpenAIClient } from '../analyzer/OpenAIClient.js';
import type { AppConfig } from '@gui-bridge/shared';
import { SchemaCache } from '../analyzer/SchemaCache.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { buildFixCommandPrompt } from '../analyzer/prompts/fix-command.js';
import { buildAddWorkflowPrompt } from '../analyzer/prompts/add-workflow.js';
import { buildRepoRecommendationPrompt } from '../analyzer/prompts/recommend-repos.js';
import { buildFormFillPrompt } from '../analyzer/prompts/fill-form.js';
import { GitHubClient } from '../github/GitHubClient.js';
import { ProjectManager } from '../projects/ProjectManager.js';
import { HistoryStore } from '../projects/HistoryStore.js';

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
const configManager = new ConfigManager();
const schemaCache = new SchemaCache();
const githubClient = new GitHubClient();
const historyStore = new HistoryStore();

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

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {

  // ProjectManager is instantiated here so app.getAppPath() is available
  const scriptsDir = path.join(app.getAppPath(), 'packages/main/src/analyzer/analyzer-scripts');
  const projectManager = new ProjectManager(docker, scriptsDir);

  // ── app:getPath ────────────────────────────────────────────────────────
  ipcMain.handle(IPCChannel.APP_GET_PATH, (_event, name: string): string => {
    return app.getPath(name as Parameters<typeof app.getPath>[0]);
  });

  // ── docker:health ──────────────────────────────────────────────────────
  ipcMain.handle(IPCChannel.DOCKER_HEALTH, async (): Promise<DockerHealthResponse> => {
    return docker.checkHealth();
  });

  // ── docker:build ───────────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.DOCKER_BUILD,
    async (_event, req: DockerBuildRequest): Promise<DockerBuildResponse> => {
      // Check if image already exists — skip build if so
      const exists = await docker.imageExists(req.tag);
      if (exists) {
        const win = getWindow();
        const event: ExecLogEvent = {
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
          const event: ExecLogEvent = { stream, line, timestamp: Date.now() };
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
        const event: ExecLogEvent = { stream, line, timestamp: Date.now() };
        win?.webContents.send(IPCChannel.EXEC_LOG, event);
      };

      try {
        const result = await docker.runCommand(
          req.image,
          req.command,
          { inputDir, outputDir, env: req.env },
          sendLog,
        );

        const complete: ExecCompleteEvent = {
          exitCode: result.exitCode,
          outputFiles: result.outputFiles,
          error: result.error,
        };
        win?.webContents.send(IPCChannel.EXEC_COMPLETE, complete);

        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendLog('system', `Error: ${msg}`);
        const complete: ExecCompleteEvent = { exitCode: -1, outputFiles: [], error: msg };
        win?.webContents.send(IPCChannel.EXEC_COMPLETE, complete);
        return { ok: false, error: msg };
      } finally {
        if (ownedInput && inputDir) docker.removeTempDir(inputDir);
        // outputDir is intentionally kept so the renderer can open files
      }
    },
  );

  // ── exec:cancel ────────────────────────────────────────────────────────
  ipcMain.handle(IPCChannel.EXEC_CANCEL, async (): Promise<void> => {
    await docker.cancelRunning();
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
  // auto-builds image if needed, runs container, streams logs.
  ipcMain.handle(
    IPCChannel.EXEC_SCHEMA_RUN,
    async (_event, req: ExecSchemaRunRequest): Promise<ExecRunResponse> => {
      const win = getWindow();
      const startedAt = Date.now();

      const sendLog = (stream: 'stdout' | 'stderr' | 'system', line: string) => {
        const event: ExecLogEvent = { stream, line, timestamp: Date.now() };
        win?.webContents.send(IPCChannel.EXEC_LOG, event);
      };

      // Build or reuse Docker image
      if (req.dockerfilePath) {
        const exists = await docker.imageExists(req.dockerImage);
        if (!exists) {
          const dockerfilePath = resolveAppPath(req.dockerfilePath);
          const contextPath = resolveAppPath('.');
          const buildResult = await docker.buildImage(
            req.dockerImage,
            dockerfilePath,
            contextPath,
            sendLog,
          );
          if (!buildResult.ok) {
            const complete: ExecCompleteEvent = {
              exitCode: 1,
              outputFiles: [],
              error: buildResult.error,
            };
            win?.webContents.send(IPCChannel.EXEC_COMPLETE, complete);
            return { ok: false, error: buildResult.error };
          }
        } else {
          sendLog('system', `Image "${req.dockerImage}" already exists — skipping build.`);
        }
      }

      // Build command from template + inputs
      const builtCommand = buildCommand(req.workflow, req.inputs);
      sendLog('system', `Command: ${builtCommand}`);

      // Collect input files for volume mount
      const inputFilePaths = collectInputFiles(req.workflow, req.inputs);

      // Prepare directories
      const tempOutputDir = docker.createTempDir('output');
      let inputDir: string | undefined;
      let ownedInput = false;

      if (inputFilePaths.length > 0) {
        inputDir = docker.createTempDir('input');
        ownedInput = true;
        for (const src of inputFilePaths) {
          const dest = path.join(inputDir, path.basename(src));
          fs.copyFileSync(src, dest);
        }
      }

      try {
        const result = await docker.runCommand(
          req.dockerImage,
          [builtCommand],
          { inputDir, outputDir: tempOutputDir, useShell: true, network: 'bridge' },
          sendLog,
        );

        // Copy output files to user's chosen directory (or keep in temp dir)
        let outputFiles = result.outputFiles;
        if (req.outputDir && result.outputFiles.length > 0) {
          fs.mkdirSync(req.outputDir, { recursive: true });
          outputFiles = result.outputFiles.map((src) => {
            const dest = path.join(req.outputDir!, path.basename(src));
            fs.copyFileSync(src, dest);
            return dest;
          });
        }

        const complete: ExecCompleteEvent = {
          exitCode: result.exitCode,
          outputFiles,
          error: result.error,
        };
        win?.webContents.send(IPCChannel.EXEC_COMPLETE, complete);

        // Persist run to history
        if (req.projectId) {
          historyStore.append(req.projectId, {
            id: String(Date.now()),
            workflowId: req.workflow.id,
            workflowName: req.workflow.name,
            startedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
            success: result.exitCode === 0,
            exitCode: result.exitCode,
            outputFiles,
          });
        }

        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendLog('system', `Error: ${msg}`);
        const complete: ExecCompleteEvent = { exitCode: -1, outputFiles: [], error: msg };
        win?.webContents.send(IPCChannel.EXEC_COMPLETE, complete);

        if (req.projectId) {
          historyStore.append(req.projectId, {
            id: String(Date.now()),
            workflowId: req.workflow.id,
            workflowName: req.workflow.name,
            startedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
            success: false,
            exitCode: -1,
            outputFiles: [],
            error: msg,
          });
        }

        return { ok: false, error: msg };
      } finally {
        if (ownedInput && inputDir) docker.removeTempDir(inputDir);
        docker.removeTempDir(tempOutputDir);
      }
    },
  );

  // ── analyzer:run ───────────────────────────────────────────────────────
  ipcMain.handle(
    IPCChannel.ANALYZER_RUN,
    async (_event, req: AnalyzerRunRequest): Promise<AnalyzerRunResponse> => {
      try {
        const scriptsDir = path.join(
          app.getAppPath(),
          'packages/main/src/analyzer/analyzer-scripts',
        );
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

        const scriptsDir = path.join(
          app.getAppPath(),
          'packages/main/src/analyzer/analyzer-scripts',
        );
        const analyzer = new Analyzer(docker, scriptsDir);

        let schema;

        if (req.currentSchema && req.feedback) {
          // Refinement with feedback
          schema = await analyzer.refineSchema(
            req.dump.repoDir,
            req.dockerImage,
            req.currentSchema,
            llmClient,
            sendProgress,
            req.feedback,
          );
        } else {
          // Fresh generation
          schema = await analyzer.analyzeAndGenerate(
            req.dump.repoDir,
            req.dockerImage,
            llmClient,
            sendProgress,
            { forceRegenerate: req.forceRegenerate },
          );
        }

        return { ok: true, schema };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendProgress({ stage: 'error', message: msg });
        return { ok: false, error: msg };
      }
    },
  );

  // ── exec:autofix ───────────────────────────────────────────────────────
  // Asks Claude to suggest a fixed command template after a failed run.
  ipcMain.handle(
    IPCChannel.EXEC_AUTOFIX,
    async (_event, req: ExecAutofixRequest): Promise<ExecAutofixResponse> => {
      const config = configManager.getConfig();

      if (config.mockMode || (!config.anthropicApiKey && !config.openaiApiKey)) {
        return { ok: false, error: 'Auto-fix requires an API key. Add one in Settings.' };
      }

      try {
        const llm = makeLLMClient(config) as LLMClient | OpenAIClient;
        const prompt = buildFixCommandPrompt(req.workflow, req.failedCommand, req.errorOutput);
        const text = await llm.rawComplete(prompt);

        // Strip markdown fences if present, then extract the JSON object
        const stripped = text.replace(/^```json\s*/m, '').replace(/```\s*$/m, '').trim();
        const firstBrace = stripped.indexOf('{');
        const lastBrace = stripped.lastIndexOf('}');
        if (firstBrace === -1 || lastBrace === -1) {
          return { ok: false, error: 'Could not parse fix suggestion from LLM response.' };
        }

        const parsed = JSON.parse(stripped.slice(firstBrace, lastBrace + 1)) as {
          template: string;
          explanation: string;
        };

        if (!parsed.template || !parsed.explanation) {
          return { ok: false, error: 'LLM response missing template or explanation.' };
        }

        return { ok: true, template: parsed.template, explanation: parsed.explanation };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
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

        return { ok: true, meta };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
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
        );

        // Persist the improved schema so it loads correctly next time
        const schemaPath = path.join(os.homedir(), '.gui-bridge', 'projects', req.projectId, 'schema.json');
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
        const parsed = JSON.parse(raw.trim());

        if (parsed.feasible === false) {
          return { ok: true, infeasible: parsed.reason ?? 'Not feasible for this tool.' };
        }

        if (!parsed.feasible || !parsed.workflow) {
          return { ok: false, error: 'Unexpected response from AI.' };
        }

        const updatedSchema = {
          ...req.currentSchema,
          workflows: [...req.currentSchema.workflows, parsed.workflow],
        };

        // Persist updated schema
        const schemaPath = path.join(os.homedir(), '.gui-bridge', 'projects', req.projectId, 'schema.json');
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
        const parsed = JSON.parse(raw.trim());

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
        const trimmed = raw.trim();
        const parsed = JSON.parse(trimmed === '' ? '{}' : trimmed);
        return { ok: true, values: parsed };
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
