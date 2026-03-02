# Chunk 5: Project Browser + Auto-Setup

## Goal

Users can search for CLI tools directly inside the app, see results with descriptions and stats, click "Install", and the app handles everything — clone, Docker build, analysis, UI generation. Also: a library view of installed projects so users can switch between tools.

## Proof of Life

When this chunk is done:
1. User opens the app → sees a search bar and their installed projects
2. Types "video converter" → sees GitHub results with stars, descriptions, language tags
3. Clicks "Install" on a project → progress UI shows each step (cloning → building → analyzing → generating UI)
4. Once done, the project appears in their library and they can use it immediately
5. User can switch between installed projects from a sidebar/library view
6. User can uninstall projects (removes container image + cached data)

## Step-by-Step Implementation

### Step 1: GitHub Search Client

`packages/main/src/github/GitHubClient.ts`

Use the GitHub REST API (no auth required for public search, but rate-limited to 10 requests/minute).

```typescript
interface GitHubClient {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  getRepo(owner: string, repo: string): Promise<RepoDetail>;
  getReadme(owner: string, repo: string): Promise<string>;
}

interface SearchOptions {
  language?: string;         // Filter by language
  sort?: 'stars' | 'updated' | 'relevance';
  minStars?: number;
  page?: number;
  perPage?: number;          // Max 30 for unauthenticated
}

interface SearchResult {
  owner: string;
  repo: string;
  fullName: string;          // "owner/repo"
  description: string;
  stars: number;
  language: string;
  topics: string[];
  lastUpdated: string;
  license?: string;
  htmlUrl: string;
  hasDockerfile: boolean;    // From repo metadata
}

interface RepoDetail extends SearchResult {
  defaultBranch: string;
  size: number;              // KB
  openIssues: number;
  readme: string;
  hasReleases: boolean;
}
```

**API endpoints:**
- Search: `GET https://api.github.com/search/repositories?q={query}`
- Repo detail: `GET https://api.github.com/repos/{owner}/{repo}`
- README: `GET https://api.github.com/repos/{owner}/{repo}/readme` (returns base64)

**Rate limiting:**
- Unauthenticated: 10 search requests/minute, 60 other requests/minute
- Add a simple rate limiter that queues requests
- Show a message if rate limited: "Too many searches, please wait a moment"
- Future: let users add a GitHub token for higher limits

### Step 2: Project Cloner

`packages/main/src/github/ProjectCloner.ts`

Clone repos to the local project directory.

```typescript
class ProjectCloner {
  private projectsDir: string; // ~/.gui-bridge/projects/

  async clone(owner: string, repo: string, onProgress?: (msg: string) => void): Promise<string> {
    const projectId = `${owner}--${repo}`;  // Use -- to avoid path issues
    const targetDir = path.join(this.projectsDir, projectId, 'repo');

    // If already cloned, pull latest instead
    if (await fs.pathExists(targetDir)) {
      onProgress?.('Updating existing repo...');
      await this.exec(`git -C "${targetDir}" pull --ff-only`);
      return targetDir;
    }

    onProgress?.('Cloning repository...');
    await fs.ensureDir(path.dirname(targetDir));

    // Shallow clone for speed
    await this.exec(
      `git clone --depth 1 https://github.com/${owner}/${repo}.git "${targetDir}"`
    );

    return targetDir;
  }

  async remove(projectId: string): Promise<void> {
    const projectDir = path.join(this.projectsDir, projectId);
    await fs.remove(projectDir);
  }
}
```

**Important:** Use `--depth 1` for shallow clones. Full history is unnecessary and some repos are huge.

### Step 3: Auto Docker Image Builder

`packages/main/src/docker/ImageBuilder.ts`

Given a cloned repo, automatically figure out how to build a Docker image.

```typescript
class ImageBuilder {
  async buildForProject(
    projectId: string,
    repoDir: string,
    stack: StackInfo,
    onProgress?: (msg: string) => void
  ): Promise<string> {
    const imageTag = `gui-bridge-${projectId}`;

    // Strategy 1: Repo has its own Dockerfile
    const repoDockerfile = path.join(repoDir, 'Dockerfile');
    if (await fs.pathExists(repoDockerfile)) {
      onProgress?.('Building from project Dockerfile...');
      await this.dockerManager.buildImage(imageTag, repoDir, repoDockerfile);
      return imageTag;
    }

    // Strategy 2: Generate a Dockerfile based on detected stack
    onProgress?.(`Generating Dockerfile for ${stack.language} project...`);
    const dockerfile = this.generateDockerfile(stack, repoDir);
    const tempDockerfile = path.join(repoDir, '.gui-bridge.Dockerfile');
    await fs.writeFile(tempDockerfile, dockerfile);

    await this.dockerManager.buildImage(imageTag, repoDir, tempDockerfile);
    await fs.remove(tempDockerfile);

    return imageTag;
  }

