import { app } from 'electron';
import * as path from 'path';

/**
 * All app-level path helpers in one place.
 * Use these everywhere instead of hardcoding os.homedir() + '/.gui-bridge'.
 *
 * Platform defaults for userData:
 *   macOS:   ~/Library/Application Support/CLUI
 *   Linux:   ~/.config/CLUI
 *   Windows: %APPDATA%\CLUI
 */

export function getUserDataDir(): string {
  return app.getPath('userData');
}

export function getProjectsDir(): string {
  return path.join(getUserDataDir(), 'projects');
}

export function getConfigPath(): string {
  return path.join(getUserDataDir(), 'config.json');
}

export function getFinderRecentsPath(): string {
  return path.join(getUserDataDir(), 'finder-recents.json');
}

/**
 * Path to Python analyzer scripts.
 * - Dev:      packages/main/src/analyzer/analyzer-scripts/ (source tree)
 * - Packaged: Contents/Resources/analyzer-scripts/ (via electron-builder extraResources)
 */
export function getScriptsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'analyzer-scripts');
  }
  return path.join(app.getAppPath(), 'packages/main/src/analyzer/analyzer-scripts');
}
