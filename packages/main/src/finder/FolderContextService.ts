import * as fs from 'fs';
import * as path from 'path';
import type {
  FolderAction,
  FolderContext,
  FolderKind,
  ProjectMeta,
  RecentFolder,
} from '@gui-bridge/shared';
import {
  findCuratedToolMatches,
  friendlyProjectName,
  getToolIconForRepo,
} from '@gui-bridge/shared';

type RecentStoreLike = Pick<{ list: () => RecentFolder[]; remember: (entry: Omit<RecentFolder, 'lastOpenedAt'>) => void }, 'list' | 'remember'>;

interface FolderContextServiceOptions {
  recentStore: RecentStoreLike;
  listInstalledProjects: () => ProjectMeta[];
}

interface NodeProjectInfo {
  scripts: Record<string, string>;
  hasNodeModules: boolean;
}

interface PythonProjectInfo {
  hasRequirements: boolean;
  hasPyproject: boolean;
  hasSetupPy: boolean;
  hasManagePy: boolean;
  hasTests: boolean;
}

interface RustProjectInfo {
  hasBinaryTarget: boolean;
}

interface FolderAnalysis {
  context: FolderContext;
  recent: Omit<RecentFolder, 'lastOpenedAt'>;
}

type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'data' | 'other';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.avif']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.opus']);
const DOCUMENT_EXTS = new Set(['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf']);
const DATA_EXTS = new Set(['.csv', '.tsv', '.json', '.xml', '.yaml', '.yml']);

export class FolderContextService {
  constructor(private readonly opts: FolderContextServiceOptions) {}

  scan(folderPath: string): FolderContext {
    const analysis = this.analyze(folderPath);
    this.opts.recentStore.remember(analysis.recent);
    return analysis.context;
  }

  listRecents(): RecentFolder[] {
    return this.opts.recentStore.list();
  }

  findAction(folderPath: string, actionId: string): FolderAction | null {
    const context = this.analyze(folderPath).context;
    return context.actions.find((action) => action.id === actionId) ?? null;
  }

  private analyze(folderPath: string): FolderAnalysis {
    const resolvedPath = path.resolve(folderPath);
    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      throw new Error('Please choose a folder, not a file.');
    }

    const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
    const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    const dirNames = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
    const lowerNames = new Set(entries.map((entry) => entry.name.toLowerCase()));

    const nodeInfo = this.getNodeProjectInfo(resolvedPath, lowerNames, dirNames);
    if (nodeInfo) {
      const context = this.buildNodeContext(resolvedPath, nodeInfo);
      return {
        context,
        recent: this.toRecent(context),
      };
    }

    const pythonInfo = this.getPythonProjectInfo(lowerNames, dirNames);
    if (pythonInfo) {
      const context = this.buildPythonContext(resolvedPath, pythonInfo);
      return {
        context,
        recent: this.toRecent(context),
      };
    }

    const rustInfo = this.getRustProjectInfo(resolvedPath, lowerNames);
    if (rustInfo) {
      const context = this.buildRustContext(resolvedPath, rustInfo);
      return {
        context,
        recent: this.toRecent(context),
      };
    }

