# Chunk 4: LLM-Powered UI Generation

## Goal

Send the CapabilityDump from Chunk 3 to Claude's API with a carefully crafted prompt, and get back a polished UISchema that the Chunk 2 renderer can display directly. The LLM does what static analysis can't: group arguments into logical workflows, write friendly labels, provide step-by-step guidance, and decide which of the 100+ flags actually matter to a normal user.

## Proof of Life

When this chunk is done:
1. User installs a project (or points at a local repo)
2. App runs the Chunk 3 analyzer → produces a CapabilityDump
3. App sends the dump to Claude API → receives a UISchema
4. App renders the UISchema with the Chunk 2 DynamicGUI
5. The generated UI is genuinely usable — sensible workflows, clear labels, correct input types
6. Schema is cached so analysis only happens once per project
7. User can review and tweak the generated schema before using it

## Step-by-Step Implementation

### Step 1: API Key Management

`packages/main/src/config/ConfigManager.ts`

For now, the developer's own API key. Later, users will enter theirs (with AI-assisted onboarding).

```typescript
interface AppConfig {
  anthropicApiKey?: string;
  // future: other settings
}

class ConfigManager {
  private configPath: string; // ~/.gui-bridge/config.json

  async getConfig(): Promise<AppConfig>;
  async setConfig(updates: Partial<AppConfig>): Promise<void>;
  async hasApiKey(): Promise<boolean>;
}
```

**UI for key entry:**
- On first launch (or if key is missing), show a setup screen
- Simple text input: "Enter your Anthropic API key"
- Link to https://console.anthropic.com/ to get a key
- Validate the key with a test API call before saving
- Store in `~/.gui-bridge/config.json` (not in the repo)

### Step 2: Claude API Client

`packages/main/src/analyzer/LLMClient.ts`

Thin wrapper around the Anthropic SDK.

```typescript
import Anthropic from '@anthropic-ai/sdk';

class LLMClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateUISchema(dump: CapabilityDump): Promise<UISchema> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        { role: 'user', content: this.buildPrompt(dump) }
      ],
    });

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    return this.parseAndValidate(text);
  }

  private buildPrompt(dump: CapabilityDump): string {
    // See Step 3
  }

  private parseAndValidate(response: string): UISchema {
    // See Step 5
  }
}
```

**Dependencies:** `npm install @anthropic-ai/sdk` in `packages/main`

**Model choice:** Use `claude-sonnet-4-20250514` — fast enough for interactive use, smart enough for schema generation. Don't use Opus (too slow/expensive for this).

### Step 3: The Prompt (most important part of this chunk)

This prompt is the core IP of the feature. It needs to be carefully engineered.

`packages/main/src/analyzer/prompts/generate-schema.ts`

```typescript
function buildSchemaGenerationPrompt(dump: CapabilityDump): string {
  return `You are a UX expert converting a command-line tool into a graphical user interface.

I'll give you a CapabilityDump — a structured analysis of a CLI tool including its arguments, subcommands, README, and usage examples. Your job is to produce a UISchema that a generic form renderer can use to create a friendly, usable GUI for this tool.

## Your goals:
1. **Identify 1-5 key workflows** that a typical user would want. Not every CLI flag needs to be in the UI — focus on common use cases. For a video converter: "Convert Video", "Extract Audio". For a code formatter: "Format Files", "Check Style".
2. **Group arguments into logical steps** within each workflow. Put related options together. Required inputs first, optional tweaks after.
3. **Choose the right input types** for each step:
   - File paths → file_input (with appropriate accept filters)
   - Directory paths → directory_input
   - Choices from a fixed list → dropdown (or radio if ≤4 options)
   - Yes/no flags → toggle
   - Free text → text_input
   - Numbers with ranges → number (with min/max)
4. **Write human-friendly labels and guidance.** The user is non-technical. Instead of "--output-format", say "Output Format". Instead of "-crf", say "Quality (lower = better, 18-28 recommended)". Add guidance text explaining what each step does in plain English.
5. **Build the command template** that maps step IDs to the actual CLI command. Use {step_id} placeholders. File inputs should reference /input/{step_id} (files are mounted there). Output should go to /output/.
6. **Skip internal/developer flags.** Things like --verbose, --debug, --version, --help, --config-file should usually NOT be in the UI unless they're genuinely useful to end users.

## Input: CapabilityDump

