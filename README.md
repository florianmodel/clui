# CLUI

**Turn any GitHub CLI tool into a point-and-click interface — automatically.**

CLUI lets non-technical users run command-line tools without touching a terminal. Search for any CLI project on GitHub, install it, and the app analyzes its interface using AI to generate a custom GUI. No configuration, no coding.

![CLUI screenshot placeholder](docs/screenshot.png)

---

## How it works

1. **Search** — find any CLI tool on GitHub (or describe what you want and let AI suggest options)
2. **Install** — CLUI clones the repo and builds a Docker container automatically
3. **Use** — AI analyzes the CLI and generates a point-and-click interface tailored to that tool

Every tool runs in an isolated Docker container. No setup, no dependency conflicts, no system pollution.

---

## Features

- **AI-generated UI** — Claude reads the tool's `--help` output and README to generate form-based workflows with the right input types (file pickers, dropdowns, sliders, toggles)
- **Finder mode** — choose a folder or a single file and CLUI explains what it sees, offers safe actions, and suggests matching tools in plain language
- **New Use Case** — describe a new task in plain language and AI adds a new workflow tab on the fly
- **Improve UI** — give feedback and Claude regenerates the interface to match your needs
- **AI repo recommendation** — describe what you want to do ("merge PDFs", "compress videos") and get curated GitHub suggestions
- **Auto-fix** — if a command fails, AI diagnoses the error and suggests a corrected command
- **Dark / light mode** — clean neutral design, no distractions
- **Output panel** — live stdout/stderr stream with progress detection and copy-to-clipboard

---

## Requirements

- **macOS** (Linux/Windows support planned)
- **Docker Desktop** — must be installed and running
- **Anthropic API key** — for UI generation and AI features ([get one here](https://console.anthropic.com))
- Node.js ≥ 20 (for development only)

---

## Getting started

### Run from source

```bash
# 1. Clone
git clone https://github.com/florianmodel/clui.git
cd clui

# 2. Install dependencies
npm install

# 3. Start
npm run dev
```

On first launch, open **Settings** and enter your Anthropic API key.

### Install a tool

1. Click **Add New Tool** in the sidebar
2. Search for any CLI project (e.g. "ffmpeg", "imagemagick", "yt-dlp")
3. Click **Install** — the app clones the repo and builds a Docker image
4. Once installed, click **Generate UI** — AI inspects the CLI and creates a workflow interface

### Inspect a file or folder

1. Click **Finder** in the sidebar
2. Choose either **Choose folder…** or **Choose file…**
3. Let CLUI explain what it found in plain language
4. For folders, use the main suggested action or open a matching tool
5. For files, edit safe Finder-style details like tags, locked state, and file extension visibility, then open a matching tool if needed

---

## Example tools that work well

| Tool | What it does |
|------|-------------|
| [FFmpeg](https://github.com/FFmpeg/FFmpeg) | Video/audio conversion |
| [ImageMagick](https://github.com/ImageMagick/ImageMagick) | Image processing |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Video downloader |
| [Pandoc](https://github.com/jgm/pandoc) | Document conversion |
| [ExifTool](https://github.com/exiftool/exiftool) | Metadata editor |

Any tool that has a `--help` flag or argparse/click-based CLI is a good candidate.

---

## Architecture

```
clui/
├── packages/
│   ├── main/        # Electron main process (Node.js)
│   │   ├── analyzer/    # CLI introspection + LLM UI generation
│   │   ├── docker/      # Container lifecycle (dockerode)
│   │   ├── executor/    # Command builder + file I/O
│   │   └── ipc/         # IPC handlers
│   ├── renderer/    # React UI (Vite)
│   │   └── components/  # DynamicGUI, ProjectBrowser, LogPanel…
│   └── shared/      # TypeScript types (IPC channels, UISchema)
└── docker/          # Test Dockerfiles
```

- **Main process** — manages Docker, runs analysis, handles all file system and network access
- **Renderer** — pure React UI, communicates with main via typed IPC channels
- **Containers** — run with `NetworkMode: none`, auto-removed after exit, isolated from host

---

## Tech stack

- [Electron](https://electronjs.org) — desktop shell
- [React](https://react.dev) + [Vite](https://vitejs.dev) — UI
- [dockerode](https://github.com/apocas/dockerode) — Docker API client
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) — AI features (claude-haiku-4-5)
- TypeScript throughout, npm workspaces monorepo

---

## Development

```bash
npm run dev          # Start Electron + Vite dev server
npm run build        # Production build

# After editing packages/main:
npm run build -w packages/main   # Rebuild main
# Then restart Electron

# Tests
npm test --workspace=packages/main   # 105 unit tests (vitest)
```

---

## License

MIT
