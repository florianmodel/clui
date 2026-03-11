# Chunk 6: Polish, Error Handling & UX

## Goal

Turn the working prototype into something that feels like a real app. Better error messages, loading states, output handling, edge case coverage, and visual polish. After this chunk, you could hand the app to a non-technical friend and they'd be able to use it without help.

## Proof of Life

When this chunk is done:
1. Every error has a human-readable message and a suggested action (not a stack trace)
2. Docker not running → app detects this on startup, shows a clear "Start Docker Desktop" prompt
3. Long operations (build, analyze) show meaningful progress, not just a spinner
4. Output files can be previewed inline (images, text) or opened with one click
5. The UI looks clean and consistent — not flashy, but professional
6. App works gracefully offline (installed projects still usable)
7. First-run onboarding guides new users through setup

## Step-by-Step Implementation

### Step 1: Global Error Handling Framework

`packages/main/src/errors/`

Create a structured error system that maps technical failures to user-friendly messages.

```typescript
// Base error class for all GUI Bridge errors
class GUIBridgeError extends Error {
  constructor(
    message: string,                    // Technical message for logs
    public userMessage: string,         // Friendly message shown in UI
    public suggestion?: string,         // What the user can do about it
    public recoverable: boolean = true, // Can the user retry?
    public category: ErrorCategory = 'unknown'
  ) {
    super(message);
  }
}

type ErrorCategory =
  | 'docker'
  | 'network'
  | 'github'
  | 'build'
  | 'analysis'
  | 'execution'
  | 'filesystem'
  | 'api_key'
  | 'unknown';

// Specific error classes
class DockerNotRunningError extends GUIBridgeError {
  constructor() {
    super(
      'Docker daemon not responding',
      'Docker Desktop isn\'t running',
      'Open Docker Desktop and wait for it to start, then try again.',
      true,
      'docker'
    );
  }
}

class DockerBuildError extends GUIBridgeError {
  constructor(projectName: string, stderr: string) {
    const simplifiedError = simplifyDockerError(stderr);
    super(
      `Docker build failed: ${stderr}`,
      `Failed to build ${projectName}`,
      simplifiedError,
      true,
      'build'
    );
  }
}

class NetworkError extends GUIBridgeError {
  constructor(action: string) {
    super(
      `Network error during ${action}`,
      'No internet connection',
      'Check your internet connection and try again. Installed projects still work offline.',
      true,
      'network'
    );
  }
}

class APIKeyError extends GUIBridgeError {
  constructor(detail: string) {
    super(
      `API key error: ${detail}`,
      'There\'s an issue with your API key',
      'Go to Settings to update your Anthropic API key. You can get one at console.anthropic.com.',
      true,
      'api_key'
    );
  }
}

class ExecutionError extends GUIBridgeError {
  constructor(command: string, exitCode: number, stderr: string) {
    const simplified = simplifyExecutionError(command, exitCode, stderr);
    super(
      `Command failed (exit ${exitCode}): ${stderr}`,
      simplified.message,
      simplified.suggestion,
      true,
      'execution'
    );
  }
}

// Helper: turn raw Docker/CLI errors into plain English
function simplifyDockerError(stderr: string): string {
  if (stderr.includes('No such file or directory'))
    return 'A required file was missing during the build. The project might need additional setup.';
  if (stderr.includes('Could not resolve host'))
    return 'The build needs internet access to download dependencies. Check your connection.';
  if (stderr.includes('No space left on device'))
    return 'Your disk is full. Free up some space and try again.';
  if (stderr.includes('permission denied'))
    return 'Docker needs permission to access the files. Try restarting Docker Desktop.';
  return `Build error: ${stderr.slice(0, 200)}. Try uninstalling and reinstalling the project.`;
}

function simplifyExecutionError(command: string, exitCode: number, stderr: string): { message: string; suggestion: string } {
  // Tool-specific hints
  if (command.includes('ffmpeg')) {
    if (stderr.includes('No such file or directory'))
      return { message: 'The input file couldn\'t be found', suggestion: 'Make sure you selected a valid file.' };
    if (stderr.includes('Invalid data found'))
      return { message: 'The file format isn\'t supported', suggestion: 'Try a different file or check the format.' };
    if (stderr.includes('already exists'))
      return { message: 'The output file already exists', suggestion: 'Choose a different output name or delete the existing file.' };
  }
  return {
    message: `The command failed with exit code ${exitCode}`,
    suggestion: 'Check the logs below for details. You may need to adjust your settings.'
  };
}
```

