export type FolderKind = 'node' | 'python' | 'rust' | 'media-heavy' | 'mixed' | 'unknown';
export type FileKind = 'image' | 'video' | 'audio' | 'document' | 'data' | 'other';

export type FolderActionType = 'run' | 'open-project' | 'install-project';

export type FolderActionKind =
  | 'setup'
  | 'start'
  | 'build'
  | 'check'
  | 'open-tool'
  | 'install-tool'
  | 'other';

export interface FolderActionConfirm {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
}

export interface FolderAction {
  id: string;
  type: FolderActionType;
  kind: FolderActionKind;
  label: string;
  description: string;
  icon?: string;
  commandPreview?: string;
  confirm?: FolderActionConfirm;
  projectId?: string;
  owner?: string;
  repo?: string;
}

export interface FolderContext {
  folderPath: string;
  folderName: string;
  kind: FolderKind;
  summary: string;
  details?: string;
  primaryActionId?: string;
  actions: FolderAction[];
}

export interface RecentFolder {
  folderPath: string;
  folderName: string;
  kind: FolderKind;
  summary: string;
  lastOpenedAt: string;
}

export interface FolderRunState {
  status: 'idle' | 'running' | 'success' | 'error' | 'stopped';
  runId?: string;
  actionId?: string;
  detectedUrls: string[];
}

export type FileActionType = 'open-project' | 'install-project';

export type FileActionKind =
  | 'open-tool'
  | 'install-tool'
  | 'other';

export interface FileAction {
  id: string;
  type: FileActionType;
  kind: FileActionKind;
  label: string;
  description: string;
  icon?: string;
  projectId?: string;
  owner?: string;
  repo?: string;
}

export interface RecentFile {
  filePath: string;
  fileName: string;
  kind: FileKind;
  summary: string;
  lastOpenedAt: string;
}

export interface FileChanges {
  tags?: string[];
  locked?: boolean;
  hideExtension?: boolean;
}

export interface FileMetadataEntry {
  key: string;
  label: string;
  kind: 'text' | 'binary';
  value?: string;
  byteLength?: number;
  hexPreview?: string;
}

export interface FileMetadataSection {
  id: string;
  label: string;
  description?: string;
  entries: FileMetadataEntry[];
}

export type FileEditableFieldId = 'tags' | 'locked' | 'hideExtension';

interface FileEditableFieldBase<TType extends 'tags' | 'toggle', TValue> {
  id: FileEditableFieldId;
  type: TType;
  label: string;
  description: string;
  value: TValue;
}

export type FileEditableField =
  | FileEditableFieldBase<'tags', string[]>
  | FileEditableFieldBase<'toggle', boolean>;

export interface FileContext {
  filePath: string;
  fileName: string;
  extension: string;
  kind: FileKind;
  size: number;
  sizeLabel: string;
  createdAt: string;
  modifiedAt: string;
  summary: string;
  details?: string;
  editableFields: FileEditableField[];
  metadataSections: FileMetadataSection[];
  primaryActionId?: string;
  actions: FileAction[];
}
