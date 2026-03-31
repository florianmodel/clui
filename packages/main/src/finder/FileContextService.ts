import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type {
  FileAction,
  FileChanges,
  FileContext,
  FileEditableField,
  FileKind,
  FileMetadataEntry,
  FileMetadataSection,
  ProjectMeta,
  RecentFile,
} from '@gui-bridge/shared';
import {
  findCuratedToolMatches,
  friendlyProjectName,
  getToolIconForRepo,
} from '@gui-bridge/shared';

type RecentStoreLike = Pick<{ list: () => RecentFile[]; remember: (entry: Omit<RecentFile, 'lastOpenedAt'>) => void }, 'list' | 'remember'>;

interface FileContextServiceOptions {
  recentStore: RecentStoreLike;
  listInstalledProjects: () => ProjectMeta[];
  metadataAdapter?: FileMetadataAdapter;
}

interface FileAnalysis {
  context: FileContext;
  recent: Omit<RecentFile, 'lastOpenedAt'>;
}

interface FileMetadataSnapshot {
  tags: string[];
  locked: boolean;
  hideExtension: boolean;
  metadataSections: FileMetadataSection[];
}

export interface FileMetadataAdapter {
  readonly supported: boolean;
  inspect(filePath: string): FileMetadataSnapshot;
  applyChanges(filePath: string, changes: FileChanges): void;
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.avif', '.heic']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.opus']);
const DOCUMENT_EXTS = new Set(['.pdf', '.doc', '.docx', '.txt', '.md', '.rtf', '.pages']);
const DATA_EXTS = new Set(['.csv', '.tsv', '.json', '.xml', '.yaml', '.yml']);

const TAGS_ATTR = 'com.apple.metadata:_kMDItemUserTags';
const XATTR_BIN = '/usr/bin/xattr';
const GET_FILE_INFO_BIN = '/usr/bin/GetFileInfo';
const SET_FILE_BIN = '/usr/bin/SetFile';
const MDLS_BIN = '/usr/bin/mdls';
const PLUTIL_BIN = '/usr/bin/plutil';

const SPOTLIGHT_KEYS: Array<{ key: string; label: string }> = [
  { key: 'kMDItemKind', label: 'Kind' },
  { key: 'kMDItemContentType', label: 'Content type' },
  { key: 'kMDItemContentTypeTree', label: 'Type hierarchy' },
  { key: 'kMDItemUserTags', label: 'Tags' },
  { key: 'kMDItemWhereFroms', label: 'Where from' },
];

export class FileContextService {
  private readonly metadataAdapter: FileMetadataAdapter;

  constructor(private readonly opts: FileContextServiceOptions) {
    this.metadataAdapter = opts.metadataAdapter ?? new MacFileMetadataAdapter();
  }

  scan(filePath: string): FileContext {
    const analysis = this.analyze(filePath);
    this.opts.recentStore.remember(analysis.recent);
    return analysis.context;
  }

  listRecents(): RecentFile[] {
    return this.opts.recentStore.list();
  }

  applyChanges(filePath: string, changes: FileChanges): FileContext {
    const resolvedPath = path.resolve(filePath);
    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile()) {
      throw new Error('Please choose a file, not a folder.');
    }

    if (!this.metadataAdapter.supported) {
      throw new Error('Friendly file editing is only available on macOS right now.');
    }

