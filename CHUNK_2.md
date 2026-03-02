# Chunk 2: UI Schema Spec + Dynamic GUI Renderer

## Goal

A generic renderer that takes any `UISchema` JSON and produces a fully interactive form — with file pickers, dropdowns, validation, and an execute button that runs the actual command in Docker. No hardcoded UI for any specific tool.

## Proof of Life

When this chunk is done:
1. App loads a `schema.json` from disk (hand-written, e.g. ffmpeg or yt-dlp)
2. The UI dynamically renders the correct inputs: file pickers, dropdowns, text fields, etc.
3. User fills in the form → clicks "Run" → command is built from the schema template + user inputs → executed in Docker
4. Logs stream in real-time, output files are accessible on completion
5. Switching to a different schema.json renders a completely different UI — no code changes needed

## Step-by-Step Implementation

### Step 1: Finalize the UI Schema types

The types in `packages/shared/src/ui-schema.ts` should already exist from Chunk 1 / ARCHITECTURE.md. Review and make sure they include everything below. If they're incomplete, update them.

```typescript
interface UISchema {
  projectId: string;
  projectName: string;
  description: string;
  version: string;
  icon?: string;                  // emoji or icon name
  workflows: Workflow[];
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  guidance?: string;              // AI help text shown at top
  steps: Step[];
  execute: ExecutionConfig;
}

interface Step {
  id: string;
  label: string;
  description?: string;
  guidance?: string;              // Per-step help text
  type: StepType;
  required: boolean;
  default?: string | number | boolean;
  placeholder?: string;

  // Type-specific fields
  options?: SelectOption[];       // For dropdown, radio
  accept?: string;                // For file_input, e.g. ".mp4,.avi"
  multiple?: boolean;             // For file_input
  min?: number;                   // For number
  max?: number;                   // For number
  step?: number;                  // For number (increment)
  validation?: ValidationRule;

  // Conditional visibility (future-proofing)
  showIf?: {
    stepId: string;
    equals: string | number | boolean;
  };
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
  pattern?: string;
  message?: string;
  minLength?: number;
  maxLength?: number;
}

interface ExecutionConfig {
  command: string;                // Template: "ffmpeg -i /input/{input_file} /output/out.{format}"
  outputDir: string;
  outputPattern?: string;         // Glob: "*.mp4"
  successMessage?: string;
  estimatedDuration?: string;     // "~30 seconds per minute of video"
}
```

### Step 2: Build the input components

Create one React component per `StepType`. Each component receives the same props interface:

```typescript
interface StepInputProps {
  step: Step;
  value: any;
  onChange: (stepId: string, value: any) => void;
  error?: string;
}
```

**Components to build in `packages/renderer/src/components/DynamicGUI/inputs/`:**

| Component | StepType | Behavior |
|-----------|----------|----------|
| `TextInput.tsx` | `text_input` | Standard text field. Supports placeholder, validation pattern. |
| `NumberInput.tsx` | `number` | Number field with min/max/step. |
| `Dropdown.tsx` | `dropdown` | Select menu from `step.options`. Show description as subtitle if present. |
| `RadioGroup.tsx` | `radio` | Radio buttons from `step.options`. Better for ≤4 options. |
| `CheckboxInput.tsx` | `checkbox` | Single checkbox (boolean). |
| `ToggleInput.tsx` | `toggle` | Toggle switch (boolean). |
| `FileInput.tsx` | `file_input` | Button that opens Electron's native file dialog. Shows selected filename. Respects `accept` filter and `multiple`. |
| `DirectoryInput.tsx` | `directory_input` | Button that opens native directory picker. |
| `TextareaInput.tsx` | `textarea` | Multi-line text input. |

**Each component must:**
- Display `step.label` as the field label
- Show `step.description` as helper text below the label (if present)
- Show `step.guidance` as a more prominent hint (if present)
- Mark required fields with a visual indicator
- Show validation errors
- Apply `step.default` as initial value

### Step 3: Build the StepRenderer

`packages/renderer/src/components/DynamicGUI/StepRenderer.tsx`

A mapping component that picks the right input based on `step.type`:

