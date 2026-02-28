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
} from '@gui-bridge/shared';
import { DockerManager } from '../docker/index.js';

const docker = new DockerManager();

/** Resolve a path that may be relative (from renderer) to an absolute host path. */
function resolveAppPath(p: string): string {
  if (path.isAbsolute(p)) return p;
  // app.getAppPath() returns the project root (where root package.json lives)
  return path.resolve(app.getAppPath(), p);
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {

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

  // ── file:showInFinder ──────────────────────────────────────────────────
  ipcMain.handle(IPCChannel.FILE_SHOW_IN_FINDER, async (_event, filePath: string) => {
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
    } else {
      shell.openPath(path.dirname(filePath));
    }
  });
}
