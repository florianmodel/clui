import * as fs from 'fs';
import * as path from 'path';
import type { RecentFile, RecentFolder } from '@gui-bridge/shared';
import { getFinderRecentsPath } from '../paths.js';

const MAX_RECENTS = 10;

interface FinderRecentsData {
  folders: RecentFolder[];
  files: RecentFile[];
}

function normalizeFolders(entries: unknown): RecentFolder[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry): entry is RecentFolder =>
      typeof entry === 'object'
      && entry !== null
      && typeof (entry as RecentFolder).folderPath === 'string'
      && (entry as RecentFolder).folderPath.length > 0,
    )
    .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
}

function normalizeFiles(entries: unknown): RecentFile[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry): entry is RecentFile =>
      typeof entry === 'object'
      && entry !== null
      && typeof (entry as RecentFile).filePath === 'string'
      && (entry as RecentFile).filePath.length > 0,
    )
    .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
}

function readData(filePath: string): FinderRecentsData {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    // Legacy format: the file used to contain just a folder array.
    if (Array.isArray(parsed)) {
      return {
        folders: normalizeFolders(parsed),
        files: [],
      };
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return { folders: [], files: [] };
    }

    return {
      folders: normalizeFolders((parsed as { folders?: unknown }).folders),
      files: normalizeFiles((parsed as { files?: unknown }).files),
    };
  } catch {
    return { folders: [], files: [] };
  }
}

function writeData(filePath: string, data: FinderRecentsData): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export class RecentFoldersStore {
  private readonly filePath: string;

  constructor(filePath = getFinderRecentsPath()) {
    this.filePath = filePath;
  }

  list(): RecentFolder[] {
    return readData(this.filePath).folders;
  }

  remember(entry: Omit<RecentFolder, 'lastOpenedAt'>): void {
    const data = readData(this.filePath);
    const folders = data.folders.filter((item) => item.folderPath !== entry.folderPath);
    folders.unshift({
      ...entry,
      lastOpenedAt: new Date().toISOString(),
    });

    writeData(this.filePath, {
      folders: folders.slice(0, MAX_RECENTS),
      files: data.files,
    });
  }
}

export class RecentFilesStore {
  private readonly filePath: string;

  constructor(filePath = getFinderRecentsPath()) {
    this.filePath = filePath;
  }

  list(): RecentFile[] {
    return readData(this.filePath).files;
  }

  remember(entry: Omit<RecentFile, 'lastOpenedAt'>): void {
    const data = readData(this.filePath);
    const files = data.files.filter((item) => item.filePath !== entry.filePath);
    files.unshift({
      ...entry,
      lastOpenedAt: new Date().toISOString(),
    });

    writeData(this.filePath, {
      folders: data.folders,
      files: files.slice(0, MAX_RECENTS),
    });
  }
}
