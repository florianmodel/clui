# GUI Bridge — Architecture

## Vision

Turn any GitHub CLI tool into a point-and-click desktop app. No terminal required.

**User flow:**
1. Search for a tool (e.g. "video converter")
2. Find a GitHub project → click "Install"
3. App clones repo, builds Docker container with all dependencies
4. App analyzes the CLI and generates a graphical interface
5. User interacts with buttons, dropdowns, file pickers — not commands
6. Future: chain multiple tools into pipelines (like n8n for CLI tools)

---

## System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Electron App                           │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Renderer Process (React)                │ │
│  │  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  │ │
│  │  │ Project  │  │  Dynamic GUI │  │   Output /   │  │ │
│  │  │ Browser  │  │   Renderer   │  │  Log Panel   │  │ │
│  │  └────┬─────┘  └──────┬───────┘  └──────┬───────┘  │ │
│  │       │               │                 │           │ │
│  │  ─────┴───────────────┴─────────────────┴────────── │ │
│  │                    IPC Bridge                        │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                         │                                │
│  ┌──────────────────────▼──────────────────────────────┐ │
│  │              Main Process (Node.js)                  │ │
│  │                                                      │ │
│  │  ┌─────────────┐  ┌────────────┐  ┌──────────────┐  │ │
│  │  │   GitHub    │  │  Analyzer  │  │   Executor   │  │ │
│  │  │   Manager   │  │  Service   │  │   Bridge     │  │ │
│  │  └──────┬──────┘  └─────┬──────┘  └──────┬───────┘  │ │
│  │         │               │                │           │ │
│  │  ┌──────▼───────────────▼────────────────▼────────┐  │ │
│  │  │              Docker Manager                     │  │ │
│  │  │  - Image building    - Container lifecycle      │  │ │
│  │  │  - Volume mounting   - Log streaming            │  │ │
│  │  └────────────────────────┬───────────────────────┘  │ │
│  └───────────────────────────┼──────────────────────────┘ │
└──────────────────────────────┼────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │    Docker Engine    │
                    │  (host-installed)   │
                    └─────────────────────┘
```

---

## Core Components

### 1. Docker Manager (`packages/main/src/docker/`)

Manages the full container lifecycle for installed projects.

**Responsibilities:**
- Build Docker images from repo Dockerfiles or auto-generated ones
- Create/start/stop/remove containers
- Mount input/output volumes
- Stream stdout/stderr back to renderer via IPC
- Health checks (is Docker running?)

**Key class: `DockerManager`**
```typescript
interface DockerManager {
  checkHealth(): Promise<boolean>;
  buildImage(projectId: string, context: string, dockerfile: string): Promise<string>;
  runCommand(imageId: string, command: string, opts: RunOptions): Promise<ExecutionResult>;
  streamLogs(containerId: string, callback: (line: string) => void): void;
  cleanup(projectId: string): Promise<void>;
}

interface RunOptions {
  inputDir?: string;     // Host path → /input/ in container
  outputDir?: string;    // Host path → /output/ in container
  env?: Record<string, string>;
  timeout?: number;      // Kill after N seconds
}

interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  outputFiles: string[]; // Files found in output dir
}
```

**Docker strategy per project type:**
| Detected Stack | Base Image | Install Method |
|----------------|-----------|----------------|
| Has Dockerfile | Use as-is | `docker build` |
| Python + requirements.txt | `python:3.12-slim` | `pip install -r requirements.txt` |
| Python + pyproject.toml | `python:3.12-slim` | `pip install .` |
| Node + package.json | `node:20-slim` | `npm install` |
| Rust + Cargo.toml | `rust:1-slim` | `cargo build --release` |
| Go + go.mod | `golang:1.22-slim` | `go build` |
| Unknown | `ubuntu:24.04` | Try README instructions |

---

### 2. Analyzer Service (`packages/main/src/analyzer/`)

Inspects a cloned repo and produces a UI schema.

**Two-phase analysis:**

**Phase A — Static Introspection (Chunk 3)**
- Detect language/framework from files
- For Python: parse AST to find argparse/click/typer definitions
- For any tool: run `tool --help` inside container, parse output
- Read README.md for usage examples
- Output: raw `CapabilityDump`

```typescript
interface CapabilityDump {
  projectName: string;
  language: string;
  entrypoint: string;           // e.g. "python main.py" or "./converter"
  arguments: ArgumentInfo[];
  subcommands: SubcommandInfo[];
  readmeExcerpt: string;        // First 2000 chars of README
  examples: string[];           // Usage examples found in README/help
}