  private generateDockerfile(stack: StackInfo, repoDir: string): string {
    switch (stack.language) {
      case 'python':
        return this.pythonDockerfile(stack, repoDir);
      case 'node':
        return this.nodeDockerfile(stack, repoDir);
      case 'rust':
        return this.rustDockerfile(stack, repoDir);
      case 'go':
        return this.goDockerfile(stack, repoDir);
      default:
        return this.genericDockerfile(stack, repoDir);
    }
  }

  private pythonDockerfile(stack: StackInfo, repoDir: string): string {
    // Detect Python version from pyproject.toml, .python-version, or default to 3.12
    const pythonVersion = this.detectPythonVersion(repoDir) || '3.12';

    let installStep = '';
    if (stack.keyFiles.includes('pyproject.toml') || stack.keyFiles.includes('setup.py')) {
      installStep = 'RUN pip install --no-cache-dir .';
    } else if (stack.keyFiles.includes('requirements.txt')) {
      installStep = 'COPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt';
    } else if (stack.keyFiles.includes('Pipfile')) {
      installStep = 'RUN pip install --no-cache-dir pipenv && pipenv install --system';
    }

    return `FROM python:${pythonVersion}-slim
WORKDIR /app
COPY . .
${installStep}
`;
  }

  private nodeDockerfile(stack: StackInfo, repoDir: string): string {
    return `FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build 2>/dev/null || true
`;
  }

  private rustDockerfile(stack: StackInfo, repoDir: string): string {
    return `FROM rust:1-slim
WORKDIR /app
COPY . .
RUN cargo build --release
ENV PATH="/app/target/release:$PATH"
`;
  }

  private goDockerfile(stack: StackInfo, repoDir: string): string {
    return `FROM golang:1.22-slim
WORKDIR /app
COPY . .
RUN go build -o /usr/local/bin/app .
`;
  }

  private genericDockerfile(stack: StackInfo, repoDir: string): string {
    return `FROM ubuntu:24.04
RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN if [ -f Makefile ]; then make; fi
`;
  }
}
```

### Step 4: Installation Pipeline

`packages/main/src/projects/ProjectManager.ts`

Orchestrates the full install flow.

```typescript
interface ProjectMeta {
  projectId: string;
  owner: string;
  repo: string;
  fullName: string;
  description: string;
  language: string;
  stars: number;
  installedAt: string;
  dockerImage: string;
  status: 'installing' | 'analyzing' | 'ready' | 'error';
  error?: string;
  repoDir: string;
  schemaPath?: string;
}

