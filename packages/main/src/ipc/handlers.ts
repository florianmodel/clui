import { ipcMain, BrowserWindow, shell, dialog, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
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
} from '@gui-bridge/shared';

import { DockerManager } from '../docker/index.js';
import { buildCommand, collectInputFiles } from '../executor/index.js';
import { Analyzer } from '../analyzer/index.js';
import { LLMClient, MockLLMClient } from '../analyzer/LLMClient.js';
import { ConfigManager } from '../config/ConfigManager.js';

const docker = new DockerManager();
const configManager = new ConfigManager();

/** Resolve a path that may be relative (from renderer) to an absolute host path. */
function resolveAppPath(p: string): string {
  if (path.isAbsolute(p)) return p;
  // app.getAppPath() returns the project root (where root package.json lives)
  return path.resolve(app.getAppPath(), p);
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {

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
      const commandParts = builtCommand.split(/\s+/).filter(Boolean);

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
          commandParts,
          { inputDir, outputDir: tempOutputDir },
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
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        sendLog('system', `Error: ${msg}`);
        const complete: ExecCompleteEvent = { exitCode: -1, outputFiles: [], error: msg };
        win?.webContents.send(IPCChannel.EXEC_COMPLETE, complete);
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
        const useMock = config.mockMode === true || !config.anthropicApiKey;

        if (!config.anthropicApiKey && !config.mockMode) {
          return { ok: false, error: 'No API key configured. Please add your Anthropic API key in settings.' };
        }

        const llmClient = useMock
          ? new MockLLMClient()
          : new LLMClient(config.anthropicApiKey!);

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
}
