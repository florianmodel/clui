import { contextBridge, ipcRenderer, webUtils } from 'electron';
import {
  IPCChannel,
  type DockerBuildRequest,
  type DockerBuildResponse,
  type DockerHealthResponse,
  type ExecRunRequest,
  type ExecRunResponse,
  type ExecLogEvent,
  type ExecCompleteEvent,
  type FilePickRequest,
  type FilePickResponse,
  type FileSavePickRequest,
  type FileSavePickResponse,
  type FileCopyRequest,
  type SchemaLoadRequest,
  type SchemaLoadResponse,
  type ExecSchemaRunRequest,
  type AnalyzerRunRequest,
  type AnalyzerRunResponse,
  type SchemaGenerateRequest,
  type SchemaGenerateResponse,
  type ConfigGetResponse,
  type ConfigSetRequest,
  type ValidateKeyRequest,
  type ValidateKeyResponse,
  type AnalysisProgressEvent,
  type ExecAutofixRequest,
  type ExecAutofixResponse,
  type SchemaSaveRequest,
  type SchemaSaveResponse,
  type GithubSearchRequest,
  type GithubSearchResponse,
  type ProjectInstallRequest,
  type ProjectInstallResponse,
  type ProjectListResponse,
  type ProjectGetRequest,
  type ProjectGetResponse,
  type ProjectRemoveRequest,
  type ProjectGenerateUiRequest,
  type ProjectGenerateUiResponse,
  type ProjectImproveRequest,
  type ProjectImproveResponse,
  type WorkflowAddRequest,
  type WorkflowAddResponse,
  type GithubRecommendRequest,
  type GithubRecommendResponse,
  type ProjectGetHistoryRequest,
  type ProjectGetHistoryResponse,
  type WorkflowFillRequest,
  type WorkflowFillResponse,
  type ProjectCheckUpdateRequest,
  type ProjectCheckUpdateResponse,
  type ProjectApplyUpdateRequest,
  type ProjectApplyUpdateResponse,
  type FileGetInfoRequest,
  type FileGetInfoResponse,
  type FileScanRequest,
  type FileScanResponse,
  type FileListRecentsResponse,
  type FileApplyChangesRequest,
  type FileApplyChangesResponse,
  type AppConfirmRequest,
  type AppConfirmResponse,
  type AppNotifyRequest,
  type DockerStatusEvent,
  type InstallProgressEvent,
  type NativeCapabilities,
  type ErrorLogGetResponse,
  type FolderScanRequest,
  type FolderScanResponse,
  type FolderListRecentsResponse,
  type FolderRunRequest,
  type FolderRunResponse,
  type FolderRunLogEvent,
  type FolderRunCompleteEvent,
  type FolderRunUrlEvent,
} from '@gui-bridge/shared';

// ── Drag-and-drop path resolution (Electron 32+) ──────────────────────────────
// File.path was removed in Electron 32. webUtils.getPathForFile() is only
// available in the isolated preload world. We intercept 'drop' in capture
// phase here, resolve all paths, then expose them as plain strings so the
// renderer can retrieve them synchronously in its own onDrop handler.

let lastDroppedPaths: string[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window?.addEventListener?.('drop', (e: any) => {
  const files: unknown[] = Array.from(e?.dataTransfer?.files ?? []);
  if (files.length === 0) return;
  lastDroppedPaths = files.flatMap((f) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = webUtils.getPathForFile(f as any);
      return typeof p === 'string' && p.length > 0 ? [p] : [];
    } catch {
      return [];
    }
  });
}, true /* capture phase — fires before React handlers */);

