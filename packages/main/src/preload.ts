import { contextBridge, ipcRenderer } from 'electron';
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
} from '@gui-bridge/shared';

// Type-safe API exposed to the renderer via contextBridge.
// contextIsolation: true — renderer cannot access Node APIs directly.
export interface ElectronAPI {
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
}

const api: ElectronAPI = {
  docker: {
    checkHealth: () =>
      ipcRenderer.invoke(IPCChannel.DOCKER_HEALTH),

    buildImage: (req: DockerBuildRequest) =>
      ipcRenderer.invoke(IPCChannel.DOCKER_BUILD, req),
  },

  exec: {
    run: (req: ExecRunRequest) =>
      ipcRenderer.invoke(IPCChannel.EXEC_RUN, req),
  },

  files: {
    pick: (req: FilePickRequest) =>
      ipcRenderer.invoke(IPCChannel.FILE_PICK, req),

    showInFinder: (filePath: string) =>
      ipcRenderer.invoke(IPCChannel.FILE_SHOW_IN_FINDER, filePath),
  },

  on: {
    log: (callback: (event: ExecLogEvent) => void) => {
      const listener = (_: Electron.IpcRendererEvent, event: ExecLogEvent) => callback(event);
      ipcRenderer.on(IPCChannel.EXEC_LOG, listener);
      // Return cleanup function
      return () => ipcRenderer.removeListener(IPCChannel.EXEC_LOG, listener);
    },

    complete: (callback: (event: ExecCompleteEvent) => void) => {
      const listener = (_: Electron.IpcRendererEvent, event: ExecCompleteEvent) => callback(event);
      ipcRenderer.on(IPCChannel.EXEC_COMPLETE, listener);
      return () => ipcRenderer.removeListener(IPCChannel.EXEC_COMPLETE, listener);
    },
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
