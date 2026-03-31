// Type declaration for the contextBridge-exposed API.
// Matches the ElectronAPI interface in packages/main/src/preload.ts.

import type {
  DockerBuildRequest,
  DockerBuildResponse,
  DockerHealthResponse,
  ExecRunRequest,
  ExecRunResponse,
  ExecLogEvent,
  ExecCompleteEvent,
  FilePickRequest,
  FilePickResponse,
  FileSavePickRequest,
  FileSavePickResponse,
  FileCopyRequest,
  SchemaLoadRequest,
  SchemaLoadResponse,
  ExecSchemaRunRequest,
  AnalyzerRunRequest,
  AnalyzerRunResponse,
  SchemaGenerateRequest,
  SchemaGenerateResponse,
  ConfigGetResponse,
  ConfigSetRequest,
  ValidateKeyRequest,
  ValidateKeyResponse,
  AnalysisProgressEvent,
  ExecAutofixRequest,
  ExecAutofixResponse,
  SchemaSaveRequest,
  SchemaSaveResponse,
  GithubSearchRequest,
  GithubSearchResponse,
  ProjectInstallRequest,
  ProjectInstallResponse,
  ProjectListResponse,
  ProjectGetRequest,
  ProjectGetResponse,
  ProjectRemoveRequest,
  ProjectGenerateUiRequest,
  ProjectGenerateUiResponse,
  ProjectImproveRequest,
  ProjectImproveResponse,
  WorkflowAddRequest,
  WorkflowAddResponse,
  GithubRecommendRequest,
  GithubRecommendResponse,
  ProjectGetHistoryRequest,
  ProjectGetHistoryResponse,
  WorkflowFillRequest,
  WorkflowFillResponse,
  ProjectCheckUpdateRequest,
  ProjectCheckUpdateResponse,
  ProjectApplyUpdateRequest,
  ProjectApplyUpdateResponse,
  FileGetInfoRequest,
  FileGetInfoResponse,
  FileScanRequest,
  FileScanResponse,
  FileListRecentsResponse,
  FileApplyChangesRequest,
  FileApplyChangesResponse,
  AppConfirmRequest,
  AppConfirmResponse,
  AppNotifyRequest,
  DockerStatusEvent,
  InstallProgressEvent,
  NativeCapabilities,
  ErrorLogGetResponse,
  FolderScanRequest,
  FolderScanResponse,
  FolderListRecentsResponse,
  FolderRunRequest,
  FolderRunResponse,
  FolderRunLogEvent,
  FolderRunCompleteEvent,
  FolderRunUrlEvent,
} from '@gui-bridge/shared';

declare global {
  interface Window {
    electronAPI: {
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
    };
  }
}
