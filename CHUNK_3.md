# Chunk 3: Static CLI Introspection

## Goal

Automatically extract a structured "capability dump" from any CLI tool — its arguments, types, defaults, subcommands, and usage examples — by inspecting source code, running `--help`, and reading the README. No LLM involved yet; this is pure static analysis.

This capability dump is the raw material that Chunk 4 (LLM) will refine into a polished UISchema.

## Proof of Life

When this chunk is done:
1. Point the analyzer at a cloned repo (e.g. yt-dlp, black, ripgrep)
2. It detects the language, framework, and entrypoint
3. It extracts all CLI arguments with types, defaults, choices, and descriptions
4. It captures subcommands if present
5. It outputs a structured `CapabilityDump` JSON
6. Works for at least: Python argparse, Python click, Python typer, and generic `--help` parsing
7. There's a simple UI in the app to trigger analysis and view the raw dump

## Key Concept: CapabilityDump

This is the intermediate format between raw repo inspection and the final UISchema.

```typescript
interface CapabilityDump {
  projectName: string;
  repoUrl?: string;
  language: string;                    // "python", "node", "rust", "go", "unknown"
  framework?: string;                  // "argparse", "click", "typer", "clap", etc.
  entrypoint: string;                  // "python main.py", "./bin/convert", etc.
  entrypointConfidence: number;        // 0-1, how sure are we this is right
  description?: string;               // From setup.py, package.json, or first line of README
  arguments: ArgumentInfo[];
  subcommands: SubcommandInfo[];
  readmeContent: string;               // Full README (truncated to ~4000 chars for LLM)
  usageExamples: string[];             // Extracted from README or --help
  rawHelpOutput?: string;              // Full --help text
  installMethod: string;               // "pip install", "npm install", "cargo build", etc.
  detectedFiles: string[];             // Key files found: setup.py, Dockerfile, etc.
}

interface ArgumentInfo {
  name: string;                        // "--output-format" or "-f"
  longName?: string;                   // "--output-format"
  shortName?: string;                  // "-f"
  type: ArgumentType;
  required: boolean;
  default?: string;
  choices?: string[];
  description: string;
  positional: boolean;                 // true for positional args (no --)
  dest?: string;                       // Internal variable name
}

type ArgumentType = 'string' | 'int' | 'float' | 'bool' | 'file' | 'directory' | 'choice' | 'list' | 'unknown';

interface SubcommandInfo {
  name: string;
  description: string;
  arguments: ArgumentInfo[];
  aliases?: string[];
}
```

## Step-by-Step Implementation

### Step 1: Stack Detector

`packages/main/src/analyzer/StackDetector.ts`

Given a repo directory, figure out what we're dealing with.

```typescript
interface StackInfo {
  language: string;
  framework?: string;
  entrypoint?: string;
  installMethod: string;
  keyFiles: string[];
}
```

**Detection logic (check in order):**

| Files Present | Language | Framework Hint | Install Method |
|---|---|---|---|
| `setup.py` or `pyproject.toml` | python | check imports | `pip install .` |
| `requirements.txt` | python | check imports | `pip install -r requirements.txt` |
| `Pipfile` | python | check imports | `pipenv install` |
| `package.json` with `bin` field | node | check deps | `npm install` |
| `Cargo.toml` | rust | check for clap | `cargo build --release` |
| `go.mod` | go | check for cobra/flag | `go build` |
| `Makefile` only | unknown | — | `make` |
| `Dockerfile` only | unknown | — | `docker build` |

**Entrypoint detection (Python):**
1. Check `setup.py` / `pyproject.toml` for `console_scripts` entry points
2. Check for `__main__.py` in root package
3. Check for `main.py`, `cli.py`, `app.py` in root
4. Check for `if __name__ == "__main__"` in Python files
5. Check for shebang lines (`#!/usr/bin/env python`)

