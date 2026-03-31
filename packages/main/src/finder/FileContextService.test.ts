import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  FileChanges,
  FileMetadataSection,
  ProjectMeta,
  RecentFile,
  RecentFolder,
} from '@gui-bridge/shared';
import { FileContextService, type FileMetadataAdapter } from './FileContextService.js';
import { RecentFilesStore, RecentFoldersStore } from './RecentFoldersStore.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clui-file-finder-'));
  tempDirs.push(dir);
  return dir;
}

function makeProjectMeta(owner: string, repo: string): ProjectMeta {
  return {
    projectId: `${owner}--${repo}`,
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    description: repo,
    language: 'Unknown',
    stars: 0,
    installedAt: new Date().toISOString(),
    dockerImage: `clui/${repo.toLowerCase()}`,
    status: 'ready',
    repoDir: `/tmp/${repo}`,
  };
}

class FakeMetadataAdapter implements FileMetadataAdapter {
  readonly supported = true;

  constructor(
    private readonly state = new Map<string, {
      tags: string[];
      locked: boolean;
      hideExtension: boolean;
      metadataSections: FileMetadataSection[];
    }>(),
  ) {}

  inspect(filePath: string) {
    return this.state.get(filePath) ?? {
      tags: [],
      locked: false,
      hideExtension: false,
      metadataSections: [],
    };
  }

  applyChanges(filePath: string, changes: FileChanges): void {
    const current = this.inspect(filePath);
    this.state.set(filePath, {
      tags: changes.tags ?? current.tags,
      locked: changes.locked ?? current.locked,
      hideExtension: changes.hideExtension ?? current.hideExtension,
      metadataSections: current.metadataSections,
    });
  }
}

function makeService(installedProjects: ProjectMeta[] = [], adapter = new FakeMetadataAdapter()) {
  const recents: Array<Omit<RecentFile, 'lastOpenedAt'>> = [];
  return {
    adapter,
    recents,
    service: new FileContextService({
      recentStore: {
        list: () => [],
        remember: (entry) => {
          recents.push(entry);
        },
      },
      listInstalledProjects: () => installedProjects,
      metadataAdapter: adapter,
    }),
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('FileContextService', () => {
  it('builds editable fields and matching suggestions for a selected image file', () => {
    const dir = makeTempDir();
    const filePath = path.join(dir, 'poster.png');
    fs.writeFileSync(filePath, 'image', 'utf8');

    const adapter = new FakeMetadataAdapter(new Map([
      [filePath, {
        tags: ['Client'],
        locked: true,
        hideExtension: false,
        metadataSections: [
          {
            id: 'xattrs',
            label: 'Extended attributes',
            entries: [
              { key: 'com.apple.provenance', label: 'com.apple.provenance', kind: 'binary', byteLength: 2, hexPreview: '0102' },
            ],
          },
        ],
      }],
    ]));

    const installed = [makeProjectMeta('ImageMagick', 'ImageMagick')];
    const { service, recents } = makeService(installed, adapter);
    const context = service.scan(filePath);

    expect(context.kind).toBe('image');
    expect(context.editableFields.map((field) => field.id)).toEqual(['tags', 'locked', 'hideExtension']);
    expect(context.actions.some((action) => action.projectId?.toLowerCase() === 'imagemagick--imagemagick')).toBe(true);
    expect(context.actions[0]?.type).toBe('open-project');
    expect(context.metadataSections[0]?.entries[0]?.kind).toBe('binary');
    expect(recents[0]?.filePath).toBe(filePath);
  });

  it('omits the hide-extension field for files without an extension', () => {
    const dir = makeTempDir();
    const filePath = path.join(dir, 'README');
    fs.writeFileSync(filePath, 'hello', 'utf8');

    const { service } = makeService();
    const context = service.scan(filePath);

    expect(context.extension).toBe('');
    expect(context.editableFields.map((field) => field.id)).toEqual(['tags', 'locked']);
  });

  it('applies friendly metadata changes through the adapter and returns refreshed context', () => {
    const dir = makeTempDir();
    const filePath = path.join(dir, 'draft.txt');
    fs.writeFileSync(filePath, 'hello', 'utf8');

    const adapter = new FakeMetadataAdapter(new Map([
      [filePath, {
        tags: [],
        locked: false,
        hideExtension: false,
        metadataSections: [],
      }],
    ]));
    const { service } = makeService([], adapter);

    const updated = service.applyChanges(filePath, {
      tags: ['Work', 'Pinned'],
      locked: true,
      hideExtension: true,
    });

    expect(updated.editableFields.find((field) => field.id === 'tags')?.value).toEqual(['Work', 'Pinned']);
    expect(updated.editableFields.find((field) => field.id === 'locked')?.value).toBe(true);
    expect(updated.editableFields.find((field) => field.id === 'hideExtension')?.value).toBe(true);
  });
});

describe('RecentFilesStore', () => {
  it('dedupes files and preserves folder recents in the shared store file', () => {
    const dir = makeTempDir();
    const storePath = path.join(dir, 'finder-recents.json');
    const folderStore = new RecentFoldersStore(storePath);
    const fileStore = new RecentFilesStore(storePath);

    folderStore.remember({
      folderPath: '/tmp/work',
      folderName: 'work',
      kind: 'node',
      summary: 'Work folder',
    });
    fileStore.remember({
      filePath: '/tmp/work/demo.png',
      fileName: 'demo.png',
      kind: 'image',
      summary: 'Image file',
    });
    fileStore.remember({
      filePath: '/tmp/work/demo.png',
      fileName: 'demo.png',
      kind: 'image',
      summary: 'Updated image file',
    });

    const folders = folderStore.list();
    const files = fileStore.list();

    expect(folders).toHaveLength(1);
    expect(folders[0]?.folderPath).toBe('/tmp/work');
    expect(files).toHaveLength(1);
    expect(files[0]?.filePath).toBe('/tmp/work/demo.png');
  });

  it('reads the legacy folder-array format without losing existing folder recents', () => {
    const dir = makeTempDir();
    const storePath = path.join(dir, 'finder-recents.json');
    const legacyData: RecentFolder[] = [
      {
        folderPath: '/tmp/legacy',
        folderName: 'legacy',
        kind: 'mixed',
        summary: 'Legacy folder',
        lastOpenedAt: new Date().toISOString(),
      },
    ];
    fs.writeFileSync(storePath, JSON.stringify(legacyData, null, 2), 'utf8');

    const folderStore = new RecentFoldersStore(storePath);
    const fileStore = new RecentFilesStore(storePath);

    expect(folderStore.list()[0]?.folderPath).toBe('/tmp/legacy');
    expect(fileStore.list()).toEqual([]);
  });
});