### Step 2: Error Display Component

`packages/renderer/src/components/common/ErrorDisplay.tsx`

A consistent error UI used throughout the app.

```
┌────────────────────────────────────────────────┐
│  ⚠️  Docker Desktop isn't running              │
│                                                │
│  Open Docker Desktop and wait for it to start, │
│  then try again.                               │
│                                                │
│  [Retry]    [Show Details ▾]                   │
│                                                │
│  ┌─ Details ────────────────────────────────┐  │
│  │ Error: connect ENOENT                    │  │
│  │ /var/run/docker.sock                     │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

Features:
- Friendly message prominently displayed
- Suggestion text below
- "Retry" button if error is recoverable
- Expandable "Show Details" for technical info (for power users or bug reports)
- Color-coded by category (red for critical, amber for warnings)
- Copy error details button (for bug reports)

### Step 3: Docker Health Monitor

`packages/main/src/docker/DockerHealthMonitor.ts`

Continuously monitor Docker status, not just on startup.

```typescript
class DockerHealthMonitor {
  private status: DockerStatus = 'unknown';
  private checkInterval: NodeJS.Timeout | null = null;

  async start(onChange: (status: DockerStatus) => void): Promise<void> {
    // Check immediately
    await this.check(onChange);

    // Then every 10 seconds
    this.checkInterval = setInterval(() => this.check(onChange), 10_000);
  }

  private async check(onChange: (status: DockerStatus) => void): Promise<void> {
    try {
      await this.dockerManager.checkHealth();
      if (this.status !== 'running') {
        this.status = 'running';
        onChange(this.status);
      }
    } catch {
      if (this.status !== 'stopped') {
        this.status = 'stopped';
        onChange(this.status);
      }
    }
  }

  stop(): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
  }
}

type DockerStatus = 'running' | 'stopped' | 'unknown';
```

**UI treatment:**
- Status indicator in the sidebar footer: green dot = running, red dot = stopped
- If Docker stops while using the app → show a non-blocking banner at the top: "Docker has stopped. Start Docker Desktop to continue using tools."
- Block Install/Run buttons when Docker is stopped, with a tooltip explaining why

### Step 4: First-Run Onboarding

`packages/renderer/src/components/Onboarding/`

When the app launches for the first time (no config file exists), show a welcome flow.

```
┌─────────────────────────────────────────────────┐
│                                                 │
│          Welcome to GUI Bridge 👋               │
│                                                 │
│  Turn any command-line tool from GitHub into     │
│  a simple point-and-click app.                  │
│                                                 │
│  Let's get you set up — it only takes a minute. │
│                                                 │
│                          [Get Started →]        │
└─────────────────────────────────────────────────┘

         ↓ Step 1 ↓

┌─────────────────────────────────────────────────┐
│  Step 1 of 3: Docker                            │
│                                                 │
│  GUI Bridge uses Docker to run tools safely.    │
│                                                 │
│  ✅ Docker is running                           │
│  OR                                             │
│  ❌ Docker not detected                         │
│     Download it at docker.com/get-started       │
│     [Open Docker Website]                       │
│                                                 │
│                          [Next →]               │
└─────────────────────────────────────────────────┘

         ↓ Step 2 ↓

┌─────────────────────────────────────────────────┐
│  Step 2 of 3: AI Features (Optional)            │
│                                                 │
│  GUI Bridge can use AI to automatically create  │
│  interfaces for any tool. This requires an      │
│  Anthropic API key.                             │
│                                                 │
│  API Key: [sk-ant-...                  ]        │
│  Get one at console.anthropic.com               │
│                                                 │
│  [Skip for now]              [Next →]           │
└─────────────────────────────────────────────────┘

         ↓ Step 3 ↓