**Framework detection (Python):**
- Search imports for `argparse`, `click`, `typer`, `fire`
- Check `requirements.txt` / `pyproject.toml` deps for these packages

### Step 2: Python Introspectors

Create specialized parsers for each Python CLI framework. These run **inside the Docker container** where the project is installed, so they have access to the actual modules.

`packages/main/src/analyzer/introspectors/`

#### ArgparseIntrospector

Strategy: Write a small Python script that imports the target module, finds the ArgumentParser instance, and dumps its arguments as JSON.

**`analyzer-scripts/introspect_argparse.py`** (gets copied into the container and executed):

```python
"""
Introspects an argparse-based CLI tool.
Usage: python introspect_argparse.py <module_or_script_path>

Approach:
1. Monkey-patch argparse.ArgumentParser to capture instances
2. Import/execute the target module
3. Dump all parser definitions as JSON
"""
import argparse
import json
import sys

captured_parsers = []
_original_init = argparse.ArgumentParser.__init__

def _capturing_init(self, *args, **kwargs):
    _original_init(self, *args, **kwargs)
    captured_parsers.append(self)

argparse.ArgumentParser.__init__ = _capturing_init

# Also patch parse_args to prevent actual execution
argparse.ArgumentParser.parse_args = lambda self, *a, **kw: argparse.Namespace()
argparse.ArgumentParser.parse_known_args = lambda self, *a, **kw: (argparse.Namespace(), [])

# Import the target
target = sys.argv[1]
# ... (handle module import or script exec)

# Dump captured parsers
result = []
for parser in captured_parsers:
    actions = []
    for action in parser._actions:
        if isinstance(action, argparse._HelpAction):
            continue
        actions.append({
            "name": action.option_strings[0] if action.option_strings else action.dest,
            "long_name": next((s for s in action.option_strings if s.startswith("--")), None),
            "short_name": next((s for s in action.option_strings if s.startswith("-") and not s.startswith("--")), None),
            "type": str(action.type) if action.type else "string",
            "required": action.required if hasattr(action, 'required') else False,
            "default": str(action.default) if action.default is not None else None,
            "choices": [str(c) for c in action.choices] if action.choices else None,
            "description": action.help or "",
            "positional": len(action.option_strings) == 0,
            "dest": action.dest,
        })
    result.append({
        "prog": parser.prog,
        "description": parser.description or "",
        "arguments": actions,
        "subcommands": []  # Handle subparsers separately
    })

print(json.dumps(result))
```

This script is the core trick — it captures argparse definitions without running the tool.

#### ClickIntrospector

Similar approach for Click-based tools:

**`analyzer-scripts/introspect_click.py`:**

```python
"""
Introspects a Click-based CLI tool.
Finds the click.Group or click.Command and dumps params as JSON.
"""
import click
import json
import sys

# Import the target module, find Click commands
# click.Command has .params list with click.Option / click.Argument objects
# Each has: name, type, required, default, help, etc.
```

Click is actually easier than argparse because `click.Command.params` is a clean list of typed parameter objects.

#### TyperIntrospector

Typer is built on Click, so the Click introspector mostly works. But Typer adds type hints:

```python
# Typer uses function signatures + type annotations
# Can also introspect via the underlying Click command:
# typer_app = ... 
# click_cmd = typer.main.get_command(typer_app)
# Then use ClickIntrospector logic
```

### Step 3: Generic Help Parser

`packages/main/src/analyzer/introspectors/HelpParser.ts`

For tools where we can't do deep introspection (Rust, Go, C, or unrecognized frameworks), parse the `--help` output.

**Strategy:**
1. Run `tool --help` inside the Docker container
2. Parse the output text with heuristics

**Common `--help` patterns to detect:**

```
Usage: tool [OPTIONS] <INPUT> [OUTPUT]

Options:
  -f, --format <FORMAT>    Output format [default: mp4] [possible values: mp4, avi, mkv]
  -q, --quality <N>        Quality level (1-10) [default: 5]
  -v, --verbose            Enable verbose output
  -h, --help               Print help
```

