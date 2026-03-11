# CLUI — CLAUDE.md

> Claude Code reads this file automatically at session start. Keep it updated.

## What is this project?

**CLUI** (formerly GUI Bridge) is a desktop app (Electron) that lets non-technical users run any GitHub CLI tool through an auto-generated graphical interface. Users search for a project, install it into a Docker container, and the app analyzes the tool's CLI to generate a point-and-click UI.

## Tech Stack

- **App shell:** Electron (TypeScript) — Mac first, then Linux/Windows
- **Frontend:** React + TypeScript (inside Electron renderer)
- **Backend services:** Node.js/TypeScript (Electron main process)
- **Containerization:** Docker (via dockerode)
- **CLI analysis:** LLM-powered (Claude API via Anthropic SDK)
- **Package manager:** npm workspaces (monorepo)

## Project Structure

```
clui/                              # repo root (also Electron app root — "main" in root package.json)
├── CLAUDE.md                      # This file
├── ARCHITECTURE.md                # Full architecture doc
├── CHUNK_1.md                     # Chunk 1 spec (done)
├── package.json                   # Root workspace + dev/build scripts
├── tsconfig.json                  # Project-references config
├── .gitignore
├── packages/
│   ├── main/                      # Electron main process
│   │   ├── src/
│   │   │   ├── index.ts           # Electron entry (BrowserWindow, loads Vite dev server in dev)
│   │   │   ├── preload.ts         # contextBridge API exposed to renderer
│   │   │   ├── docker/
│   │   │   │   └── DockerManager.ts   # dockerode wrapper
│   │   │   ├── executor/
│   │   │   │   └── ExecutorBridge.ts  # buildCommand + collectInputFiles (Chunk 2)
│   │   │   └── ipc/
│   │   │       └── handlers.ts    # ipcMain.handle registrations
│   │   └── package.json
│   ├── renderer/                  # React UI (Vite)
│   │   ├── src/
│   │   │   ├── App.tsx            # Top bar + two-panel layout (schema picker)
│   │   │   ├── electron.d.ts      # window.electronAPI types
│   │   │   ├── components/
│   │   │   │   ├── DynamicGUI/    # Generic schema-driven UI (Chunk 2)
│   │   │   │   │   ├── DynamicGUI.tsx      # Top-level: header + workflow tabs
│   │   │   │   │   ├── WorkflowSelector.tsx # Tab switcher
│   │   │   │   │   ├── WorkflowPanel.tsx    # Form + run button + outputs
│   │   │   │   │   ├── StepRenderer.tsx     # Maps step.type → input component
│   │   │   │   │   ├── CommandPreview.tsx   # Expandable command preview
│   │   │   │   │   ├── index.ts             # Barrel export
│   │   │   │   │   └── inputs/
│   │   │   │   │       ├── TextInput.tsx
│   │   │   │   │       ├── NumberInput.tsx
│   │   │   │   │       ├── Dropdown.tsx
│   │   │   │   │       ├── RadioGroup.tsx
│   │   │   │   │       ├── CheckboxInput.tsx
│   │   │   │   │       ├── ToggleInput.tsx
│   │   │   │   │       ├── FileInput.tsx
│   │   │   │   │       ├── DirectoryInput.tsx
│   │   │   │   │       └── TextareaInput.tsx
│   │   │   │   ├── TestRunner.tsx # Chunk 1 test UI (kept for reference)
│   │   │   │   └── LogPanel.tsx   # Scrollable log stream (stdout/stderr/system)
│   │   │   └── hooks/
│   │   │       └── useIPC.ts      # useLogEvents / useCompleteEvent hooks
│   │   ├── index.html
│   │   └── package.json
│   └── shared/                    # Shared types (no runtime deps)
│       ├── src/
│       │   ├── ipc-types.ts       # IPCChannel enum + request/response types
│       │   ├── ui-schema.ts       # UISchema types (contract for Chunks 2-4)
│       │   └── index.ts           # Barrel export
│       └── package.json
├── docker/
│   ├── ffmpeg-test.Dockerfile     # ubuntu:24.04 + ffmpeg (Chunk 1 test image)
│   └── imagemagick-test.Dockerfile # ubuntu:24.04 + imagemagick (Chunk 2 test image)
└── schemas/
    └── examples/
        ├── ffmpeg.json            # ffmpeg UI schema (2 workflows)
        └── imagemagick.json       # imagemagick UI schema (2 workflows)
```