```typescript
function StepRenderer({ step, value, onChange, error }: StepInputProps) {
  switch (step.type) {
    case 'text_input': return <TextInput step={step} value={value} onChange={onChange} error={error} />;
    case 'dropdown': return <Dropdown step={step} value={value} onChange={onChange} error={error} />;
    case 'file_input': return <FileInput step={step} value={value} onChange={onChange} error={error} />;
    // ... etc
  }
}
```

### Step 4: Build the WorkflowPanel

`packages/renderer/src/components/DynamicGUI/WorkflowPanel.tsx`

This is the main form for a single workflow:

```
┌─────────────────────────────────────────┐
│  Convert Video                          │
│  Convert a video file to another format │
│                                         │
│  ┌─ Guidance ─────────────────────────┐ │
│  │ Select your video file, choose     │ │
│  │ the output format, and hit Convert │ │
│  └────────────────────────────────────┘ │
│                                         │
│  Input Video *              [Browse...] │
│  video.mp4 selected                     │
│                                         │
│  Output Format *            [▾ MP4    ] │
│                                         │
│  Quality                    [▾ Medium ] │
│                                         │
│  ┌──────────────────────────────────┐   │
│  │          ▶ Convert               │   │
│  └──────────────────────────────────┘   │
│                                         │
│  ═══════════════════════════════════    │
│                                         │
│  Estimated: ~30 seconds per min of video│
└─────────────────────────────────────────┘
```

**Responsibilities:**
- Manages form state: `Record<string, any>` mapping step IDs to values
- Initializes defaults from schema
- Validates on submit (check required, run validation patterns)
- Handles `showIf` conditional visibility
- On "Run": calls the execution bridge via IPC

### Step 5: Build the WorkflowSelector

`packages/renderer/src/components/DynamicGUI/WorkflowSelector.tsx`

If a schema has multiple workflows (e.g. ffmpeg might have "Convert Video", "Extract Audio", "Create GIF"), show tabs or a sidebar to switch between them.

- Single workflow → no selector shown, just render the panel
- Multiple workflows → horizontal tabs at the top

### Step 6: Build the DynamicGUI container

`packages/renderer/src/components/DynamicGUI/DynamicGUI.tsx`

Top-level component that receives a `UISchema` and orchestrates everything:

```typescript
function DynamicGUI({ schema }: { schema: UISchema }) {
  const [activeWorkflow, setActiveWorkflow] = useState(schema.workflows[0].id);
  
  return (
    <div>
      <header>
        <h1>{schema.projectName}</h1>
        <p>{schema.description}</p>
      </header>
      
      {schema.workflows.length > 1 && (
        <WorkflowSelector 
          workflows={schema.workflows} 
          active={activeWorkflow} 
          onChange={setActiveWorkflow} 
        />
      )}
      
      <WorkflowPanel 
        workflow={schema.workflows.find(w => w.id === activeWorkflow)!} 
        projectId={schema.projectId}
      />
    </div>
  );
}
```

### Step 7: Build the Execution Bridge

`packages/main/src/executor/ExecutorBridge.ts`

This is the critical piece that turns form values into Docker commands.

**Command template resolution:**
```typescript
function buildCommand(workflow: Workflow, inputs: Record<string, any>): string {
  let cmd = workflow.execute.command;
  
  for (const [stepId, value] of Object.entries(inputs)) {
    const step = workflow.steps.find(s => s.id === stepId);
    
    if (step?.type === 'file_input') {
      // File inputs: use just the filename (file is mounted at /input/)
      const filename = path.basename(value);
      cmd = cmd.replaceAll(`{${stepId}}`, filename);
    } else if (step?.type === 'checkbox' || step?.type === 'toggle') {
      // Booleans: include the flag or not
      cmd = cmd.replaceAll(`{${stepId}}`, value ? 'true' : 'false');
    } else {
      cmd = cmd.replaceAll(`{${stepId}}`, String(value));
    }
  }
  
  return cmd;
}
```

**Input preparation:**
- For `file_input` steps: copy selected files to a temp directory that gets mounted as `/input/`
- For `directory_input` steps: mount the selected directory