class ProjectManager {
  async install(
    owner: string,
    repo: string,
    repoDetail: SearchResult,
    onProgress: (event: InstallProgress) => void
  ): Promise<ProjectMeta> {
    const projectId = `${owner}--${repo}`;

    try {
      // Step 1: Clone
      onProgress({ stage: 'cloning', message: 'Cloning repository...' });
      const repoDir = await this.cloner.clone(owner, repo, msg => {
        onProgress({ stage: 'cloning', message: msg });
      });

      // Step 2: Detect stack
      onProgress({ stage: 'detecting', message: 'Detecting project type...' });
      const stack = await this.stackDetector.detect(repoDir);
      onProgress({ stage: 'detecting', message: `Detected: ${stack.language}${stack.framework ? ` + ${stack.framework}` : ''}` });

      // Step 3: Build Docker image
      onProgress({ stage: 'building', message: 'Building Docker image (this may take a minute)...' });
      const imageTag = await this.imageBuilder.buildForProject(projectId, repoDir, stack, msg => {
        onProgress({ stage: 'building', message: msg });
      });

      // Step 4: Analyze CLI
      onProgress({ stage: 'analyzing', message: 'Analyzing CLI interface...' });
      const dump = await this.analyzer.analyze(repoDir, imageTag);
      onProgress({ stage: 'analyzing', message: `Found ${dump.arguments.length} arguments, ${dump.subcommands.length} subcommands` });

      // Step 5: Generate UI (if API key available)
      let schemaPath: string | undefined;
      if (await this.configManager.hasApiKey()) {
        onProgress({ stage: 'generating', message: 'Generating interface with AI...' });
        const schema = await this.analyzer.generateSchema(dump);
        schemaPath = path.join(this.projectsDir, projectId, 'schema.json');
        await fs.writeJSON(schemaPath, schema, { spaces: 2 });
        onProgress({ stage: 'generating', message: 'Interface generated!' });
      } else {
        onProgress({ stage: 'generating', message: 'Skipped UI generation (no API key). You can generate it later.' });
      }

      // Step 6: Save project metadata
      const meta: ProjectMeta = {
        projectId,
        owner,
        repo,
        fullName: `${owner}/${repo}`,
        description: repoDetail.description,
        language: repoDetail.language,
        stars: repoDetail.stars,
        installedAt: new Date().toISOString(),
        dockerImage: imageTag,
        status: schemaPath ? 'ready' : 'analyzing',
        repoDir,
        schemaPath,
      };

      await fs.writeJSON(
        path.join(this.projectsDir, projectId, 'meta.json'),
        meta,
        { spaces: 2 }
      );

      onProgress({ stage: 'complete', message: 'Ready to use!' });
      return meta;

    } catch (error) {
      onProgress({ stage: 'error', message: `Installation failed: ${error.message}` });
      throw error;
    }
  }

  async listInstalled(): Promise<ProjectMeta[]> {
    const projectsDir = this.projectsDir;
    if (!await fs.pathExists(projectsDir)) return [];

    const dirs = await fs.readdir(projectsDir);
    const projects: ProjectMeta[] = [];

    for (const dir of dirs) {
      const metaPath = path.join(projectsDir, dir, 'meta.json');
      if (await fs.pathExists(metaPath)) {
        projects.push(await fs.readJSON(metaPath));
      }
    }

    return projects.sort((a, b) => b.installedAt.localeCompare(a.installedAt));
  }

  async uninstall(projectId: string): Promise<void> {
    const meta = await this.getProject(projectId);
    if (meta) {
      // Remove Docker image
      try {
        await this.dockerManager.removeImage(meta.dockerImage);
      } catch (e) {
        // Image might already be removed, that's fine
      }
      // Remove project directory
      await fs.remove(path.join(this.projectsDir, projectId));
    }
  }

  async getProject(projectId: string): Promise<ProjectMeta | null> {
    const metaPath = path.join(this.projectsDir, projectId, 'meta.json');
    if (await fs.pathExists(metaPath)) {
      return fs.readJSON(metaPath);
    }
    return null;
  }
}

interface InstallProgress {
  stage: 'cloning' | 'detecting' | 'building' | 'analyzing' | 'generating' | 'complete' | 'error';
  message: string;
  percent?: number;
}
```

### Step 5: Project Browser UI

`packages/renderer/src/components/ProjectBrowser/`

The main "discovery" interface.

#### SearchBar

```
┌──────────────────────────────────────────────────┐
│  🔍  Search for CLI tools...            [Search] │
│                                                  │
│  Popular: video converter, image resize, PDF     │
│  merge, code formatter, file converter           │
└──────────────────────────────────────────────────┘
```

- Debounced search (300ms delay)
- Popular/suggested queries shown when empty
- Search triggers GitHub API call

#### SearchResults

```
┌──────────────────────────────────────────────────┐
│  Results for "video converter"                   │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  ⭐ 95.2k  yt-dlp/yt-dlp                  │  │
│  │  A feature-rich command-line audio/video   │  │
│  │  downloader                                │  │
│  │  Python • Updated 2 days ago               │  │
│  │                            [Install]       │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  ⭐ 42.1k  FFmpeg/FFmpeg                   │  │
│  │  Universal multimedia toolkit              │  │
│  │  C • Updated 1 day ago                     │  │
│  │                            [Install]       │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  ⭐ 8.3k  HandBrake/HandBrake             │  │
│  │  ...                                       │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