    this.metadataAdapter.applyChanges(resolvedPath, changes);
    return this.scan(resolvedPath);
  }

  private analyze(filePath: string): FileAnalysis {
    const resolvedPath = path.resolve(filePath);
    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile()) {
      throw new Error('Please choose a file, not a folder.');
    }

    const extension = path.extname(resolvedPath).toLowerCase();
    const kind = this.resolveKind(extension);
    const metadata = this.metadataAdapter.inspect(resolvedPath);
    const actions = this.buildToolSuggestions(resolvedPath, kind, extension);
    const context: FileContext = {
      filePath: resolvedPath,
      fileName: path.basename(resolvedPath),
      extension,
      kind,
      size: stats.size,
      sizeLabel: formatFileSize(stats.size),
      createdAt: stats.birthtime.toISOString(),
      modifiedAt: stats.mtime.toISOString(),
      summary: this.buildSummary(resolvedPath, kind, extension),
      details: this.buildDetails(kind),
      editableFields: this.buildEditableFields(kind, extension, metadata),
      metadataSections: metadata.metadataSections,
      primaryActionId: actions[0]?.id,
      actions,
    };

    return {
      recent: {
        filePath: context.filePath,
        fileName: context.fileName,
        kind: context.kind,
        summary: context.summary,
      },
      context,
    };
  }

  private buildEditableFields(
    kind: FileKind,
    extension: string,
    metadata: FileMetadataSnapshot,
  ): FileEditableField[] {
    if (!this.metadataAdapter.supported) return [];

    const fields: FileEditableField[] = [
      {
        id: 'tags',
        type: 'tags',
        label: 'Tags',
        description: 'Add simple Finder tags so this file is easier to find later.',
        value: metadata.tags,
      },
      {
        id: 'locked',
        type: 'toggle',
        label: 'Locked',
        description: 'Prevent accidental edits by marking this file as locked in Finder.',
        value: metadata.locked,
      },
    ];

    if (extension.length > 0) {
      fields.push({
        id: 'hideExtension',
        type: 'toggle',
        label: 'Hide file extension',
        description: `Show or hide the ${extension} ending in Finder.`,
        value: metadata.hideExtension,
      });
    }

    if (kind === 'other' && fields.length > 0) {
      fields[0] = {
        ...fields[0],
        description: 'Add simple Finder tags so this file is easier to group and find later.',
      };
    }

    return fields;
  }

  private buildToolSuggestions(filePath: string, kind: FileKind, extension: string): FileAction[] {
    const baseNameTokens = path.basename(filePath, extension)
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((token) => token.length > 1);
    const extToken = extension.replace(/^\./, '');
    const queryTokens = [
      kind,
      extToken,
      ...this.keywordsForKind(kind, extension),
      ...baseNameTokens,
    ].filter((token) => token.length > 0);

    const matches = findCuratedToolMatches(queryTokens, 3);
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
      } satisfies FileAction;
    });
  }

  private buildSummary(filePath: string, kind: FileKind, extension: string): string {
    const name = path.basename(filePath);
    if (kind === 'image') return `This looks like an image file. ${name} should open like a normal ${friendlyKind(extension || kind)}.`;
    if (kind === 'video') return `This looks like a video file. ${name} is a good candidate for compression, conversion, or clipping tools.`;
    if (kind === 'audio') return `This looks like an audio file. ${name} can be tagged here and opened with audio or transcription tools.`;
    if (kind === 'document') return `This looks like a document file. ${name} can be inspected here and opened with document or PDF tools.`;
    if (kind === 'data') return `This looks like a structured data file. ${name} may work well with conversion or data-viewing tools.`;
    return `This is a file named ${name}. CLUI can show safe Finder details here and suggest tools when the file type is recognizable.`;
  }

  private buildDetails(kind: FileKind): string {
    if (!this.metadataAdapter.supported) {
      return 'On this platform CLUI can still describe the file and suggest tools, but Finder-style editing is hidden.';
    }

    if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'document') {
      return 'You can edit a few Finder-friendly details here. Technical metadata stays below for reference.';
    }

    return 'CLUI keeps the editable fields simple here and leaves lower-level metadata in the technical section.';
  }

  private resolveKind(extension: string): FileKind {
    if (IMAGE_EXTS.has(extension)) return 'image';
    if (VIDEO_EXTS.has(extension)) return 'video';
    if (AUDIO_EXTS.has(extension)) return 'audio';
    if (DOCUMENT_EXTS.has(extension)) return 'document';
    if (DATA_EXTS.has(extension)) return 'data';
    return 'other';
  }

  private keywordsForKind(kind: FileKind, extension: string): string[] {
    if (extension === '.svg') return ['svg', 'optimize', 'image'];
    if (extension === '.pdf') return ['pdf', 'document', 'extract'];
    if (kind === 'image') return ['image', 'resize', 'convert'];
    if (kind === 'video') return ['video', 'compress', 'convert'];
    if (kind === 'audio') return ['audio', 'transcribe'];
    if (kind === 'document') return ['document', 'convert'];
    if (kind === 'data') return ['csv', 'json', 'data'];
    return ['file'];
  }

  private projectId(owner: string, repo: string): string {
    return `${owner}--${repo}`.toLowerCase();
  }
}

