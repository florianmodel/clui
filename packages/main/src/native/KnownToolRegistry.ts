/**
 * Registry of known CLI tools with both Docker and native install metadata.
 * Extends the old KNOWN_TOOL_DOCKERFILES map with native package manager info.
 *
 * For Docker mode: the dockerfile string is written to a temp file and built.
 * For native mode: the install commands tell NativeInstallManager how to get the binary.
 */

export interface NativeInstall {
  /** Homebrew formula name (macOS) */
  brew?: string;
  /** apt package name (Debian/Ubuntu) */
  apt?: string;
  /** PyPI package name (cross-platform) */
  pip?: string;
  /** npm package name (cross-platform, global install) */
  npm?: string;
  /** crates.io crate name (cross-platform) */
  cargo?: string;
}

export interface KnownToolEntry {
  /** Lowercase `owner--repo` key, matching ProjectMeta.projectId format */
  projectKey: string;
  /** The binary that lands on PATH after install (what gets exec'd) */
  binary: string;
  /** Args to verify the binary works */
  verifyArgs: string[];
  /** Native install commands per package manager */
  install: NativeInstall;
  /** Pre-built Dockerfile content for Docker mode */
  dockerfile: string;
}

const REGISTRY: KnownToolEntry[] = [
  {
    projectKey: 'ffmpeg--ffmpeg',
    binary: 'ffmpeg',
    verifyArgs: ['-version'],
    install: { brew: 'ffmpeg', apt: 'ffmpeg' },
    dockerfile: `FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
`,
  },
  {
    projectKey: 'handbrake--handbrake',
    binary: 'HandBrakeCLI',
    verifyArgs: ['--version'],
    install: { brew: 'handbrake', apt: 'handbrake-cli' },
    dockerfile: `FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends handbrake-cli && rm -rf /var/lib/apt/lists/*
WORKDIR /app
`,
  },
  {
    projectKey: 'imagemagick--imagemagick',
    binary: 'convert',
    verifyArgs: ['-version'],
    install: { brew: 'imagemagick', apt: 'imagemagick' },
    dockerfile: `FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends imagemagick && rm -rf /var/lib/apt/lists/*
WORKDIR /app
`,
  },
  {
    projectKey: 'yt-dlp--yt-dlp',
    binary: 'yt-dlp',
    verifyArgs: ['--version'],
    install: { brew: 'yt-dlp', pip: 'yt-dlp' },
    dockerfile: `FROM python:3.12-slim
RUN pip install --no-cache-dir yt-dlp
WORKDIR /app
`,
  },
  {
    projectKey: 'openai--whisper',
    binary: 'whisper',
    verifyArgs: ['--help'],
    install: { pip: 'openai-whisper' },
    dockerfile: `FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir openai-whisper
WORKDIR /app
`,
  },
  {
    projectKey: 'jgm--pandoc',
    binary: 'pandoc',
    verifyArgs: ['--version'],
    install: { brew: 'pandoc', apt: 'pandoc' },
    dockerfile: `FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends pandoc && rm -rf /var/lib/apt/lists/*
WORKDIR /app
`,
  },
  {
    projectKey: 'tesseract-ocr--tesseract',
    binary: 'tesseract',
    verifyArgs: ['--version'],
    install: { brew: 'tesseract', apt: 'tesseract-ocr' },
    dockerfile: `FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr && rm -rf /var/lib/apt/lists/*
WORKDIR /app
`,
  },
  {
    projectKey: 'burntsushi--ripgrep',
    binary: 'rg',
    verifyArgs: ['--version'],
    install: { brew: 'ripgrep', apt: 'ripgrep', cargo: 'ripgrep' },
    dockerfile: `FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends ripgrep && rm -rf /var/lib/apt/lists/*
WORKDIR /app
`,
  },
  {
    projectKey: 'svg--svgo',
    binary: 'svgo',
    verifyArgs: ['--version'],
    install: { npm: 'svgo' },
    dockerfile: `FROM node:20-slim
RUN npm install -g svgo
WORKDIR /app
`,
  },
  {
    projectKey: 'py-pdf--pypdf',
    binary: 'python3',
    verifyArgs: ['-c', 'import pypdf; print(pypdf.__version__)'],
    install: { pip: 'pypdf' },
    dockerfile: `FROM python:3.12-slim
RUN pip install --no-cache-dir pypdf
WORKDIR /app
`,
  },
  {
    projectKey: 'saulpw--visidata',
    binary: 'vd',
    verifyArgs: ['--version'],
    install: { brew: 'visidata', pip: 'visidata' },
    dockerfile: `FROM python:3.12-slim
RUN pip install --no-cache-dir visidata
WORKDIR /app
`,
  },
  {
    projectKey: 'mozilla--mozjpeg',
    binary: 'jpegtran',
    verifyArgs: ['-version'],
    install: { brew: 'mozjpeg', apt: 'libjpeg-turbo-progs' },
    dockerfile: `FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends libjpeg-turbo-progs imagemagick && rm -rf /var/lib/apt/lists/*
WORKDIR /app
`,
  },
  {
    projectKey: 'kornelski--gifski',
    binary: 'gifski',
    verifyArgs: ['--version'],
    install: { brew: 'gifski', cargo: 'gifski' },
    dockerfile: `FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends cargo && rm -rf /var/lib/apt/lists/*
RUN cargo install gifski
ENV PATH="/root/.cargo/bin:$PATH"
WORKDIR /app
`,
  },
  {
    projectKey: 'lovell--sharp',
    binary: 'sharp',
    verifyArgs: ['--version'],
    install: { npm: 'sharp-cli' },
    dockerfile: `FROM node:20-slim
RUN npm install -g sharp-cli
WORKDIR /app
`,
  },
];

/** Map for O(1) lookups by projectKey */
const INDEX = new Map<string, KnownToolEntry>(REGISTRY.map((e) => [e.projectKey, e]));

export const KnownToolRegistry = {
  lookup(projectId: string): KnownToolEntry | null {
    return INDEX.get(projectId.toLowerCase()) ?? null;
  },

  all(): KnownToolEntry[] {
    return REGISTRY;
  },

  /** Build the legacy `Record<string, string>` used by ImageBuilder */
  toDockerfileMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const entry of REGISTRY) {
      map[entry.projectKey] = entry.dockerfile;
    }
    return map;
  },
};