**Wire up IPC handler:**
- `exec:run` receives `{ projectId, workflowId, inputs }`
- Builds command from schema template
- Prepares input files
- Calls DockerManager.runCommand()
- Streams logs back
- On completion, lists output files

### Step 8: Update App.tsx

Replace the Chunk 1 hardcoded test UI with:
1. A schema loader (for now: read from `~/.gui-bridge/projects/{id}/schema.json` or a bundled example)
2. The `DynamicGUI` component
3. Keep the `OutputPanel` / `LogPanel` from Chunk 1 — integrate it below the form

### Step 9: Create example schemas

Create at least 2 hand-written schemas in `schemas/examples/`:

**`schemas/examples/ffmpeg.json`** — Video converter with 2 workflows:
- "Convert Video": input file, output format, quality
- "Extract Audio": input file, audio format (mp3/wav/aac), bitrate

**`schemas/examples/imagemagick.json`** — Image processor with 2 workflows:
- "Resize Image": input file, width, height, maintain aspect ratio toggle
- "Convert Format": input file, output format (png/jpg/webp/gif)

These schemas prove the renderer is truly generic — same code, totally different UIs.

### Step 10: Integration test

Manual test checklist:
- [ ] Load ffmpeg schema → see Convert Video form
- [ ] Switch to Extract Audio tab → see different form
- [ ] Load imagemagick schema → see completely different UI
- [ ] Fill in ffmpeg form → click Run → command built correctly
- [ ] Docker runs the command → logs stream → output file appears
- [ ] Validation: submit with missing required field → error shown
- [ ] File picker opens native dialog, respects file type filter

## UI/UX Notes

- **Keep it clean but functional.** No need for pixel-perfect design yet (Chunk 6), but it should be usable and not ugly.
- **Use a simple design system:** consistent spacing, readable fonts, clear labels. Tailwind or plain CSS modules are both fine.
- **The guidance text is important.** It's what makes this accessible to non-technical users. Give it visual prominence — maybe a blue info box at the top of each workflow.
- **Show the generated command** in a collapsed/expandable section below the Run button. Power users will want to see what's actually being executed. Label it "Command Preview" and make it toggleable.
- **Error states matter.** If Docker isn't running, show a clear message. If the command fails, show the error output prominently, not buried in logs.

## File Structure After Chunk 2

```
packages/renderer/src/components/DynamicGUI/
├── DynamicGUI.tsx              # Top-level container
├── WorkflowSelector.tsx        # Tab switcher
├── WorkflowPanel.tsx           # Form + execute button
├── StepRenderer.tsx            # Step type → component mapper
├── CommandPreview.tsx          # Expandable command display
├── inputs/
│   ├── TextInput.tsx
│   ├── NumberInput.tsx
│   ├── Dropdown.tsx
│   ├── RadioGroup.tsx
│   ├── CheckboxInput.tsx
│   ├── ToggleInput.tsx
│   ├── FileInput.tsx
│   ├── DirectoryInput.tsx
│   └── TextareaInput.tsx
└── index.ts                    # Barrel export
```

## Dependencies (new for Chunk 2)

No new major dependencies expected. If you want icons for file pickers etc., `lucide-react` is a good lightweight option.

## Out of Scope for Chunk 2

- Auto-generating schemas from CLI analysis (Chunk 3-4)
- GitHub search and install (Chunk 5)
- Pretty styling and animations (Chunk 6)
- Pipeline/chaining (Chunk 7+)
- The `showIf` conditional logic can be stubbed but doesn't need to fully work yet

## Claude Code Prompt

```
Read CLAUDE.md, ARCHITECTURE.md, and CHUNK_2.md. Then implement Chunk 2: the UI schema spec and dynamic GUI renderer. Follow CHUNK_2.md step by step. 

Key points:
- The renderer must be fully generic — driven entirely by the schema JSON, no hardcoded tool-specific UI
- Build all input components listed in the step table
- Create the ExecutorBridge that templates schema commands with user inputs
- Create both example schemas (ffmpeg + imagemagick)  
- Replace the Chunk 1 test UI with the new DynamicGUI component
- Test that loading different schemas produces different UIs without code changes

After you're done, update CLAUDE.md to mark Chunk 2 as COMPLETE.
```