// ── Type-safe API exposed to the renderer via contextBridge. ──────────────────
// contextIsolation: true — renderer cannot access Node APIs directly.
export interface ElectronAPI {
  app: {
    getDesktopPath: () => Promise<string>;
    notify: (req: AppNotifyRequest) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
  };
  errorLog: {
    get: () => Promise<ErrorLogGetResponse>;
    clear: () => Promise<void>;
  };
  docker: {
    checkHealth: () => Promise<DockerHealthResponse>;
    buildImage: (req: DockerBuildRequest) => Promise<DockerBuildResponse>;
  };
  exec: {
    run: (req: ExecRunRequest) => Promise<ExecRunResponse>;
    schemaRun: (req: ExecSchemaRunRequest) => Promise<ExecRunResponse>;
    cancel: () => Promise<void>;
    autofix: (req: ExecAutofixRequest) => Promise<ExecAutofixResponse>;
  };
  schema: {
    load: (req: SchemaLoadRequest) => Promise<SchemaLoadResponse>;
    generate: (req: SchemaGenerateRequest) => Promise<SchemaGenerateResponse>;
    save: (req: SchemaSaveRequest) => Promise<SchemaSaveResponse>;
  };
  analyzer: {
    run: (req: AnalyzerRunRequest) => Promise<AnalyzerRunResponse>;
  };
  config: {
    get: () => Promise<ConfigGetResponse>;
    set: (req: ConfigSetRequest) => Promise<void>;
    validateKey: (req: ValidateKeyRequest) => Promise<ValidateKeyResponse>;
  };
  files: {
    pick: (req: FilePickRequest) => Promise<FilePickResponse>;
    savePick: (req: FileSavePickRequest) => Promise<FileSavePickResponse>;
    copy: (req: FileCopyRequest) => Promise<void>;
    showInFinder: (filePath: string) => Promise<void>;
    open: (filePath: string) => Promise<void>;
    getInfo: (req: FileGetInfoRequest) => Promise<FileGetInfoResponse>;
    scan: (req: FileScanRequest) => Promise<FileScanResponse>;
    listRecents: () => Promise<FileListRecentsResponse>;
    applyChanges: (req: FileApplyChangesRequest) => Promise<FileApplyChangesResponse>;
    /** Electron 32+: returns paths resolved from the most recent drop event. */
    getLastDroppedPaths: () => string[];
  };
  dialog: {
    confirm: (req: AppConfirmRequest) => Promise<AppConfirmResponse>;
  };
  clipboard: {
    write: (text: string) => Promise<void>;
  };
  github: {
    search: (req: GithubSearchRequest) => Promise<GithubSearchResponse>;
    recommend: (req: GithubRecommendRequest) => Promise<GithubRecommendResponse>;
  };
  folder: {
    scan: (req: FolderScanRequest) => Promise<FolderScanResponse>;
    listRecents: () => Promise<FolderListRecentsResponse>;
    run: (req: FolderRunRequest) => Promise<FolderRunResponse>;
    cancel: () => Promise<void>;
  };
  native: {
    checkCapabilities: () => Promise<NativeCapabilities>;
  };
  projects: {
    install: (req: ProjectInstallRequest) => Promise<ProjectInstallResponse>;
    list: () => Promise<ProjectListResponse>;
    get: (req: ProjectGetRequest) => Promise<ProjectGetResponse>;
    remove: (req: ProjectRemoveRequest) => Promise<{ ok: boolean; error?: string }>;
    openFolder: (projectId: string) => Promise<void>;
    generateUi: (req: ProjectGenerateUiRequest) => Promise<ProjectGenerateUiResponse>;
    improve: (req: ProjectImproveRequest) => Promise<ProjectImproveResponse>;
    addWorkflow: (req: WorkflowAddRequest) => Promise<WorkflowAddResponse>;
    getHistory: (req: ProjectGetHistoryRequest) => Promise<ProjectGetHistoryResponse>;
    clearHistory: (projectId: string) => Promise<void>;
    fillForm: (req: WorkflowFillRequest) => Promise<WorkflowFillResponse>;
    checkUpdate: (req: ProjectCheckUpdateRequest) => Promise<ProjectCheckUpdateResponse>;
    applyUpdate: (req: ProjectApplyUpdateRequest) => Promise<ProjectApplyUpdateResponse>;
  };
  on: {
    log: (callback: (event: ExecLogEvent) => void) => () => void;
    complete: (callback: (event: ExecCompleteEvent) => void) => () => void;
    folderRunLog: (callback: (event: FolderRunLogEvent) => void) => () => void;
    folderRunComplete: (callback: (event: FolderRunCompleteEvent) => void) => () => void;
    folderRunUrl: (callback: (event: FolderRunUrlEvent) => void) => () => void;
    analysisProgress: (callback: (event: AnalysisProgressEvent) => void) => () => void;
    installProgress: (callback: (event: InstallProgressEvent) => void) => () => void;
    dockerStatus: (callback: (event: DockerStatusEvent) => void) => () => void;
    menuAction: (callback: (action: string) => void) => () => void;
  };
}

