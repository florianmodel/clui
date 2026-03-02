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
      };
      schema: {
        load: (req: SchemaLoadRequest) => Promise<SchemaLoadResponse>;
        generate: (req: SchemaGenerateRequest) => Promise<SchemaGenerateResponse>;
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
      };
      on: {
        log: (callback: (event: ExecLogEvent) => void) => () => void;
        complete: (callback: (event: ExecCompleteEvent) => void) => () => void;
        analysisProgress: (callback: (event: AnalysisProgressEvent) => void) => () => void;
      };
    };
  }
}