## Chunk Status

| Chunk | Description | Status |
|-------|-------------|--------|
| 1 | Electron shell + Docker manager | **COMPLETE** |
| 2 | UI schema spec + dynamic renderer | **COMPLETE** |
| 3 | Static CLI introspection (argparse/click/help) | **COMPLETE** |
| 4 | LLM-powered UI generation (Claude API) | **COMPLETE** |
| 5 | Project browser + auto-setup | **COMPLETE** |
| 6 | Polish, error handling, UX | **COMPLETE** |
| 7+ | Tool chaining / pipelines (future) | NOT STARTED |

## Key Commands

```bash
# Install all dependencies (run once)
npm install

# Dev mode — builds shared+main, starts Vite dev server + Electron
npm run dev

# Production build (all packages)
npm run build

# After editing packages/main TypeScript in dev, rebuild main and restart:
npm run build -w packages/main
# Then Ctrl-C and re-run npm run dev (or restart Electron only)
```

> **Note:** Hot reload only applies to the renderer (Vite HMR). Changes to `packages/main` require a rebuild + Electron restart.

## Conventions

- All source in TypeScript, strict mode
- Use `async/await` everywhere, no raw promises
- IPC between main/renderer uses typed channels (see `shared/ipc-types.ts`)
- Docker interactions go through `packages/main/src/docker/DockerManager.ts`
- UI schema is the contract between analyzer and renderer — never bypass it
- Error messages should be human-readable, not stack traces
- Every module exports from an `index.ts` barrel file

## Architecture Decisions Made in Chunk 1

### IPC pattern
- `ipcMain.handle` for all request/response (renderer awaits result)
- `webContents.send` for streaming events: `EXEC_LOG` and `EXEC_COMPLETE`
- All channel names in the `IPCChannel` enum in `shared/ipc-types.ts`
- Renderer subscribes via `window.electronAPI.on.log(cb)` and `on.complete(cb)` — both return cleanup functions for use in `useEffect`

### Path resolution
- Renderer passes relative paths (e.g. `'docker/ffmpeg-test.Dockerfile'`)
- Main process resolves them with `path.resolve(app.getAppPath(), relativePath)`
- `app.getAppPath()` returns the project root because `"main": "packages/main/dist/index.js"` is in the root `package.json`

### Docker build context
- Context = project root; `src` = `[dockerfileRelative]` (only the Dockerfile is sent in the build tar, sufficient since the ffmpeg Dockerfile has no COPY instructions)
- Image existence is checked before building — skips rebuild if tag already exists
- Build progress events are forwarded to the renderer as `EXEC_LOG` messages

### File I/O
- `inputFiles?: string[]` in `ExecRunRequest` — renderer passes host file paths; main copies them into a temp dir mounted as `/input` (read-only)
- Output dir is a fresh temp dir per run, mounted as `/output` (read-write)
- Input temp dir is cleaned up after run; output dir is kept so user can open files
- Containers run with `NetworkMode: 'none'` (no internet) after image build

### Security
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` (sandbox: false needed for `ipcRenderer` in preload)
- All Node/Electron APIs are accessed exclusively via `contextBridge` in preload

## Important Patterns

### IPC (Main ↔ Renderer)
```typescript
// shared/ipc-types.ts defines all channels and message shapes
// main/ipc/handlers.ts has ipcMain.handle registrations
// renderer uses useLogEvents() / useCompleteEvent() hooks from hooks/useIPC.ts
// window.electronAPI type is declared in renderer/src/electron.d.ts
```

### UI Schema
The UI schema (see `shared/ui-schema.ts`) is the central contract. The analyzer produces it, the renderer consumes it. Never couple them directly. (Used from Chunk 2 onwards.)

### Docker Volumes
- Input files: mounted read-only at `/input/` in container
- Output files: mounted at `/output/` in container
- Both map to temp dirs on host managed by `DockerManager`

## Environment

- Anthropic API key: stored in `~/.gui-bridge/config.json` (for now, developer's own key)
- Docker: must be installed and running on host (Docker Desktop for Mac)
- Node: >= 20
- Platform: macOS first (Darwin), then Linux, then Windows
