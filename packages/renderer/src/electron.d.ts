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
} from '@gui-bridge/shared';

declare global {
  interface Window {
    electronAPI: {
      docker: {
        checkHealth: () => Promise<DockerHealthResponse>;
        buildImage: (req: DockerBuildRequest) => Promise<DockerBuildResponse>;
      };
      exec: {
        run: (req: ExecRunRequest) => Promise<ExecRunResponse>;
      };
      files: {
        pick: (req: FilePickRequest) => Promise<FilePickResponse>;
        showInFinder: (filePath: string) => Promise<void>;
      };
      on: {
        log: (callback: (event: ExecLogEvent) => void) => () => void;
        complete: (callback: (event: ExecCompleteEvent) => void) => () => void;
      };
    };
  }
}