    const context = this.buildFileContext(resolvedPath, fileNames);
    return {
      context,
      recent: this.toRecent(context),
    };
  }

  private buildNodeContext(folderPath: string, info: NodeProjectInfo): FolderContext {
    const actions: FolderAction[] = [];
    const scriptNames = Object.keys(info.scripts);

    if (!info.hasNodeModules) {
      actions.push({
        id: 'node:setup',
        type: 'run',
        kind: 'setup',
        label: 'Set up project',
        description: 'Install this folder\'s Node packages.',
        commandPreview: 'npm install',
        confirm: {
          title: 'Set up project',
          message: 'Install this project\'s Node packages?',
          detail: 'CLUI will run "npm install" in this folder.',
          confirmLabel: 'Install',
        },
      });
    }

    const primaryStartScript = info.scripts.dev ? 'dev' : info.scripts.start ? 'start' : null;
    if (primaryStartScript) {
      actions.push({
        id: `node:start:${primaryStartScript}`,
        type: 'run',
        kind: 'start',
        label: 'Start application',
        description: 'Run the main app command for this folder.',
        commandPreview: `npm run ${primaryStartScript}`,
      });
    }

    if (info.scripts.build) {
      actions.push({
        id: 'node:build',
        type: 'run',
        kind: 'build',
        label: 'Build app',
        description: 'Create a production-ready build.',
        commandPreview: 'npm run build',
      });
    }

    const checkScript = ['test', 'lint', 'check', 'typecheck', 'verify'].find((name) => info.scripts[name]);
    if (checkScript) {
      actions.push({
        id: `node:check:${checkScript}`,
        type: 'run',
        kind: 'check',
        label: 'Run checks',
        description: 'Run the project\'s checks in this folder.',
        commandPreview: `npm run ${checkScript}`,
      });
    }

    const handled = new Set(actions.flatMap((action) => {
      const match = action.commandPreview?.match(/^npm run (.+)$/);
      return match ? [match[1]] : [];
    }));

    const extraScripts = scriptNames
      .filter((name) => !handled.has(name))
      .filter((name) => this.isSafeNodeScript(name))
      .slice(0, 4);

    for (const name of extraScripts) {
      actions.push({
        id: `node:extra:${name}`,
        type: 'run',
        kind: 'other',
        label: this.labelForNodeScript(name),
        description: 'Run another safe project script in this folder.',
        commandPreview: `npm run ${name}`,
      });
    }

    const primaryActionId = actions[0]?.id;
    return {
      folderPath,
      folderName: path.basename(folderPath),
      kind: 'node',
      summary: `This looks like a Node project. I found package.json with ${scriptNames.length} script${scriptNames.length === 1 ? '' : 's'}.`,
      details: info.hasNodeModules
        ? 'Dependencies appear to be present, so you can start or build right away.'
        : 'This folder is missing node_modules, so setup comes first.',
      primaryActionId,
      actions,
    };
  }

  private buildPythonContext(folderPath: string, info: PythonProjectInfo): FolderContext {
    const actions: FolderAction[] = [];
    const setupCommand = info.hasRequirements
      ? 'python3 -m pip install -r requirements.txt'
      : 'python3 -m pip install -e .';

    if (info.hasManagePy) {
      actions.push({
        id: 'python:start:django',
        type: 'run',
        kind: 'start',
        label: 'Start application',
        description: 'Run the Django development server.',
        commandPreview: 'python3 manage.py runserver',
      });
    }

    actions.push({
      id: 'python:setup',
      type: 'run',
      kind: 'setup',
      label: 'Set up project',
      description: 'Install this folder\'s Python dependencies.',
      commandPreview: setupCommand,
      confirm: {
        title: 'Set up project',
        message: 'Install this project\'s Python dependencies?',
        detail: `CLUI will run "${setupCommand}" in this folder.`,
        confirmLabel: 'Install',
      },
    });

    if (info.hasTests) {
      actions.push({
        id: 'python:check:pytest',
        type: 'run',
        kind: 'check',
        label: 'Run checks',
        description: 'Run the Python test suite with pytest.',
        commandPreview: 'python3 -m pytest',
      });
    }

    const markers = [
      info.hasPyproject ? 'pyproject.toml' : null,
      info.hasRequirements ? 'requirements.txt' : null,
      info.hasSetupPy ? 'setup.py' : null,
      info.hasManagePy ? 'manage.py' : null,
    ].filter(Boolean).join(', ');

    const primaryActionId = actions[0]?.id;
    return {
      folderPath,
      folderName: path.basename(folderPath),
      kind: 'python',
      summary: `This looks like a Python project. I found ${markers}.`,
      details: info.hasManagePy
        ? 'This folder looks like a Django app, so CLUI can start the dev server for you.'
        : 'CLUI can help with setup and checks, but it will only offer start actions when the entrypoint is obvious.',
      primaryActionId,
      actions,
    };
  }

  private buildRustContext(folderPath: string, info: RustProjectInfo): FolderContext {
    const actions: FolderAction[] = [];

    if (info.hasBinaryTarget) {
      actions.push({
        id: 'rust:start',
        type: 'run',
        kind: 'start',
        label: 'Start application',
        description: 'Run the main Rust binary in this folder.',
        commandPreview: 'cargo run',
      });
    }

    actions.push({
      id: 'rust:build',
      type: 'run',
      kind: 'build',
      label: 'Build app',
      description: 'Compile the project with Cargo.',
      commandPreview: 'cargo build',
    });

    actions.push({
      id: 'rust:check:test',
      type: 'run',
      kind: 'check',
      label: 'Run checks',
      description: 'Run the Rust test suite.',
      commandPreview: 'cargo test',
    });

    return {
      folderPath,
      folderName: path.basename(folderPath),
      kind: 'rust',
      summary: info.hasBinaryTarget
        ? 'This looks like a Rust app with a runnable binary target.'
        : 'This looks like a Rust project managed by Cargo.',
      details: 'CLUI can run, build, and test this project directly in the selected folder.',
      primaryActionId: actions[0]?.id,
      actions,
    };
  }

  private buildFileContext(folderPath: string, fileNames: string[]): FolderContext {
    const categoryCounts = this.countFileCategories(fileNames);
    const total = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);
    const dominant = this.getDominantCategory(categoryCounts);
    const kind = this.resolveFileKind(categoryCounts, total);
    const actions = this.buildFileSuggestions(categoryCounts);

    let summary = 'This folder does not look like a runnable software project yet.';
    if (kind === 'media-heavy' && dominant) {
      summary = `This looks like a ${this.describeCategory(dominant)} folder with ${categoryCounts[dominant]} file${categoryCounts[dominant] === 1 ? '' : 's'}.`;
    } else if (kind === 'mixed' && total > 0) {
      summary = `This folder has a mix of files. I found ${this.describeCounts(categoryCounts)}.`;
    } else if (total === 0) {
      summary = 'This folder is mostly empty right now.';
    }

    const details = actions.length > 0
      ? 'CLUI can suggest matching tools for this folder, even when it is not a software project.'
      : 'There is no clear high-confidence action yet, so CLUI is only describing the folder for now.';

    return {
      folderPath,
      folderName: path.basename(folderPath),
      kind,
      summary,
      details,
      primaryActionId: actions[0]?.id,
      actions,
    };
  }

  private buildFileSuggestions(categoryCounts: Record<FileCategory, number>): FolderAction[] {
    const dominant = this.getDominantCategory(categoryCounts);
    if (!dominant) return [];

    const keywords = this.keywordsForCategory(dominant, categoryCounts);
    const matches = findCuratedToolMatches(keywords, 3);
    const installedById = new Map(
      this.opts.listInstalledProjects().map((project) => [this.projectId(project.owner, project.repo), project]),
    );

    return matches.map((tool) => {
      const projectId = this.projectId(tool.owner, tool.repo);
      const installed = installedById.has(projectId);
      return {
        id: `tool:${projectId}:${installed ? 'open' : 'install'}`,
        type: installed ? 'open-project' : 'install-project',
        kind: installed ? 'open-tool' : 'install-tool',
        label: `${installed ? 'Open' : 'Install'} ${friendlyProjectName(tool.repo)}`,
        description: tool.why,
        icon: tool.icon || getToolIconForRepo(tool.repo),
        projectId,
        owner: tool.owner,
        repo: tool.repo,
      } satisfies FolderAction;
    });
  }

  private countFileCategories(fileNames: string[]): Record<FileCategory, number> {
    const counts: Record<FileCategory, number> = {
      image: 0,
      video: 0,
      audio: 0,
      document: 0,
      data: 0,
      other: 0,
    };

    for (const name of fileNames) {
      const ext = path.extname(name).toLowerCase();
      if (IMAGE_EXTS.has(ext)) counts.image += 1;
      else if (VIDEO_EXTS.has(ext)) counts.video += 1;
      else if (AUDIO_EXTS.has(ext)) counts.audio += 1;
      else if (DOCUMENT_EXTS.has(ext)) counts.document += 1;
      else if (DATA_EXTS.has(ext)) counts.data += 1;
      else counts.other += 1;
    }

    return counts;
  }

  private resolveFileKind(categoryCounts: Record<FileCategory, number>, total: number): FolderKind {
    if (total === 0) return 'unknown';

    const dominant = this.getDominantCategory(categoryCounts);
    if (!dominant) return 'unknown';

    const dominantCount = categoryCounts[dominant];
    if (dominantCount / total >= 0.6 && dominant !== 'other') {
      return 'media-heavy';
    }

    const activeCategories = Object.entries(categoryCounts)
      .filter(([category, count]) => category !== 'other' && count > 0)
      .length;
    if (activeCategories >= 2) return 'mixed';
    return 'unknown';
  }

  private getDominantCategory(categoryCounts: Record<FileCategory, number>): FileCategory | null {
    const entries = Object.entries(categoryCounts)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]) as Array<[FileCategory, number]>;
    return entries[0]?.[0] ?? null;
  }

  private keywordsForCategory(
    category: FileCategory,
    categoryCounts: Record<FileCategory, number>,
  ): string[] {
    if (category === 'image') return ['image', 'resize', 'convert'];
    if (category === 'video') return ['video', 'compress', 'convert'];
    if (category === 'audio') return ['audio', 'transcribe'];
    if (category === 'document') {
      if (categoryCounts.document > 0) return ['pdf', 'document', 'convert'];
    }
    if (category === 'data') return ['csv', 'json', 'convert'];
    return ['files'];
  }

  private describeCategory(category: FileCategory): string {
    if (category === 'image') return 'image-heavy';
    if (category === 'video') return 'video-heavy';
    if (category === 'audio') return 'audio-heavy';
    if (category === 'document') return 'document-heavy';
    if (category === 'data') return 'data-heavy';
    return 'mixed';
  }

  private describeCounts(categoryCounts: Record<FileCategory, number>): string {
    return Object.entries(categoryCounts)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, count]) => `${count} ${category} file${count === 1 ? '' : 's'}`)
      .join(', ');
  }

  private getNodeProjectInfo(
    folderPath: string,
    lowerNames: Set<string>,
    dirNames: Set<string>,
  ): NodeProjectInfo | null {
    if (!lowerNames.has('package.json')) return null;

    const packagePath = path.join(folderPath, 'package.json');
    try {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { scripts?: Record<string, string> };
      return {
        scripts: packageJson.scripts ?? {},
        hasNodeModules: dirNames.has('node_modules'),
      };
    } catch {
      return {
        scripts: {},
        hasNodeModules: dirNames.has('node_modules'),
      };
    }
  }

  private getPythonProjectInfo(
    lowerNames: Set<string>,
    dirNames: Set<string>,
  ): PythonProjectInfo | null {
    const hasRequirements = lowerNames.has('requirements.txt');
    const hasPyproject = lowerNames.has('pyproject.toml');
    const hasSetupPy = lowerNames.has('setup.py');
    const hasManagePy = lowerNames.has('manage.py');
    const hasTests = dirNames.has('tests')
      || Array.from(lowerNames).some((name) => name.startsWith('test_') && name.endsWith('.py'))
      || Array.from(lowerNames).some((name) => name.endsWith('_test.py'));

    if (!hasRequirements && !hasPyproject && !hasSetupPy && !hasManagePy) return null;

    return {
      hasRequirements,
      hasPyproject,
      hasSetupPy,
      hasManagePy,
      hasTests,
    };
  }

  private getRustProjectInfo(folderPath: string, lowerNames: Set<string>): RustProjectInfo | null {
    if (!lowerNames.has('cargo.toml')) return null;

    const cargoText = fs.readFileSync(path.join(folderPath, 'Cargo.toml'), 'utf8');
    const hasBinaryTarget = fs.existsSync(path.join(folderPath, 'src', 'main.rs')) || /\[\[bin\]\]/.test(cargoText);

    return { hasBinaryTarget };
  }

  private isSafeNodeScript(name: string): boolean {
    return [
      /^preview$/,
      /^lint$/,
      /^typecheck$/,
      /^check$/,
      /^package(?::.+)?$/,
      /^test(?::.+)?$/,
    ].some((pattern) => pattern.test(name));
  }

  private labelForNodeScript(name: string): string {
    if (name === 'preview') return 'Preview app';
    if (name === 'lint') return 'Run lint checks';
    if (name === 'typecheck') return 'Run type checks';
    if (name === 'check') return 'Run checks';
    if (name.startsWith('package:')) {
      const target = name.split(':')[1];
      return `Package for ${friendlyProjectName(target)}`;
    }
    if (name === 'package') return 'Package app';
    if (name.startsWith('test:')) return `Run ${friendlyProjectName(name.split(':')[1])} tests`;
    return `Run ${friendlyProjectName(name)}`;
  }

  private toRecent(context: FolderContext): Omit<RecentFolder, 'lastOpenedAt'> {
    return {
      folderPath: context.folderPath,
      folderName: context.folderName,
      kind: context.kind,
      summary: context.summary,
    };
  }

  private projectId(owner: string, repo: string): string {
    return `${owner}--${repo}`.toLowerCase();
  }
}
