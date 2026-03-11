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
  FileGetInfoRequest,
  FileGetInfoResponse,
  AppConfirmRequest,
  AppConfirmResponse,
  DockerStatusEvent,
  InstallProgressEvent,
} from '@gui-bridge/shared';

declare global {
  interface Window {
    electronAPI: {
      app: {
        getDesktopPath: () => Promise<string>;
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
      projects: {
        install: (req: ProjectInstallRequest) => Promise<ProjectInstallResponse>;
        list: () => Promise<ProjectListResponse>;
        get: (req: ProjectGetRequest) => Promise<ProjectGetResponse>;
        remove: (req: ProjectRemoveRequest) => Promise<{ ok: boolean; error?: string }>;
        openFolder: (projectId: string) => Promise<void>;
        generateUi: (req: ProjectGenerateUiRequest) => Promise<ProjectGenerateUiResponse>;
        improve: (req: ProjectImproveRequest) => Promise<ProjectImproveResponse>;
        addWorkflow: (req: WorkflowAddRequest) => Promise<WorkflowAddResponse>;
      };
      on: {
        log: (callback: (event: ExecLogEvent) => void) => () => void;
        complete: (callback: (event: ExecCompleteEvent) => void) => () => void;
        analysisProgress: (callback: (event: AnalysisProgressEvent) => void) => () => void;
        installProgress: (callback: (event: InstallProgressEvent) => void) => () => void;
        dockerStatus: (callback: (event: DockerStatusEvent) => void) => () => void;
        menuAction: (callback: (action: string) => void) => () => void;
      };
    };
  }
}