class MacFileMetadataAdapter implements FileMetadataAdapter {
  readonly supported = process.platform === 'darwin';

  inspect(filePath: string): FileMetadataSnapshot {
    if (!this.supported) {
      return {
        tags: [],
        locked: false,
        hideExtension: false,
        metadataSections: [],
      };
    }

    const finderAttributes = this.readFinderAttributes(filePath);
    const spotlightEntries = this.readSpotlightEntries(filePath);
    const xattrEntries = this.readExtendedAttributeEntries(filePath);

    const metadataSections: FileMetadataSection[] = [];
    if (spotlightEntries.length > 0) {
      metadataSections.push({
        id: 'spotlight',
        label: 'Spotlight metadata',
        description: 'Read-only system metadata discovered by macOS.',
        entries: spotlightEntries,
      });
    }
    if (xattrEntries.length > 0) {
      metadataSections.push({
        id: 'xattrs',
        label: 'Extended attributes',
        description: 'Read-only lower-level metadata stored alongside the file.',
        entries: xattrEntries,
      });
    }

    return {
      tags: this.readTagRecords(filePath).map((record) => record.label),
      locked: finderAttributes.locked,
      hideExtension: finderAttributes.hideExtension,
      metadataSections,
    };
  }

  applyChanges(filePath: string, changes: FileChanges): void {
    if (!this.supported) return;

    if (changes.tags !== undefined) {
      this.writeTags(filePath, changes.tags);
    }
    if (changes.locked !== undefined) {
      this.setFinderFlag(filePath, 'L', changes.locked);
    }
    if (changes.hideExtension !== undefined) {
      this.setFinderFlag(filePath, 'E', changes.hideExtension);
    }
  }

  private readFinderAttributes(filePath: string): { locked: boolean; hideExtension: boolean } {
    const output = this.execText(GET_FILE_INFO_BIN, [filePath]);
    const marker = 'attributes:';
    const idx = output.indexOf(marker);
    const attributes = idx === -1 ? '' : output.slice(idx + marker.length).trim();
    return {
      locked: attributes.includes('L'),
      hideExtension: attributes.includes('E'),
    };
  }

  private readSpotlightEntries(filePath: string): FileMetadataEntry[] {
    const entries: FileMetadataEntry[] = [];
    for (const { key, label } of SPOTLIGHT_KEYS) {
      try {
        const output = this.execText(MDLS_BIN, ['-name', key, filePath]);
        const value = this.parseMdlsValue(output, key);
        if (!value || value === '(null)') continue;
        entries.push({
          key,
          label,
          kind: 'text',
          value,
        });
      } catch {
        return [];
      }
    }
    return entries;
  }

  private readExtendedAttributeEntries(filePath: string): FileMetadataEntry[] {
    let names: string[] = [];
    try {
      const output = this.execText(XATTR_BIN, [filePath]);
      names = output
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    } catch {
      return [];
    }

    return names.map((name) => {
      if (name === TAGS_ATTR) {
        const labels = this.readTagRecords(filePath).map((record) => record.label);
        return {
          key: name,
          label: 'Finder tags',
          kind: 'text',
          value: labels.length > 0 ? labels.join(', ') : 'No tags',
        } satisfies FileMetadataEntry;
      }

      const hex = this.execText(XATTR_BIN, ['-px', name, filePath]);
      const buffer = hexToBuffer(hex);
      const text = bufferToDisplayText(buffer);
      if (text !== null) {
        return {
          key: name,
          label: name,
          kind: 'text',
          value: text.length > 0 ? text : '(empty)',
        } satisfies FileMetadataEntry;
      }

      return {
        key: name,
        label: name,
        kind: 'binary',
        value: 'Binary data',
        byteLength: buffer.length,
        hexPreview: compactHex(hex).slice(0, 64),
      } satisfies FileMetadataEntry;
    });
  }