interface ArgumentInfo {
  name: string;          // e.g. "--output-format"
  shortName?: string;    // e.g. "-f"
  type: string;          // string, int, float, bool, file, choice
  required: boolean;
  default?: string;
  choices?: string[];
  description: string;
}
```

**Phase B — LLM Enhancement (Chunk 4)**
- Send `CapabilityDump` + README to Claude API
- Prompt: "Given this CLI tool, produce a UISchema with user-friendly workflows"
- LLM groups arguments into logical steps, writes human-readable labels
- LLM generates guidance text ("Select your input video file")
- Output: `UISchema` (see below)

---

### 3. UI Schema (`packages/shared/src/ui-schema.ts`)

The contract between Analyzer and Renderer. This is the most important type in the system.

```typescript
interface UISchema {
  projectId: string;
  projectName: string;
  description: string;
  version: string;
  workflows: Workflow[];
}

interface Workflow {
  id: string;
  name: string;                    // e.g. "Convert Video"
  description: string;             // e.g. "Convert between video formats"
  guidance?: string;               // AI-generated help text
  steps: Step[];
  execute: ExecutionConfig;
}

interface Step {
  id: string;
  label: string;
  description?: string;
  guidance?: string;               // e.g. "Select the video you want to convert"
  type: StepType;
  required: boolean;
  default?: string | number | boolean;
  placeholder?: string;
  
  // Type-specific
  options?: SelectOption[];        // For 'dropdown' and 'radio'
  accept?: string;                 // For 'file_input', e.g. ".mp4,.avi,.mkv"
  multiple?: boolean;              // For 'file_input', allow multiple files
  min?: number;                    // For 'number'
  max?: number;                    // For 'number'
  validation?: ValidationRule;
}

type StepType =
  | 'text_input'
  | 'number'
  | 'dropdown'
  | 'radio'
  | 'checkbox'
  | 'file_input'
  | 'directory_input'
  | 'textarea'
  | 'toggle';

interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

interface ValidationRule {
  pattern?: string;        // Regex
  message?: string;        // Error message
}

interface ExecutionConfig {
  command: string;         // Template with {step_id} placeholders
  outputDir: string;       // Where to find results, usually "/output"
  outputPattern?: string;  // Glob for expected output files
  successMessage?: string; // e.g. "Your video has been converted!"
}
```

**Example schema for ffmpeg:**
```json
{
  "projectId": "ffmpeg",
  "projectName": "FFmpeg",
  "description": "Universal media converter",
  "version": "1.0.0",
  "workflows": [
    {
      "id": "convert-video",
      "name": "Convert Video",
      "description": "Convert a video file to a different format",
      "guidance": "Select your video file, choose the output format, and hit Convert.",
      "steps": [
        {
          "id": "input_file",
          "label": "Input Video",
          "guidance": "Select the video file you want to convert",
          "type": "file_input",
          "required": true,
          "accept": ".mp4,.avi,.mkv,.mov,.webm,.flv"
        },
        {
          "id": "output_format",
          "label": "Output Format",
          "type": "dropdown",
          "required": true,
          "default": "mp4",
          "options": [
            { "value": "mp4", "label": "MP4", "description": "Best compatibility" },
            { "value": "avi", "label": "AVI", "description": "Legacy format" },
            { "value": "webm", "label": "WebM", "description": "Web-optimized" },
            { "value": "mov", "label": "MOV", "description": "Apple/Final Cut" }
          ]
        },
        {
          "id": "quality",
          "label": "Quality",
          "type": "dropdown",
          "required": false,
          "default": "medium",
          "options": [
            { "value": "high", "label": "High (slower)" },
            { "value": "medium", "label": "Medium (balanced)" },
            { "value": "low", "label": "Low (fastest)" }
          ]
        }
      ],
      "execute": {
        "command": "ffmpeg -i /input/{input_file} -preset {quality} /output/output.{output_format}",
        "outputDir": "/output",
        "successMessage": "Your video has been converted!"
      }
    }
  ]
}
```

---

### 4. Dynamic GUI Renderer (`packages/renderer/src/components/DynamicGUI/`)

Takes a `UISchema` and renders a fully interactive form.

**Component tree:**
```
DynamicGUI
├── WorkflowSelector        # Tabs or sidebar for multiple workflows
├── WorkflowPanel
│   ├── GuidanceBar         # AI-generated help text
│   ├── StepRenderer        # Maps step.type → input component
│   │   ├── TextInput
│   │   ├── NumberInput
│   │   ├── Dropdown
│   │   ├── FileInput       # Opens native file picker via Electron dialog
│   │   ├── DirectoryInput
│   │   ├── RadioGroup
│   │   ├── Checkbox
│   │   ├── Toggle
│   │   └── Textarea
│   ├── ExecuteButton       # "Convert", "Run", etc.
│   └── ValidationSummary
└── OutputPanel
    ├── LogStream           # Real-time stdout/stderr
    ├── ProgressBar         # If parseable from output
    └── OutputFiles         # List of produced files with "Open" / "Show in Finder"