\`\`\`json
${JSON.stringify(dump, null, 2)}
\`\`\`

## Output format

Respond with ONLY a valid JSON object matching this TypeScript interface (no markdown fences, no explanation):

interface UISchema {
  projectId: string;
  projectName: string;       // Human-friendly name
  description: string;       // One-sentence description for non-technical users
  version: "1.0.0";
  workflows: Workflow[];
}

interface Workflow {
  id: string;                // kebab-case
  name: string;              // e.g. "Convert Video"
  description: string;       // What this workflow does
  guidance: string;          // Step-by-step instructions for the user, 1-3 sentences
  steps: Step[];
  execute: {
    command: string;         // CLI command with {step_id} placeholders
    outputDir: "/output";
    outputPattern?: string;  // Expected output glob, e.g. "*.mp4"
    successMessage: string;  // Shown on completion
  };
}

interface Step {
  id: string;                // snake_case, used in command template
  label: string;             // Human-friendly
  description?: string;      // Helper text
  guidance?: string;         // Plain English explanation
  type: "text_input" | "number" | "dropdown" | "radio" | "checkbox" | "file_input" | "directory_input" | "textarea" | "toggle";
  required: boolean;
  default?: string | number | boolean;
  placeholder?: string;
  options?: { value: string; label: string; description?: string }[];
  accept?: string;           // For file_input: ".mp4,.avi,.mkv"
  multiple?: boolean;
  min?: number;
  max?: number;
  step?: number;
}

## Important rules:
- Output ONLY valid JSON. No markdown, no explanation, no code fences.
- Every workflow must have a working command template.
- File inputs use /input/{step_id} in the command. Output goes to /output/.
- Keep it simple. 2-4 steps per workflow is ideal. Never more than 8.
- If the tool has subcommands, each major subcommand can be its own workflow.
- The projectId should be the tool's common name in kebab-case.
- Include sensible defaults wherever possible.
- For file type filters (accept), be generous — include common formats the tool supports.`;
}
```

### Step 4: Schema Refinement Prompt (optional, for complex tools)

For tools with many subcommands (like ffmpeg or yt-dlp), the first pass might not be perfect. Add an optional refinement step:

```typescript
function buildRefinementPrompt(schema: UISchema, dump: CapabilityDump, userFeedback?: string): string {
  return `Here is a UISchema generated for the CLI tool "${dump.projectName}":

\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`

${userFeedback ? `The user provided this feedback: "${userFeedback}"` : ''}

Please improve the schema:
- Fix any incorrect command templates
- Improve labels and guidance text
- Add missing common workflows
- Remove any steps that don't make sense
- Ensure all {step_id} placeholders in commands match actual step IDs

Output ONLY the improved JSON. No markdown, no explanation.`;
}
```

### Step 5: Response Parsing and Validation

`packages/main/src/analyzer/SchemaValidator.ts`

The LLM response needs careful parsing — LLMs sometimes add markdown fences or explanatory text.

```typescript
class SchemaValidator {
  /**
   * Parse LLM response into a UISchema.
   * Handles common issues: markdown fences, trailing commas, explanation text.
   */
  parse(response: string): UISchema {
    // 1. Strip markdown code fences if present
    let json = response
      .replace(/^```json?\s*/m, '')
      .replace(/```\s*$/m, '')
      .trim();

    // 2. Find the JSON object (in case there's explanation text around it)
    const firstBrace = json.indexOf('{');
    const lastBrace = json.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      json = json.slice(firstBrace, lastBrace + 1);
    }

    // 3. Parse
    const schema = JSON.parse(json) as UISchema;

    // 4. Validate
    this.validate(schema);

    return schema;
  }

  /**
   * Validate schema structure and fix common issues.
   */
  validate(schema: UISchema): void {
    if (!schema.projectId) throw new Error('Missing projectId');
    if (!schema.workflows?.length) throw new Error('No workflows generated');

    for (const workflow of schema.workflows) {
      // Check all step IDs referenced in command template exist
      const stepIds = new Set(workflow.steps.map(s => s.id));
      const placeholders = workflow.execute.command.match(/\{(\w+)\}/g) || [];

      for (const placeholder of placeholders) {
        const id = placeholder.slice(1, -1);
        if (!stepIds.has(id)) {
          console.warn(`Command references {${id}} but no step with that ID exists`);
        }
      }

      // Check required fields
      for (const step of workflow.steps) {
        if (!step.id || !step.label || !step.type) {
          throw new Error(`Step missing required fields: ${JSON.stringify(step)}`);
        }
        if (step.type === 'dropdown' && (!step.options || step.options.length === 0)) {
          console.warn(`Dropdown step "${step.id}" has no options`);
        }
      }
    }
  }
}
```

### Step 6: Schema Caching

`packages/main/src/analyzer/SchemaCache.ts`

Once a schema is generated, save it so we don't re-analyze every time.

```typescript
class SchemaCache {
  private baseDir: string; // ~/.gui-bridge/projects/

  async get(projectId: string): Promise<UISchema | null> {
    const schemaPath = path.join(this.baseDir, projectId, 'schema.json');
    if (await fs.pathExists(schemaPath)) {
      return fs.readJSON(schemaPath);
    }
    return null;
  }

  async save(projectId: string, schema: UISchema): Promise<void> {
    const projectDir = path.join(this.baseDir, projectId);
    await fs.ensureDir(projectDir);
    await fs.writeJSON(path.join(projectDir, 'schema.json'), schema, { spaces: 2 });
  }

  async saveDump(projectId: string, dump: CapabilityDump): Promise<void> {
    const projectDir = path.join(this.baseDir, projectId);
    await fs.ensureDir(projectDir);
    await fs.writeJSON(path.join(projectDir, 'capability-dump.json'), dump, { spaces: 2 });
  }

  async invalidate(projectId: string): Promise<void> {
    const schemaPath = path.join(this.baseDir, projectId, 'schema.json');
    await fs.remove(schemaPath);
  }
}
```

### Step 7: Full Analysis Pipeline

`packages/main/src/analyzer/Analyzer.ts` (update from Chunk 3)

Wire the full flow together:

```typescript
class Analyzer {
  // ... existing Chunk 3 code ...

  async analyzeAndGenerate(
    repoDir: string,
    dockerImage: string,
    options?: { forceRegenerate?: boolean }
  ): Promise<UISchema> {
    const projectId = path.basename(repoDir);

    // 1. Check cache
    if (!options?.forceRegenerate) {
      const cached = await this.schemaCache.get(projectId);
      if (cached) return cached;
    }

    // 2. Run static analysis (Chunk 3)
    const dump = await this.analyze(repoDir, dockerImage);
    await this.schemaCache.saveDump(projectId, dump);

    // 3. Generate UI schema via LLM
    const schema = await this.llmClient.generateUISchema(dump);

    // 4. Cache the result
    await this.schemaCache.save(projectId, schema);

    return schema;
  }
}
```

### Step 8: Schema Review UI

Before the user runs a tool for the first time, show them the generated schema and let them tweak it. This is important because LLM output isn't always perfect.

`packages/renderer/src/components/SchemaReview/`

**SchemaReview panel:**
```
┌─────────────────────────────────────────────┐
│  ✨ GUI Generated for yt-dlp                │
│                                             │
│  We analyzed this tool and created 3        │
│  workflows for you. Review them below.      │
│                                             │
│  ┌─ Download Video ──────────────────────┐  │
│  │  ✓ Video URL (text, required)         │  │
│  │  ✓ Output Format (dropdown: mp4, ...) │  │
│  │  ✓ Quality (dropdown: best, 720p,...) │  │
│  │  Command: yt-dlp -f {quality} ...     │  │
│  │                        [Edit Workflow] │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌─ Download Audio Only ─────────────────┐  │
│  │  ...                                  │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌─ Download Playlist ───────────────────┐  │
│  │  ...                                  │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  [Regenerate with AI]    [Looks Good →]     │
│                                             │
│  💬 Optional: tell the AI what to change    │
│  ┌─────────────────────────────────────┐    │
│  │ Add an option for subtitles...      │    │
│  └─────────────────────────────────────┘    │
│  [Regenerate with Feedback]                 │
└─────────────────────────────────────────────┘
```

**Features:**
- Shows a summary of each generated workflow and its steps
- "Edit Workflow" opens inline editing (change labels, reorder steps, remove steps)
- "Regenerate with AI" re-runs the LLM generation
- Feedback text field: user can describe what to change, gets sent as the refinement prompt (Step 4)
- "Looks Good →" saves the schema and switches to the DynamicGUI view

### Step 9: Wire into App Navigation

Update `App.tsx` with a simple flow:

```
Project not analyzed yet?
  → Show "Analyze" button
  → On click: run analysis → show loading → show SchemaReview

Schema reviewed and approved?
  → Show DynamicGUI (Chunk 2 renderer)
  → "Edit Schema" button in header to go back to SchemaReview
```

### Step 10: Loading and Progress UI

LLM calls take a few seconds. Show meaningful progress:

```
┌──────────────────────────────────────┐
│  🔍 Analyzing yt-dlp...             │
│                                      │
│  ✅ Detected: Python + argparse      │
│  ✅ Found 147 CLI arguments          │
│  ✅ Extracted 12 usage examples      │
│  ⏳ Generating UI with AI...         │
│  ░░░░░░░░░░░░░░░░░░░░░              │
│                                      │
│  This usually takes 10-20 seconds.   │
└──────────────────────────────────────┘
```

Send progress events from main → renderer via IPC at each stage.

## Testing

**Test with real projects (same as Chunk 3):**

| Repo | What to check |
|------|---------------|
| yt-dlp | Should generate 2-4 workflows (download video, audio, playlist). URL input + format dropdowns. |
| black | Should generate 1-2 workflows (format files, check). File/directory input + options. |
| ripgrep | Should generate 1 workflow (search). Pattern input + directory + common flags. |
| imagemagick | Should generate 2-3 workflows (resize, convert, compress). File input + dimension/format options. |

**For each, verify:**
- [ ] Generated schema is valid JSON matching UISchema type
- [ ] Workflows make sense for the tool
- [ ] Command templates are syntactically correct
- [ ] Step types match the argument types (files → file_input, choices → dropdown, etc.)
- [ ] Guidance text is helpful and non-technical
- [ ] Rendering the schema in DynamicGUI produces a usable form
- [ ] Actually running the generated command in Docker works

**Edge cases to test:**
- Tool with no arguments (just runs) → should produce a single workflow with just a Run button
- Tool with 200+ arguments (like ffmpeg) → should select only the most important ones
- Tool with deep subcommand trees → should create separate workflows per major subcommand

## Error Handling

- **API key missing:** Show setup screen, don't crash
- **API call fails (rate limit, network):** Show error with retry button
- **LLM returns invalid JSON:** Try parsing with relaxed rules (strip fences, find JSON substring). If still fails, retry once with a "please output only valid JSON" nudge. If still fails, show error and let user try again.
- **LLM returns nonsensical schema:** Validator catches missing fields, mismatched placeholders. Show warnings in the review UI so the user can fix them.

## File Structure After Chunk 4

```
packages/main/src/
├── analyzer/
│   ├── Analyzer.ts                  # Updated: full pipeline
│   ├── LLMClient.ts                 # Claude API wrapper
│   ├── SchemaValidator.ts           # Parse + validate LLM output
│   ├── SchemaCache.ts               # Cache generated schemas
│   ├── prompts/
│   │   └── generate-schema.ts       # Prompt templates
│   └── ...existing Chunk 3 files
├── config/
│   └── ConfigManager.ts             # API key + settings storage

packages/renderer/src/components/
├── SchemaReview/
│   ├── SchemaReview.tsx             # Review/edit generated schema
│   ├── WorkflowSummary.tsx          # Summary card per workflow
│   └── SchemaEditor.tsx             # Inline editing
├── Setup/
│   └── ApiKeySetup.tsx              # First-run API key entry
├── AnalysisProgress/
│   └── AnalysisProgress.tsx         # Loading states during analysis
└── ...existing Chunk 2 files
```

## Dependencies (new for Chunk 4)

**packages/main:**
- `@anthropic-ai/sdk` — Anthropic API client
- `fs-extra` — file system utilities (if not already installed)

## Out of Scope for Chunk 4

- GitHub search and project browsing (Chunk 5)
- Polished UI/animations (Chunk 6)
- Tool chaining (Chunk 7+)
- Multiple LLM providers (just Claude for now)
- Streaming the LLM response token-by-token (nice-to-have, not critical)

## Claude Code Prompt

```
Read CLAUDE.md, ARCHITECTURE.md, and CHUNK_4.md. Then implement Chunk 4: LLM-powered UI generation.

Follow CHUNK_4.md step by step. Key points:
- Use the @anthropic-ai/sdk package with claude-sonnet-4-20250514
- The prompt in generate-schema.ts is the most important part — follow the template closely
- Build the SchemaValidator to handle common LLM response issues (markdown fences, trailing text)
- Add schema caching in ~/.gui-bridge/projects/{id}/schema.json
- Build the SchemaReview UI so users can see and tweak generated schemas
- Build the API key setup screen (shown on first launch or if key is missing)
- Wire the full pipeline: analyze → generate → review → render
- Add progress events via IPC so the renderer shows analysis status

For testing: you won't have a real API key in this session, so make the LLM client mockable. Create a MockLLMClient that returns hardcoded schemas for testing the UI flow. The real API integration should work when the user provides their key.

After you're done, update CLAUDE.md to mark Chunk 4 as COMPLETE.
```