**Parsing rules:**
- Lines starting with `-` followed by a letter → option flag
- `--long-name` → long name
- `-x` → short name
- `<PLACEHOLDER>` or uppercase after flag → takes a value (string type)
- `[default: X]` → default value
- `[possible values: a, b, c]` → choices
- Text after spaces → description
- `<INPUT>` in usage line → positional argument
- `[OPTIONAL]` in brackets → not required

This won't be perfect. That's okay — Chunk 4's LLM will clean it up. The goal here is to extract 80% of the information correctly.

### Step 4: README Parser

`packages/main/src/analyzer/ReadmeParser.ts`

Extract useful information from README.md:

```typescript
interface ReadmeInfo {
  description: string;          // First paragraph
  usageExamples: string[];      // Code blocks that look like CLI invocations
  installInstructions: string;  // Install/setup section content
  fullContent: string;          // Truncated to ~4000 chars
}
```

**Extraction logic:**
- **Description:** First non-heading, non-badge paragraph
- **Usage examples:** Find fenced code blocks containing the tool name or starting with `$`, `>`, or common shell prefixes. Filter out non-CLI code (look for flags like `--`, pipe `|`, common commands).
- **Install section:** Find headings matching /install|setup|getting started|quickstart/i, grab content until next heading
- **Truncation:** Keep first ~4000 chars for the LLM context window in Chunk 4

### Step 5: Analyzer Orchestrator

`packages/main/src/analyzer/Analyzer.ts`

Ties everything together:

```typescript
class Analyzer {
  async analyze(repoDir: string, dockerImage: string): Promise<CapabilityDump> {
    // 1. Detect stack
    const stack = await this.stackDetector.detect(repoDir);
    
    // 2. Parse README
    const readme = await this.readmeParser.parse(repoDir);
    
    // 3. Try framework-specific introspection (runs in container)
    let args: ArgumentInfo[] = [];
    let subcommands: SubcommandInfo[] = [];
    
    if (stack.language === 'python') {
      if (stack.framework === 'argparse') {
        const result = await this.runInContainer(dockerImage, 
          `python /analyzer/introspect_argparse.py ${stack.entrypoint}`);
        // parse JSON result into args/subcommands
      } else if (stack.framework === 'click' || stack.framework === 'typer') {
        // similar for click/typer
      }
    }
    
    // 4. Fallback: parse --help output
    if (args.length === 0) {
      const helpOutput = await this.runInContainer(dockerImage,
        `${stack.entrypoint} --help`);
      const parsed = this.helpParser.parse(helpOutput);
      args = parsed.arguments;
      subcommands = parsed.subcommands;
    }
    
    // 5. Merge README examples with detected args
    
    // 6. Return CapabilityDump
    return {
      projectName: path.basename(repoDir),
      language: stack.language,
      framework: stack.framework,
      entrypoint: stack.entrypoint,
      entrypointConfidence: stack.entrypoint ? 0.8 : 0.3,
      description: readme.description,
      arguments: args,
      subcommands,
      readmeContent: readme.fullContent,
      usageExamples: readme.usageExamples,
      rawHelpOutput: helpOutput,
      installMethod: stack.installMethod,
      detectedFiles: stack.keyFiles,
    };
  }
}
```

### Step 6: Copy introspection scripts into containers

The Python introspection scripts need to exist inside the Docker container. Options:

**Option A (recommended):** Mount them as a read-only volume:
```typescript
// When running introspection commands, mount the scripts dir
await dockerManager.runCommand(image, command, {
  extraVolumes: {
    '/analyzer': { hostPath: path.join(__dirname, 'analyzer-scripts'), readOnly: true }
  }
});
```

**Option B:** Copy them into the image during build. Heavier but avoids volume complexity.

Go with Option A.