```

---

### 5. GitHub Manager (`packages/main/src/github/`)

Handles project discovery and installation.

```typescript
interface GitHubManager {
  search(query: string): Promise<RepoResult[]>;
  getRepoInfo(owner: string, repo: string): Promise<RepoDetail>;
  clone(owner: string, repo: string, targetDir: string): Promise<void>;
  detectStack(repoDir: string): Promise<StackInfo>;
}
```

---

### 6. Executor Bridge (`packages/main/src/executor/`)

Translates GUI inputs into Docker commands.

```typescript
interface ExecutorBridge {
  // Takes schema + user inputs, produces the actual command
  buildCommand(workflow: Workflow, inputs: Record<string, any>): string;
  
  // Prepares input files (copy to temp dir for volume mount)
  prepareInputs(inputs: Record<string, any>, schema: UISchema): Promise<string>;
  
  // Runs command in container, streams output
  execute(projectId: string, command: string, inputDir: string): Promise<ExecutionResult>;
  
  // Collects output files after execution
  collectOutputs(outputDir: string): Promise<OutputFile[]>;
}
```

---

### 7. IPC Layer (`packages/main/src/ipc/` + `packages/shared/src/ipc-types.ts`)

Type-safe communication between main and renderer processes.

```typescript
// All IPC channels defined in one place
enum IPCChannel {
  // Docker
  DOCKER_HEALTH = 'docker:health',
  DOCKER_BUILD = 'docker:build',
  DOCKER_BUILD_PROGRESS = 'docker:build:progress',
  
  // Projects
  PROJECT_SEARCH = 'project:search',
  PROJECT_INSTALL = 'project:install',
  PROJECT_LIST = 'project:list',
  PROJECT_REMOVE = 'project:remove',
  
  // Execution
  EXEC_RUN = 'exec:run',
  EXEC_LOG = 'exec:log',          // Streamed from main → renderer
  EXEC_PROGRESS = 'exec:progress',
  EXEC_COMPLETE = 'exec:complete',
  
  // Analysis
  ANALYZE_PROJECT = 'analyze:project',
  ANALYZE_STATUS = 'analyze:status',
  
  // Files
  FILE_PICK = 'file:pick',
  FILE_OPEN = 'file:open',
  FILE_SHOW_IN_FINDER = 'file:showInFinder',
}
```

---

## Data Flow: End-to-End Example

**User converts a video with ffmpeg:**

```
1. User clicks "Run" in GUI
   → Renderer collects form values: { input_file: "video.mp4", output_format: "avi", quality: "medium" }
   
2. Renderer sends IPC: EXEC_RUN { projectId: "ffmpeg", workflowId: "convert-video", inputs: {...} }

3. Main process → ExecutorBridge:
   a. buildCommand() → "ffmpeg -i /input/video.mp4 -preset medium /output/output.avi"
   b. prepareInputs() → copies video.mp4 to temp dir, returns path
   
4. Main process → DockerManager:
   a. runCommand("ffmpeg-image", command, { inputDir: tempDir, outputDir: outDir })
   b. Container starts, ffmpeg runs
   c. stdout/stderr streamed via IPC: EXEC_LOG to renderer
   
5. ffmpeg finishes (exit code 0)
   → DockerManager returns ExecutionResult
   → ExecutorBridge.collectOutputs() finds "output.avi"
   
6. Main sends IPC: EXEC_COMPLETE { exitCode: 0, files: ["output.avi"], message: "Your video has been converted!" }

7. Renderer shows success + "Open File" / "Show in Finder" buttons
```

---

## Data Storage

All app data stored in `~/.gui-bridge/`:

```
~/.gui-bridge/
├── config.json              # API keys, preferences
├── projects/                # Installed projects
│   └── {project-id}/
│       ├── repo/            # Cloned repository
│       ├── schema.json      # Generated/cached UI schema
│       └── meta.json        # Install date, image ID, etc.
└── temp/                    # Ephemeral I/O dirs (cleaned up)
```

---

## Future: Tool Chaining (Chunk 7+)

Pipeline architecture for chaining tools:

```typescript
interface Pipeline {
  id: string;
  name: string;
  description: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}

interface PipelineNode {
  id: string;
  projectId: string;
  workflowId: string;
  inputMappings: Record<string, string>; // step_id → source (user input or previous node output)
}

interface PipelineEdge {
  from: string;    // node id
  to: string;      // node id
  mapping: string; // output file → input step
}
```

Example pipeline: "Download video → Extract audio → Transcribe"
```
[yt-dlp: download] → video.mp4 → [ffmpeg: extract-audio] → audio.wav → [whisper: transcribe] → transcript.txt
```

This is architecturally similar to n8n but for local CLI tools. The UI would be a visual node editor.

---

## Security Considerations

- Docker containers run with `--network=none` by default (no internet access after build)
- Input files mounted read-only
- No host filesystem access beyond designated I/O dirs
- API keys stored in user's home dir, never in repo
- Container resource limits: `--memory=2g --cpus=2` (configurable)