const api: ElectronAPI = {
  app: {
    getDesktopPath: () => ipcRenderer.invoke(IPCChannel.APP_GET_PATH, 'desktop'),
    notify: (req: AppNotifyRequest) => ipcRenderer.invoke(IPCChannel.APP_NOTIFY, req),
    openExternal: (url: string) => ipcRenderer.invoke(IPCChannel.APP_OPEN_EXTERNAL, url),
  },

  errorLog: {
    get: () => ipcRenderer.invoke(IPCChannel.ERROR_LOG_GET),
    clear: () => ipcRenderer.invoke(IPCChannel.ERROR_LOG_CLEAR),
  },

  docker: {
    checkHealth: () =>
      ipcRenderer.invoke(IPCChannel.DOCKER_HEALTH),

    buildImage: (req: DockerBuildRequest) =>
      ipcRenderer.invoke(IPCChannel.DOCKER_BUILD, req),
  },

  exec: {
    run: (req: ExecRunRequest) =>
      ipcRenderer.invoke(IPCChannel.EXEC_RUN, req),
    schemaRun: (req: ExecSchemaRunRequest) =>
      ipcRenderer.invoke(IPCChannel.EXEC_SCHEMA_RUN, req),
    cancel: () =>
      ipcRenderer.invoke(IPCChannel.EXEC_CANCEL),
    autofix: (req: ExecAutofixRequest) =>
      ipcRenderer.invoke(IPCChannel.EXEC_AUTOFIX, req),
  },

  schema: {
    load: (req: SchemaLoadRequest) =>
      ipcRenderer.invoke(IPCChannel.SCHEMA_LOAD, req),
    generate: (req: SchemaGenerateRequest) =>
      ipcRenderer.invoke(IPCChannel.SCHEMA_GENERATE, req),
    save: (req: SchemaSaveRequest) =>
      ipcRenderer.invoke(IPCChannel.SCHEMA_SAVE, req),
  },

  analyzer: {
    run: (req: AnalyzerRunRequest) =>
      ipcRenderer.invoke(IPCChannel.ANALYZER_RUN, req),
  },

  config: {
    get: () => ipcRenderer.invoke(IPCChannel.CONFIG_GET),
    set: (req: ConfigSetRequest) => ipcRenderer.invoke(IPCChannel.CONFIG_SET, req),
    validateKey: (req: ValidateKeyRequest) =>
      ipcRenderer.invoke(IPCChannel.CONFIG_VALIDATE_KEY, req),
  },

  files: {
    pick: (req: FilePickRequest) =>
      ipcRenderer.invoke(IPCChannel.FILE_PICK, req),

    savePick: (req: FileSavePickRequest) =>
      ipcRenderer.invoke(IPCChannel.FILE_SAVE_PICK, req),

    copy: (req: FileCopyRequest) =>
      ipcRenderer.invoke(IPCChannel.FILE_COPY, req),

    showInFinder: (filePath: string) =>
      ipcRenderer.invoke(IPCChannel.FILE_SHOW_IN_FINDER, filePath),
    open: (filePath: string) =>
      ipcRenderer.invoke(IPCChannel.FILE_OPEN, filePath),
    getInfo: (req: FileGetInfoRequest) =>
      ipcRenderer.invoke(IPCChannel.FILE_GET_INFO, req),
    scan: (req: FileScanRequest) =>
      ipcRenderer.invoke(IPCChannel.FILE_SCAN, req),
    listRecents: () =>
      ipcRenderer.invoke(IPCChannel.FILE_LIST_RECENTS),
    applyChanges: (req: FileApplyChangesRequest) =>
      ipcRenderer.invoke(IPCChannel.FILE_APPLY_CHANGES, req),
    getLastDroppedPaths: () => lastDroppedPaths,
  },

  dialog: {
    confirm: (req: AppConfirmRequest) =>
      ipcRenderer.invoke(IPCChannel.APP_CONFIRM, req),
  },

  clipboard: {
    write: (text: string) =>
      ipcRenderer.invoke(IPCChannel.APP_CLIPBOARD_WRITE, text),
  },

  github: {
    search: (req: GithubSearchRequest) =>
      ipcRenderer.invoke(IPCChannel.GITHUB_SEARCH, req),
    recommend: (req: GithubRecommendRequest) =>
      ipcRenderer.invoke(IPCChannel.GITHUB_RECOMMEND, req),
  },

  folder: {
    scan: (req: FolderScanRequest) =>
      ipcRenderer.invoke(IPCChannel.FOLDER_SCAN, req),
    listRecents: () =>
      ipcRenderer.invoke(IPCChannel.FOLDER_LIST_RECENTS),
    run: (req: FolderRunRequest) =>
      ipcRenderer.invoke(IPCChannel.FOLDER_RUN, req),
    cancel: () =>
      ipcRenderer.invoke(IPCChannel.FOLDER_CANCEL),
  },

  native: {
    checkCapabilities: (): Promise<NativeCapabilities> =>
      ipcRenderer.invoke(IPCChannel.NATIVE_CHECK_CAPABILITIES),
  },

  projects: {
    install: (req: ProjectInstallRequest) =>
      ipcRenderer.invoke(IPCChannel.PROJECT_INSTALL, req),
    list: () =>
      ipcRenderer.invoke(IPCChannel.PROJECT_LIST),
    get: (req: ProjectGetRequest) =>
      ipcRenderer.invoke(IPCChannel.PROJECT_GET, req),
    remove: (req: ProjectRemoveRequest) =>
      ipcRenderer.invoke(IPCChannel.PROJECT_REMOVE, req),
    openFolder: (projectId: string) =>
      ipcRenderer.invoke(IPCChannel.PROJECT_OPEN_FOLDER, projectId),
    generateUi: (req: ProjectGenerateUiRequest) =>
      ipcRenderer.invoke(IPCChannel.PROJECT_GENERATE_UI, req),
    improve: (req: ProjectImproveRequest) =>
      ipcRenderer.invoke(IPCChannel.PROJECT_IMPROVE, req),
    addWorkflow: (req: WorkflowAddRequest) =>
      ipcRenderer.invoke(IPCChannel.WORKFLOW_ADD, req),
    getHistory: (req: ProjectGetHistoryRequest) =>
      ipcRenderer.invoke(IPCChannel.PROJECT_GET_HISTORY, req),
    clearHistory: (projectId: string) =>
      ipcRenderer.invoke(IPCChannel.PROJECT_CLEAR_HISTORY, projectId),
    fillForm: (req: WorkflowFillRequest) =>
      ipcRenderer.invoke(IPCChannel.WORKFLOW_FILL, req),
    checkUpdate: (req: ProjectCheckUpdateRequest) =>
      ipcRenderer.invoke(IPCChannel.PROJECT_CHECK_UPDATE, req),
    applyUpdate: (req: ProjectApplyUpdateRequest) =>
      ipcRenderer.invoke(IPCChannel.PROJECT_APPLY_UPDATE, req),
  },

  on: {
    log: (callback: (event: ExecLogEvent) => void) => {
      const listener = (_: Electron.IpcRendererEvent, event: ExecLogEvent) => callback(event);
      ipcRenderer.on(IPCChannel.EXEC_LOG, listener);
      return () => ipcRenderer.removeListener(IPCChannel.EXEC_LOG, listener);
    },

    complete: (callback: (event: ExecCompleteEvent) => void) => {
      const listener = (_: Electron.IpcRendererEvent, event: ExecCompleteEvent) => callback(event);
      ipcRenderer.on(IPCChannel.EXEC_COMPLETE, listener);
      return () => ipcRenderer.removeListener(IPCChannel.EXEC_COMPLETE, listener);
    },

    folderRunLog: (callback: (event: FolderRunLogEvent) => void) => {
      const listener = (_: Electron.IpcRendererEvent, event: FolderRunLogEvent) => callback(event);
      ipcRenderer.on(IPCChannel.FOLDER_RUN_LOG, listener);
      return () => ipcRenderer.removeListener(IPCChannel.FOLDER_RUN_LOG, listener);
    },

    folderRunComplete: (callback: (event: FolderRunCompleteEvent) => void) => {
      const listener = (_: Electron.IpcRendererEvent, event: FolderRunCompleteEvent) => callback(event);
      ipcRenderer.on(IPCChannel.FOLDER_RUN_COMPLETE, listener);
      return () => ipcRenderer.removeListener(IPCChannel.FOLDER_RUN_COMPLETE, listener);
    },

    folderRunUrl: (callback: (event: FolderRunUrlEvent) => void) => {
      const listener = (_: Electron.IpcRendererEvent, event: FolderRunUrlEvent) => callback(event);
      ipcRenderer.on(IPCChannel.FOLDER_RUN_URL, listener);
      return () => ipcRenderer.removeListener(IPCChannel.FOLDER_RUN_URL, listener);
    },

    analysisProgress: (callback: (event: AnalysisProgressEvent) => void) => {
      const listener = (_: Electron.IpcRendererEvent, event: AnalysisProgressEvent) => callback(event);
      ipcRenderer.on(IPCChannel.ANALYSIS_PROGRESS, listener);
      return () => ipcRenderer.removeListener(IPCChannel.ANALYSIS_PROGRESS, listener);
    },

    installProgress: (callback: (event: InstallProgressEvent) => void) => {
      const listener = (_: Electron.IpcRendererEvent, event: InstallProgressEvent) => callback(event);
      ipcRenderer.on(IPCChannel.PROJECT_INSTALL_PROGRESS, listener);
      return () => ipcRenderer.removeListener(IPCChannel.PROJECT_INSTALL_PROGRESS, listener);
    },

    dockerStatus: (callback: (event: DockerStatusEvent) => void) => {
      const listener = (_: Electron.IpcRendererEvent, event: DockerStatusEvent) => callback(event);
      ipcRenderer.on(IPCChannel.DOCKER_STATUS, listener);
      return () => ipcRenderer.removeListener(IPCChannel.DOCKER_STATUS, listener);
    },

    menuAction: (callback: (action: string) => void) => {
      const actions = ['menu:openSettings', 'menu:newProject', 'menu:toggleLogs'];
      const listeners = actions.map((channel) => {
        const listener = () => callback(channel);
        ipcRenderer.on(channel, listener);
        return { channel, listener };
      });
      return () => listeners.forEach(({ channel, listener }) => ipcRenderer.removeListener(channel, listener));
    },
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
