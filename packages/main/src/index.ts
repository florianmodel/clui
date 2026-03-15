import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { registerIpcHandlers } from './ipc/index.js';
import { buildAppMenu } from './menu.js';
import { ConfigManager } from './config/ConfigManager.js';
import { IPCChannel } from '@gui-bridge/shared';
import type { DockerStatusEvent } from '@gui-bridge/shared';
import { DockerHealthMonitor } from './docker/DockerHealthMonitor.js';
import { getUserDataDir } from './paths.js';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const configManager = new ConfigManager();
const healthMonitor = new DockerHealthMonitor();

let mainWindow: BrowserWindow | null = null;

function getWindow(): BrowserWindow | null {
  return mainWindow;
}

function createWindow(): void {
  const savedWindow = configManager.getConfig().window;

  mainWindow = new BrowserWindow({
    width: savedWindow?.width ?? 1200,
    height: savedWindow?.height ?? 820,
    x: savedWindow?.x,
    y: savedWindow?.y,
    minWidth: 900,
    minHeight: 640,
    title: 'CLUI',
    backgroundColor: '#111213',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(
      path.join(__dirname, '../../renderer/dist/index.html'),
    );
  }

  // Save window bounds on close
  mainWindow.on('close', () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      configManager.setConfig({
        window: {
          width: bounds.width,
          height: bounds.height,
          x: bounds.x,
          y: bounds.y,
        },
      });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * One-time migration: copy ~/.gui-bridge/ → app userData dir if userData is empty.
 * Runs silently — any failure is ignored to avoid blocking app startup.
 */
function migrateOldDataIfNeeded(): void {
  try {
    const oldDir = path.join(os.homedir(), '.gui-bridge');
    const newDir = getUserDataDir();

    if (!fs.existsSync(oldDir)) return;
    if (fs.existsSync(path.join(newDir, 'projects')) || fs.existsSync(path.join(newDir, 'config.json'))) return;

    fs.mkdirSync(newDir, { recursive: true });
    fs.cpSync(oldDir, newDir, { recursive: true });
  } catch {
    // Migration failure is non-fatal — app continues with fresh data dir
  }
}

app.whenReady().then(() => {
  migrateOldDataIfNeeded();
  registerIpcHandlers(getWindow);
  buildAppMenu(getWindow);
  createWindow();

  // Start continuous Docker health monitoring
  healthMonitor.start((running, version) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      const event: DockerStatusEvent = { running, version };
      win.webContents.send(IPCChannel.DOCKER_STATUS, event);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  healthMonitor.stop();
  if (process.platform !== 'darwin') app.quit();
});