### Step 7: Add "Analyze" UI to the app

For now, a simple developer-facing panel:

- Text field: paste a local repo path (or the path to an already-installed project)
- "Analyze" button
- Results panel showing the raw CapabilityDump as formatted JSON
- Later (Chunk 4) this feeds into the LLM to produce a UISchema

This can be a separate tab/view in the app — "Developer" or "Analyze" tab.

### Step 8: Test with real projects

Clone these repos locally and test the analyzer:

| Repo | Framework | Expected Result |
|------|-----------|-----------------|
| `yt-dlp/yt-dlp` | argparse | ~100+ arguments detected, subcommands |
| `psf/black` | click | Arguments: src, line-length, target-version, etc. |
| `tiangolo/typer` (examples) | typer | Clean typed arguments |
| `BurntSushi/ripgrep` | clap (Rust) | Falls back to --help parsing |
| `jgm/pandoc` | optparse (Haskell) | Falls back to --help parsing |

**Success criteria:**
- Python argparse/click/typer: ≥90% of arguments captured with correct types
- --help fallback: ≥70% of arguments captured (types may be less accurate)
- Entrypoint detected correctly for ≥80% of projects
- Analysis completes in < 30 seconds per project

## AI-Assisted Guidance (Context for Chunk 4)

The CapabilityDump is designed to give the LLM everything it needs in Chunk 4:
- `arguments` → LLM groups these into logical workflows and steps
- `readmeContent` → LLM uses this to write human-friendly guidance text
- `usageExamples` → LLM uses these to determine common workflows
- `rawHelpOutput` → LLM can catch anything the static parser missed
- `entrypointConfidence` → LLM knows when to be cautious

## File Structure After Chunk 3

```
packages/main/src/analyzer/
├── Analyzer.ts                      # Orchestrator
├── StackDetector.ts                 # Language/framework detection
├── ReadmeParser.ts                  # README extraction
├── introspectors/
│   ├── ArgparseIntrospector.ts      # Python argparse
│   ├── ClickIntrospector.ts         # Python click/typer
│   └── HelpParser.ts               # Generic --help fallback
├── analyzer-scripts/                # Scripts that run inside containers
│   ├── introspect_argparse.py
│   ├── introspect_click.py
│   └── introspect_typer.py
└── types.ts                         # CapabilityDump types

packages/shared/src/
├── capability-dump.ts               # Shared CapabilityDump types
└── ...existing files
```

## Dependencies (new for Chunk 3)

- No major new npm dependencies
- The introspection scripts are plain Python (they use only stdlib + the target project's deps, which are already installed in the container)

## Out of Scope for Chunk 3

- LLM-powered schema generation (Chunk 4)
- GitHub search and clone (Chunk 5) — for now, test with locally cloned repos
- Node.js CLI framework introspection (commander, yargs) — add later
- Rust/Go deep introspection (clap derive macros, cobra) — --help fallback is fine for now

## Claude Code Prompt

```
Read CLAUDE.md, ARCHITECTURE.md, and CHUNK_3.md. Then implement Chunk 3: static CLI introspection.

Follow CHUNK_3.md step by step. Key points:
- Build the StackDetector, ReadmeParser, and all introspectors
- The Python introspection scripts (argparse, click, typer) run INSIDE the Docker container — they get mounted as a volume
- The HelpParser is the fallback for any tool — parse --help output with heuristics
- The Analyzer orchestrator ties it all together and produces a CapabilityDump JSON
- Add a simple "Analyze" panel to the UI for testing
- Add the CapabilityDump types to the shared package

Test considerations:
- You won't be able to clone real repos in this session, so make the code testable with mock data
- Write unit tests for HelpParser with sample --help outputs from common tools (ffmpeg, ripgrep, pandoc, yt-dlp)
- Write unit tests for StackDetector with mock directory structures

After you're done, update CLAUDE.md to mark Chunk 3 as COMPLETE.
```