Each result card shows:
- Star count (formatted: 95.2k)
- Full name (owner/repo)
- Description
- Language badge
- Last updated (relative: "2 days ago")
- Install button (or "Installed ✓" if already installed)

#### InstallProgress

When user clicks Install, replace the card (or show a modal) with live progress:

```
┌────────────────────────────────────────────────┐
│  Installing yt-dlp/yt-dlp                      │
│                                                │
│  ✅ Cloning repository                         │
│  ✅ Detected: Python + argparse                │
│  ⏳ Building Docker image...                   │
│  ░░░░░░░░░░░░░                                │
│  ○ Analyzing CLI interface                     │
│  ○ Generating interface with AI                │
│                                                │
│                              [Cancel]          │
└────────────────────────────────────────────────┘
```

- Checkmarks for completed steps
- Spinner for current step
- Empty circles for upcoming steps
- Cancel button (kills Docker build, cleans up)

### Step 6: Project Library / Sidebar

`packages/renderer/src/components/ProjectLibrary/`

Shows installed projects and lets users switch between them.

```
┌──────────────┐
│  GUI Bridge  │
│              │
│  ⊕ Add New   │
│              │
│  INSTALLED   │
│  ─────────── │
│  ▸ yt-dlp    │
│  ▸ black     │
│  ▸ ripgrep   │
│  ▸ pandoc    │
│              │
│              │
│              │
│              │
│  ⚙ Settings │
└──────────────┘
```

- Sidebar on the left (collapsible)
- Each project shows name + icon/emoji
- Click to switch → loads that project's DynamicGUI
- "Add New" opens the Project Browser
- Active project highlighted
- Right-click or hover menu: Uninstall, Regenerate UI, Open Repo Folder, View Schema

### Step 7: App Layout Refactor

`packages/renderer/src/App.tsx`

Restructure the app into a proper layout:

```
┌──────────────┬──────────────────────────────────┐
│              │                                  │
│   Project    │         Main Content             │
│   Library    │                                  │
│   (sidebar)  │   - Project Browser (search)     │
│              │   - DynamicGUI (use a project)   │
│              │   - SchemaReview (after install)  │
│              │   - Settings                     │
│              │                                  │
│              │──────────────────────────────────│
│              │         Output Panel              │
│              │   (logs, output files)            │
└──────────────┴──────────────────────────────────┘
```

Use a simple router or state machine for the main content area:
```typescript
type View =
  | { type: 'browser' }                           // Search for projects
  | { type: 'installing'; projectId: string }      // Install in progress
  | { type: 'review'; projectId: string }          // Schema review
  | { type: 'project'; projectId: string }         // Using a project (DynamicGUI)
  | { type: 'settings' };                          // App settings
```

### Step 8: New IPC Channels

Add to `packages/shared/src/ipc-types.ts`:

```typescript
// GitHub
GITHUB_SEARCH = 'github:search',
GITHUB_REPO_DETAIL = 'github:repoDetail',

// Projects
PROJECT_INSTALL = 'project:install',
PROJECT_INSTALL_PROGRESS = 'project:installProgress',  // main → renderer stream
PROJECT_LIST = 'project:list',
PROJECT_REMOVE = 'project:remove',
PROJECT_GET = 'project:get',
PROJECT_OPEN_FOLDER = 'project:openFolder',

// Analysis (update existing)
ANALYZE_FULL = 'analyze:full',        // Analyze + generate schema
ANALYZE_REGENERATE = 'analyze:regenerate', // Re-run with feedback
```

### Step 9: Settings Page

`packages/renderer/src/components/Settings/`