┌─────────────────────────────────────────────────┐
│  Step 3 of 3: Install Your First Tool           │
│                                                 │
│  Try one of these popular tools:                │
│                                                 │
│  🎬 yt-dlp — Download videos                   │
│  🖼️ ImageMagick — Edit images                   │
│  📄 pandoc — Convert documents                  │
│  🎨 black — Format Python code                  │
│                                                 │
│  [Pick one]      [I'll browse on my own →]      │
└─────────────────────────────────────────────────┘
```

- Save an `onboarding_complete: true` flag in config so it only shows once
- Each step validates before allowing "Next" (Docker check, API key validation)
- "Skip" options for non-essential steps

### Step 5: Output File Handling

`packages/renderer/src/components/OutputPanel/`

Make output files actually useful, not just a path.

```
┌──────────────────────────────────────────────────┐
│  ✅ Your video has been converted!               │
│                                                  │
│  Output files:                                   │
│  ┌────────────────────────────────────────────┐  │
│  │  📄 output.avi                             │  │
│  │  Size: 12.4 MB • Duration: 2:34           │  │
│  │                                            │  │
│  │  [Open File]  [Show in Finder]  [Copy Path]│  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  🖼️ thumbnail.png                          │  │
│  │  Size: 45 KB • 1920×1080                   │  │
│  │  ┌──────────────────────────────────────┐  │  │
│  │  │         [inline preview]             │  │  │
│  │  └──────────────────────────────────────┘  │  │
│  │  [Open File]  [Show in Finder]  [Copy Path]│  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  [Open Output Folder]                            │
└──────────────────────────────────────────────────┘
```

**Features:**
- Show file size (human-readable: KB, MB, GB)
- Inline preview for images (png, jpg, gif, webp) — use Electron's native image loading
- Inline preview for text files (first 50 lines)
- "Open File" → opens with system default app
- "Show in Finder" → reveals in file manager
- "Copy Path" → clipboard
- "Open Output Folder" → opens the output directory
- For video/audio: show duration if detectable (parse ffprobe output or file metadata)

**File type detection:**
```typescript
function getFileInfo(filePath: string): FileInfo {
  const ext = path.extname(filePath).toLowerCase();
  const stats = fs.statSync(filePath);

  return {
    name: path.basename(filePath),
    path: filePath,
    size: formatFileSize(stats.size),
    extension: ext,
    type: categorizeFile(ext),
    previewable: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
                  '.txt', '.md', '.json', '.csv', '.log'].includes(ext),
  };
}

type FileType = 'image' | 'video' | 'audio' | 'document' | 'code' | 'data' | 'other';
```

### Step 6: Log Panel Improvements

`packages/renderer/src/components/OutputPanel/LogPanel.tsx`

Upgrade from raw text dump to something more readable.

**Features:**
- **Color coding:** stdout in normal color, stderr in red/orange
- **Timestamps:** optional, toggleable
- **Auto-scroll** with smart behavior: auto-scroll if at bottom, stop if user scrolls up to read
- **Search within logs:** Ctrl/Cmd+F in the log panel
- **Copy all logs** button
- **Clear logs** button
- **Download logs** as .txt file
- **Line count** shown in corner
- **Progress detection:** If output contains patterns like `frame= 150`, `50%`, `[3/10]`, parse and show a progress bar above the logs

**Progress bar heuristics:**
```typescript
function detectProgress(line: string): number | null {
  // Percentage: "50%", "50.0%", "Progress: 50%"
  const pctMatch = line.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) return parseFloat(pctMatch[1]);

  // Fraction: "[3/10]", "3 of 10", "3/10"
  const fracMatch = line.match(/(\d+)\s*(?:of|\/)\s*(\d+)/);
  if (fracMatch) return (parseInt(fracMatch[1]) / parseInt(fracMatch[2])) * 100;

  // ffmpeg-style: "time=00:01:30" with known total duration
  // (needs context from the input file)

  return null;
}
```

### Step 7: Execution State Management

Track and display execution state clearly.

```typescript
type ExecutionState =
  | { status: 'idle' }
  | { status: 'preparing'; message: string }
  | { status: 'running'; startedAt: number; logs: LogLine[] }
  | { status: 'success'; duration: number; outputFiles: FileInfo[]; message: string }
  | { status: 'error'; duration: number; error: GUIBridgeError; logs: LogLine[] }
  | { status: 'cancelled' };

