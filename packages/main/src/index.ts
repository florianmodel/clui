import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { registerIpcHandlers } from './ipc/index.js';
import { buildAppMenu } from './menu.js';
import { ConfigManager } from './config/ConfigManager.js';
import { IPCChannel } from '@gui-bridge/shared';
import type { DockerStatusEvent } from '@gui-bridge/shared';
import { DockerHealthMonitor } from './docker/DockerHealthMonitor.js';

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
    title: 'GUI Bridge',
    backgroundColor: '#0f0c29',
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

app.whenReady().then(() => {
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