Simple settings page:
- **API Key:** masked input showing current key, button to change
- **Projects directory:** show path (~/.gui-bridge/projects/), button to open in Finder
- **Docker status:** green/red indicator, Docker version
- **Cache:** "Clear all cached schemas" button
- **About:** version, links

### Step 10: Network Handling

Since the app needs internet for GitHub search and cloning:

- Check connectivity before search
- Handle offline gracefully: "You're offline. You can still use installed projects."
- Timeout GitHub API calls after 10 seconds
- Handle git clone failures (repo not found, network error, private repo)

## Testing

**Full end-to-end test:**
1. Open app fresh → see empty library + search bar
2. Search "python code formatter" → see results including `psf/black`
3. Click Install on black → watch progress through all stages
4. Schema review appears → looks reasonable → click "Looks Good"
5. DynamicGUI renders → select a Python file → click "Format" → see output
6. Go back to library → black is listed → click it → DynamicGUI loads instantly (cached)

**Test with these projects (good coverage of languages/frameworks):**

| Project | Why |
|---------|-----|
| `psf/black` | Python + click, simple, fast to build |
| `yt-dlp/yt-dlp` | Python + argparse, complex, many arguments |
| `junegunn/fzf` | Go, binary tool, --help fallback |
| `sharkdp/bat` | Rust, --help fallback |
| `jgm/pandoc` | Haskell, --help fallback, document converter |

**Edge cases:**
- [ ] Search with no results → "No results found" message
- [ ] Install a project that fails to build → error shown, cleanup happens
- [ ] Install while offline → error at clone step, clear message
- [ ] Uninstall project → removed from library, Docker image deleted
- [ ] Install same project twice → should detect existing and update instead
- [ ] Very large repo (>500MB) → should still work but show appropriate progress

## File Structure After Chunk 5

```
packages/main/src/
├── github/
│   ├── GitHubClient.ts            # Search + repo details
│   ├── ProjectCloner.ts           # git clone management
│   └── index.ts
├── docker/
│   ├── DockerManager.ts           # Existing
│   ├── ImageBuilder.ts            # Auto Dockerfile generation
│   └── index.ts
├── projects/
│   ├── ProjectManager.ts          # Install/uninstall orchestration
│   └── index.ts
└── ...existing files

packages/renderer/src/components/
├── ProjectBrowser/
│   ├── ProjectBrowser.tsx         # Search + results container
│   ├── SearchBar.tsx
│   ├── SearchResults.tsx
│   ├── ResultCard.tsx
│   └── InstallProgress.tsx
├── ProjectLibrary/
│   ├── ProjectLibrary.tsx         # Sidebar
│   └── ProjectItem.tsx
├── Settings/
│   └── Settings.tsx
├── Layout/
│   └── AppLayout.tsx              # Sidebar + main + output
└── ...existing files
```

## Dependencies (new for Chunk 5)

- `simple-git` — nicer API than shelling out to git (optional, can also just use child_process)
- No other major dependencies expected

## Out of Scope for Chunk 5

- Curated/featured projects list (future: community)
- GitHub authentication (use unauthenticated API for now)
- Auto-updates for installed projects
- Pretty animations and transitions (Chunk 6)
- Tool chaining (Chunk 7+)

## Claude Code Prompt

```
Read CLAUDE.md, ARCHITECTURE.md, and CHUNK_5.md. Then implement Chunk 5: Project Browser + Auto-Setup.

Follow CHUNK_5.md step by step. Key points:
- Build the GitHub search client using the REST API (unauthenticated)
- Build the ProjectCloner with shallow cloning (--depth 1)
- Build the ImageBuilder that auto-generates Dockerfiles per language
- Build the ProjectManager that orchestrates the full install pipeline with progress events
- Build the Project Browser UI with search, results cards, and install progress
- Build the Project Library sidebar for switching between installed projects
- Refactor App.tsx into the new layout: sidebar + main content + output panel
- Add a simple Settings page for API key management
- Wire up all new IPC channels

Important: the GitHub API without auth is limited to 10 searches/minute. Add rate limiting and show a friendly message when limited.

After you're done, update CLAUDE.md to mark Chunk 5 as COMPLETE.
```