interface LogLine {
  timestamp: number;
  stream: 'stdout' | 'stderr';
  text: string;
}
```

**UI states:**
- **Idle:** Run button enabled, no logs shown
- **Preparing:** Run button disabled, "Preparing..." message
- **Running:** Run button becomes "Cancel" (red), timer counting up, logs streaming, progress bar if detectable
- **Success:** Green banner with success message, output files listed, "Run Again" button
- **Error:** Red banner with user-friendly message, logs still visible, "Retry" button
- **Cancelled:** Grey banner "Cancelled", cleanup message

### Step 8: Execution Timer and History

Show how long things take and keep a history.

**During execution:** Live timer: `Running... 0:12`

**After execution:** `Completed in 1m 23s`

**Execution history** (per project):
```typescript
interface ExecutionRecord {
  id: string;
  workflowId: string;
  inputs: Record<string, any>;   // What the user entered
  command: string;               // What was actually run
  startedAt: string;
  duration: number;              // ms
  exitCode: number;
  outputFiles: string[];
}
```

- Store last 20 executions per project in `meta.json`
- Show a small "History" dropdown/panel: "Re-run last command", "View previous runs"
- Pre-fill form with inputs from a previous run

### Step 9: Visual Polish

Apply consistent styling across the app. Not a redesign — just making things consistent and clean.

**Color palette:**
- Background: white/light grey
- Sidebar: slightly darker grey
- Accent: a single brand color (blue or teal) for buttons and active states
- Success: green
- Error: red
- Warning: amber
- Text: near-black for body, grey for secondary text

**Typography:**
- System font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- Monospace for logs and command preview: `"SF Mono", "Fira Code", "Cascadia Code", monospace`
- Consistent sizes: 14px body, 12px secondary, 16px headings, 20px page titles

**Spacing:**
- Consistent padding: 8px, 12px, 16px, 24px scale
- Card-style containers for workflows, results, output files

**Micro-interactions:**
- Button hover/active states
- Smooth transitions on view changes (200ms ease)
- Loading skeletons instead of spinners where possible (search results)
- Toast notifications for quick confirmations ("Copied to clipboard", "Schema saved")

### Step 10: Keyboard Shortcuts

Add common shortcuts for power users:

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Focus search bar |
| `Cmd+Enter` | Run current workflow |
| `Cmd+.` | Cancel running execution |
| `Cmd+L` | Clear logs |
| `Cmd+,` | Open settings |
| `Cmd+1-9` | Switch to project N in sidebar |
| `Escape` | Close modal/panel |

Register in Electron via `globalShortcut` or accelerators on menu items.

### Step 11: App Menu

`packages/main/src/menu.ts`

Proper macOS menu bar:

```
GUI Bridge
├── About GUI Bridge
├── Check for Updates...
├── Preferences... (Cmd+,)
├── Quit (Cmd+Q)

File
├── New Project (Cmd+N) → opens search
├── Close Window (Cmd+W)

Edit
├── (standard copy/paste/undo)

View
├── Toggle Sidebar (Cmd+B)
├── Toggle Output Panel (Cmd+Shift+L)
├── Reload (Cmd+R)

Help
├── Documentation
├── Report an Issue → opens GitHub issues page
```

### Step 12: Offline Mode

Make the app gracefully handle no internet.

```typescript
class ConnectivityMonitor {
  async isOnline(): Promise<boolean> {
    try {
      await fetch('https://api.github.com', { method: 'HEAD', signal: AbortSignal.timeout(3000) });
      return true;
    } catch {
      return false;
    }
  }
}
```

**Behavior when offline:**
- Sidebar shows installed projects normally — they all work offline
- Search bar shows "You're offline" message
- Install button disabled with tooltip
- "Generate UI" / "Regenerate" buttons disabled with tooltip
- No error modals or crashes — just graceful degradation

### Step 13: Confirmation Dialogs

Add confirmations for destructive actions:

- **Uninstall project:** "Remove {name}? This will delete the Docker image and all cached data. Your output files will not be affected."
- **Regenerate schema:** "Regenerate the interface for {name}? This will replace your current customizations."
- **Clear all cache:** "Clear all cached data? You'll need to re-analyze your installed projects."

Use Electron's `dialog.showMessageBox` for native OS dialogs.

### Step 14: Tooltip & Help System

Add contextual help throughout the app:

- **Hover tooltips** on technical terms (e.g. hover over "Docker image" → "A packaged environment containing the tool and all its dependencies")
- **Info icons (ⓘ)** next to complex settings that expand an explanation
- **Empty states** with helpful messages:
  - No installed projects: "Search for a tool above or try one of our suggestions"
  - No output files: "Output files will appear here after you run a tool"
  - No logs: "Logs will stream here during execution"

### Step 15: Window State Persistence

Remember the window size, position, and sidebar state between sessions.

```typescript
// Save on window close
mainWindow.on('close', () => {
  const bounds = mainWindow.getBounds();
  configManager.setConfig({
    window: {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      sidebarWidth: sidebarWidth,
      outputPanelHeight: outputPanelHeight,
    }
  });
});

