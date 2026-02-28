# Chunk 1: Electron Shell + Docker Manager

## Goal

A working Electron app that can build a Docker image, run a CLI command inside a container, stream logs to the UI, and handle file I/O (input file in, output file out).

## Proof of Life

When this chunk is done, the user can:
1. Launch the app (`npm run dev`)
2. See a simple UI with a "Run FFmpeg Test" button and a log panel
3. Click the button → app builds an ffmpeg Docker image (first time only)
4. App runs `ffmpeg -i /input/sample.mp4 -vcodec libx264 /output/converted.avi` inside the container
5. stdout/stderr appears in the log panel in real-time
6. On completion, a "Show Output" button appears → opens the output directory

## Step-by-Step Implementation

### Step 1: Initialize monorepo

```bash
mkdir -p packages/main packages/renderer packages/shared
```

Root `package.json`:
```json
{
  "name": "gui-bridge",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "npm run dev --workspace=packages/main",
    "build": "npm run build --workspace=packages/renderer && npm run build --workspace=packages/main",
    "lint": "eslint packages/*/src/**/*.ts packages/*/src/**/*.tsx"
  }
}
```

### Step 2: Set up `packages/shared`

Types shared between main and renderer.

**Files to create:**
- `packages/shared/src/ui-schema.ts` — UISchema types (copy from ARCHITECTURE.md)
- `packages/shared/src/ipc-types.ts` — IPC channel enum and message types
- `packages/shared/src/index.ts` — barrel export
- `packages/shared/package.json`
- `packages/shared/tsconfig.json`

### Step 3: Set up `packages/renderer`

React app using Vite.

**Setup:**
```bash
cd packages/renderer
npm create vite@latest . -- --template react-ts
```

**Key components for Chunk 1 (keep it minimal):**
- `App.tsx` — main layout with two panels
- `components/LogPanel.tsx` — scrollable log output, monospace font, auto-scroll
- `components/TestRunner.tsx` — "Run FFmpeg Test" button with status indicator
- `hooks/useIPC.ts` — hook wrapping `window.electronAPI` calls

**The renderer communicates with main via `contextBridge`-exposed API:**
```typescript
// preload.ts exposes:
window.electronAPI = {
  docker: {
    checkHealth: () => ipcRenderer.invoke('docker:health'),
    buildImage: (projectId, context, dockerfile) => ipcRenderer.invoke('docker:build', ...),
    runCommand: (imageId, command, opts) => ipcRenderer.invoke('exec:run', ...),
  },
  onLog: (callback) => ipcRenderer.on('exec:log', (_, data) => callback(data)),
  onComplete: (callback) => ipcRenderer.on('exec:complete', (_, data) => callback(data)),
  files: {
    openDirectory: (path) => ipcRenderer.invoke('file:showInFinder', path),
    pickFile: (opts) => ipcRenderer.invoke('file:pick', opts),
  }
};
```

### Step 4: Set up `packages/main`

Electron main process.

**Entry point: `src/index.ts`**
- Create BrowserWindow loading the Vite dev server (dev) or built files (prod)
- Register IPC handlers
- Check Docker health on startup

**Docker Manager: `src/docker/DockerManager.ts`**
- Use `dockerode` npm package
- Methods:
  - `checkHealth()` — ping Docker daemon
  - `buildImage(tag, dockerfilePath, contextPath)` — build with progress streaming
  - `runCommand(image, cmd, volumes, onLog)` — create container, start, attach streams
  - `removeImage(tag)` — cleanup

**IPC Handlers: `src/ipc/handlers.ts`**
- Wire up IPC channels to DockerManager methods
- Handle `exec:run`: build image if needed → run command → stream logs → send completion

**Preload: `src/preload.ts`**
- Expose typed API via contextBridge

### Step 5: Create test Dockerfile

`docker/ffmpeg-test.Dockerfile`:
```dockerfile
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
```

### Step 6: Create a sample input file

Include a tiny sample video or generate one:
```bash
# Generate a 2-second test video (can be done in the ffmpeg container itself)
ffmpeg -f lavfi -i testsrc=duration=2:size=320x240:rate=30 -pix_fmt yuv420p sample.mp4
```

Or just instruct the user to provide any .mp4 file for testing.

### Step 7: Wire it all together

The test flow:
1. App starts → checks Docker health → shows green/red indicator
2. User clicks "Run FFmpeg Test"
3. Main process:
   a. Checks if `gui-bridge-ffmpeg-test` image exists
   b. If not, builds it from `docker/ffmpeg-test.Dockerfile`
   c. Creates temp dirs for input/output
   d. Copies sample file to input dir (or lets user pick a file)
   e. Runs container with volume mounts
   f. Streams output to renderer
4. On completion, shows output file path with "Open" button

## Technical Notes

- **Electron version:** Use latest stable (v33+)
- **Vite for renderer:** Faster HMR than webpack. Use `@electron-toolkit/preload` pattern.
- **dockerode:** `npm install dockerode @types/dockerode` in `packages/main`
- **IPC pattern:** Use `ipcMain.handle` for request/response, `webContents.send` for streaming
- **File paths:** Use `app.getPath('userData')` for `~/.gui-bridge/` equivalent
- **Security:** Enable `contextIsolation: true`, `nodeIntegration: false` in BrowserWindow

## Dependencies

**packages/main:**
- electron
- dockerode, @types/dockerode
- electron-builder (dev)

**packages/renderer:**
- react, react-dom
- vite, @vitejs/plugin-react
- typescript

**packages/shared:**
- typescript (dev only)

## Out of Scope for Chunk 1

- GitHub integration (Chunk 5)
- CLI analysis (Chunk 3-4)
- Dynamic UI rendering from schema (Chunk 2)
- Multiple projects (just hardcoded ffmpeg test)
- Pretty UI (basic is fine, polish in Chunk 6)
