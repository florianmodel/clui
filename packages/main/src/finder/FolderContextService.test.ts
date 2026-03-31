import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProjectMeta, RecentFolder } from '@gui-bridge/shared';
import { FolderContextService } from './FolderContextService.js';
import { RecentFoldersStore } from './RecentFoldersStore.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clui-finder-'));
  tempDirs.push(dir);
  return dir;
}

function writeJson(dir: string, name: string, value: unknown): void {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), 'utf8');
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

function makeService(installedProjects: ProjectMeta[] = []) {
  const recents: Array<Omit<RecentFolder, 'lastOpenedAt'>> = [];
  return {
    recents,
    service: new FolderContextService({
      recentStore: {
        list: () => [],
        remember: (entry) => {
          recents.push(entry);
        },
      },
      listInstalledProjects: () => installedProjects,
    }),
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('FolderContextService', () => {
  it('maps common Node scripts into plain-language actions', () => {
    const dir = makeTempDir();
    fs.mkdirSync(path.join(dir, 'node_modules'));
    writeJson(dir, 'package.json', {
      name: 'demo-app',
      scripts: {
        dev: 'vite',
        build: 'vite build',
        lint: 'eslint .',
        'package:mac': 'electron-builder --mac',
      },
    });

    const { service, recents } = makeService();
    const context = service.scan(dir);

    expect(context.kind).toBe('node');
    expect(context.primaryActionId).toBe('node:start:dev');
    expect(context.actions.map((action) => action.label)).toContain('Build app');
    expect(context.actions.map((action) => action.label)).toContain('Run checks');
    expect(context.actions.map((action) => action.label)).toContain('Package for Mac');
    expect(recents[0]?.folderPath).toBe(dir);
  });

  it('prioritizes setup when a Node project is missing node_modules', () => {
    const dir = makeTempDir();
    writeJson(dir, 'package.json', {
      name: 'missing-deps',
      scripts: {
        dev: 'vite',
      },
    });

    const { service } = makeService();
    const context = service.scan(dir);
    const primary = context.actions[0];

    expect(primary.label).toBe('Set up project');
    expect(primary.commandPreview).toBe('npm install');
    expect(primary.confirm?.confirmLabel).toBe('Install');
  });

  it('offers setup, checks, and start for a clear Python app folder', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'requirements.txt'), 'django\npytest\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'manage.py'), 'print("manage")\n', 'utf8');
    fs.mkdirSync(path.join(dir, 'tests'));

    const { service } = makeService();
    const context = service.scan(dir);

    expect(context.kind).toBe('python');
    expect(context.actions.map((action) => action.commandPreview)).toContain('python3 manage.py runserver');
    expect(context.actions.map((action) => action.commandPreview)).toContain('python3 -m pip install -r requirements.txt');
    expect(context.actions.map((action) => action.commandPreview)).toContain('python3 -m pytest');
  });

  it('offers run, build, and checks for a Rust binary project', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'Cargo.toml'), '[package]\nname = "demo"\nversion = "0.1.0"\n', 'utf8');
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'main.rs'), 'fn main() {}\n', 'utf8');

    const { service } = makeService();
    const context = service.scan(dir);

    expect(context.kind).toBe('rust');
    expect(context.primaryActionId).toBe('rust:start');
    expect(context.actions.map((action) => action.commandPreview)).toContain('cargo build');
    expect(context.actions.map((action) => action.commandPreview)).toContain('cargo test');
  });

  it('suggests installing a matching tool for a media-heavy folder', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'one.jpg'), 'x', 'utf8');
    fs.writeFileSync(path.join(dir, 'two.png'), 'x', 'utf8');
    fs.writeFileSync(path.join(dir, 'three.webp'), 'x', 'utf8');

    const { service } = makeService();
    const context = service.scan(dir);

    expect(context.kind).toBe('media-heavy');
    expect(context.actions[0]?.type).toBe('install-project');
    expect(context.actions[0]?.label).toContain('Install');
  });

  it('opens an installed matching tool for a media-heavy folder', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'one.jpg'), 'x', 'utf8');
    fs.writeFileSync(path.join(dir, 'two.png'), 'x', 'utf8');

    const installed = [makeProjectMeta('ImageMagick', 'ImageMagick')];
    const { service } = makeService(installed);
    const context = service.scan(dir);

    expect(context.actions[0]?.type).toBe('open-project');
    expect(context.actions[0]?.projectId?.toLowerCase()).toBe('imagemagick--imagemagick');
  });
});

describe('RecentFoldersStore', () => {
  it('dedupes folders and keeps the newest entry first', () => {
    const dir = makeTempDir();
    const storePath = path.join(dir, 'recents.json');
    const store = new RecentFoldersStore(storePath);

    store.remember({
      folderPath: '/tmp/alpha',
      folderName: 'alpha',
      kind: 'node',
      summary: 'Alpha',
    });
    store.remember({
      folderPath: '/tmp/beta',
      folderName: 'beta',
      kind: 'rust',
      summary: 'Beta',
    });
    store.remember({
      folderPath: '/tmp/alpha',
      folderName: 'alpha',
      kind: 'node',
      summary: 'Alpha again',
    });

    const recents = store.list();
    expect(recents).toHaveLength(2);
    expect(recents[0]?.folderPath).toBe('/tmp/alpha');
    expect(recents[1]?.folderPath).toBe('/tmp/beta');
  });
});