  private readTagRecords(filePath: string): Array<{ label: string; raw: string }> {
    try {
      const hex = this.execText(XATTR_BIN, ['-px', TAGS_ATTR, filePath]);
      if (!hex.trim()) return [];
      const plist = execFileSync(
        PLUTIL_BIN,
        ['-convert', 'json', '-o', '-', '--', '-'],
        {
          input: hexToBuffer(hex),
          encoding: 'utf8',
        },
      );
      const parsed = JSON.parse(plist) as unknown;
      if (!Array.isArray(parsed)) return [];

      const labels = new Set<string>();
      const records: Array<{ label: string; raw: string }> = [];
      for (const entry of parsed) {
        if (typeof entry !== 'string') continue;
        const label = entry.split('\n')[0]?.trim() ?? '';
        if (!label || labels.has(label)) continue;
        labels.add(label);
        records.push({ label, raw: entry });
      }
      return records;
    } catch {
      return [];
    }
  }

  private writeTags(filePath: string, tags: string[]): void {
    const nextLabels = Array.from(new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)));
    if (nextLabels.length === 0) {
      try {
        execFileSync(XATTR_BIN, ['-d', TAGS_ATTR, filePath]);
      } catch {
        // Ignore missing xattr errors.
      }
      return;
    }

    const existingByLabel = new Map(
      this.readTagRecords(filePath).map((record) => [record.label, record.raw]),
    );
    const rawValues = nextLabels.map((label) => existingByLabel.get(label) ?? label);
    const xml = buildTagsPlist(rawValues);
    const binary = execFileSync(
      PLUTIL_BIN,
      ['-convert', 'binary1', '-o', '-', '--', '-'],
      { input: xml },
    );

    execFileSync(XATTR_BIN, ['-wx', TAGS_ATTR, Buffer.from(binary).toString('hex'), filePath]);
  }

  private setFinderFlag(filePath: string, flag: 'E' | 'L', enabled: boolean): void {
    execFileSync(SET_FILE_BIN, ['-a', enabled ? flag : flag.toLowerCase(), filePath]);
  }

  private parseMdlsValue(output: string, key: string): string | null {
    const marker = `${key} =`;
    const idx = output.indexOf(marker);
    if (idx === -1) return null;
    return output
      .slice(idx + marker.length)
      .trim()
      .replace(/\s+\n/g, '\n');
  }

  private execText(command: string, args: string[]): string {
    return execFileSync(command, args, { encoding: 'utf8' }).trim();
  }
}

function buildTagsPlist(tags: string[]): string {
  const items = tags.map((tag) => `<string>${escapeXml(tag)}</string>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><array>${items}</array></plist>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function hexToBuffer(hex: string): Buffer {
  return Buffer.from(compactHex(hex), 'hex');
}

function compactHex(hex: string): string {
  return hex.replace(/[^a-fA-F0-9]/g, '');
}

function bufferToDisplayText(buffer: Buffer): string | null {
  if (buffer.length === 0) return '';

  const text = buffer.toString('utf8').replace(/\0+$/g, '');
  if (text.includes('\uFFFD')) return null;
  if (!/^[\t\r\n\x20-\x7E]*$/.test(text)) return null;
  return text.trim();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function friendlyKind(value: string): string {
  const normalized = value.replace(/^\./, '').replace(/[-_]/g, ' ');
  if (!normalized) return 'file';
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}