// Restore on launch
const windowConfig = config.window || { width: 1200, height: 800 };
mainWindow = new BrowserWindow({ ...windowConfig });
```

## Testing Checklist

### Error Scenarios
- [ ] Start app with Docker not running → onboarding catches it, clear message
- [ ] Stop Docker mid-execution → execution fails gracefully, banner appears
- [ ] Enter invalid API key → validation catches it, helpful message
- [ ] Search with no internet → "You're offline" message, no crash
- [ ] Install project that fails to build → error with suggestion, cleanup happens
- [ ] Run command on corrupted/wrong file → execution error with useful message
- [ ] Disk full during Docker build → caught and explained

### UX Flows
- [ ] First launch → onboarding flow → install first project → use it
- [ ] Returning user → sidebar shows projects → click one → GUI loads immediately
- [ ] Power user → keyboard shortcuts work → command preview visible → logs searchable
- [ ] Re-run previous command → history dropdown → pre-filled form → run

### Visual Consistency
- [ ] All buttons same style
- [ ] All error messages same format
- [ ] Loading states everywhere (no blank screens)
- [ ] Sidebar, main content, output panel resize properly
- [ ] Window remembers size/position

## File Structure After Chunk 6

```
packages/main/src/
├── errors/
│   ├── GUIBridgeError.ts          # Base error + all error classes
│   └── error-simplifiers.ts       # Turn raw errors into plain English
├── docker/
│   ├── DockerHealthMonitor.ts     # Continuous health monitoring
│   └── ...existing
├── menu.ts                        # macOS menu bar
└── ...existing

packages/renderer/src/components/
├── Onboarding/
│   ├── Onboarding.tsx             # Welcome flow container
│   ├── DockerCheck.tsx            # Step 1: Docker
│   ├── ApiKeySetup.tsx            # Step 2: API key (moved here from Settings)
│   └── FirstProject.tsx           # Step 3: Install suggestion
├── common/
│   ├── ErrorDisplay.tsx           # Reusable error component
│   ├── Toast.tsx                  # Toast notifications
│   ├── ConfirmDialog.tsx          # Confirmation modal
│   ├── Tooltip.tsx                # Info tooltips
│   ├── LoadingSkeleton.tsx        # Skeleton loading states
│   └── EmptyState.tsx             # Helpful empty states
├── OutputPanel/
│   ├── OutputPanel.tsx            # Updated: file previews, better layout
│   ├── LogPanel.tsx               # Updated: colors, search, progress detection
│   ├── FileCard.tsx               # Output file with preview + actions
│   └── ProgressBar.tsx            # Detected or explicit progress
└── ...existing
```

## Dependencies (new for Chunk 6)

No major new dependencies. Possibly:
- `electron-store` — simpler config persistence (optional, can keep using fs-extra)
- A toast library or just build a simple one

## Out of Scope for Chunk 6

- Tool chaining / pipelines (Chunk 7+)
- Community schema sharing
- Auto-updates (Electron updater)
- Theming / dark mode (nice-to-have for later)
- i18n / localization

## Claude Code Prompt

```
Read CLAUDE.md, ARCHITECTURE.md, and CHUNK_6.md. Then implement Chunk 6: Polish, error handling, and UX improvements.

This is a polish pass — don't rebuild existing functionality, improve it. Follow CHUNK_6.md step by step. Key priorities:

1. Error handling framework: GUIBridgeError classes + ErrorDisplay component. Every try/catch should produce a user-friendly message.
2. Docker health monitor: continuous checking, status in sidebar, banner when Docker stops.
3. First-run onboarding: 3-step welcome flow (Docker check → API key → first project suggestion).
4. Output file handling: file info, inline previews for images, Open/Show in Finder/Copy Path buttons.
5. Log panel upgrades: color coding, auto-scroll, search, progress detection.
6. Visual consistency: apply consistent colors, typography, spacing. System font stack.
7. Keyboard shortcuts: Cmd+K (search), Cmd+Enter (run), Cmd+. (cancel).
8. Offline mode: detect connectivity, graceful degradation, clear messaging.
9. Window state persistence: remember size and position.
10. Confirmation dialogs for destructive actions.

Don't over-engineer the visual design — clean and consistent beats fancy. Focus on making error states and edge cases feel handled rather than crashed.

After you're done, update CLAUDE.md to mark Chunk 6 as COMPLETE.
```
