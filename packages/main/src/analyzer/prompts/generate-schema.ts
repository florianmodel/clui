import type { CapabilityDump, UISchema } from '@gui-bridge/shared';

export function buildSchemaGenerationPrompt(dump: CapabilityDump, dockerImage: string): string {
  // Trim the dump to avoid exceeding token limits — keep what matters for UI design
  const trimmedDump = {
    stack: dump.stack,
    readme: {
      description: dump.readme.description,
      usageExamples: dump.readme.usageExamples.slice(0, 10),
      installInstructions: undefined, // not needed for UI generation
    },
    introspectionMethod: dump.introspectionMethod,
    // For large argument sets, prioritize required args + first 60 total
    arguments: [
      ...dump.arguments.filter(a => a.required),
      ...dump.arguments.filter(a => !a.required),
    ].slice(0, 60),
    subcommands: dump.subcommands.slice(0, 20).map(sc => ({
      name: sc.name,
      description: sc.description,
      arguments: [
        ...sc.arguments.filter(a => a.required),
        ...sc.arguments.filter(a => !a.required),
      ].slice(0, 20),
    })),
    helpText: dump.helpText?.slice(0, 2000),
  };

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
5. **Build the command template** that maps step IDs to the actual CLI command. Use {step_id} placeholders. File inputs should reference /input/{step_id} (files are mounted there at runtime). Output goes to /output/.
6. **Skip internal/developer flags.** Things like --verbose, --debug, --version, --help, --config-file, --log-level should usually NOT be in the UI.

## Important rules:
- Output ONLY valid JSON. No markdown code fences, no explanation text before or after.
- Every workflow must have a working command template using {step_id} placeholders.
- File step IDs map to /input/{step_id} in the command. Output goes to /output/.
- Keep it simple. 2-5 steps per workflow is ideal. Never more than 8.
- If the tool has subcommands, each major subcommand becomes its own workflow.
- The projectId should be the tool's common name in kebab-case (e.g. "yt-dlp", "black").
- Include sensible defaults wherever possible.
- For file type filters (accept), be generous — include common formats the tool supports.
- The dockerImage field must be exactly: "${dockerImage}"
- The version field must be: "1.0.0"

## Input: CapabilityDump

\`\`\`json
${JSON.stringify(trimmedDump, null, 2)}
\`\`\`

## Output format

Respond with ONLY a valid JSON object matching this TypeScript interface:

{
  projectId: string,           // kebab-case tool name
  projectName: string,         // Human-friendly name (e.g. "YT-DLP", "Black")
  description: string,         // One-sentence description for non-technical users
  version: "1.0.0",
  dockerImage: "${dockerImage}",
  workflows: [
    {
      id: string,              // kebab-case
      name: string,            // e.g. "Download Video"
      description: string,     // What this workflow does
      guidance: string,        // Step-by-step instructions, 1-3 sentences
      steps: [
        {
          id: string,          // snake_case, used in command template as {id}
          label: string,       // Human-friendly label
          description: string, // Helper text shown below the input
          type: "text_input" | "number" | "dropdown" | "radio" | "checkbox" | "file_input" | "directory_input" | "textarea" | "toggle",
          required: boolean,
          default: string | number | boolean | null,
          placeholder: string | null,
          options: [{ value: string, label: string, description: string }] | null,  // for dropdown/radio
          accept: string | null,  // for file_input: ".mp4,.avi,.mkv"
          multiple: boolean | null,
          min: number | null,
          max: number | null,
          step: number | null
        }
      ],
      execute: {
        command: string,         // Full CLI command with {step_id} placeholders
        outputDir: "/output",
        outputPattern: string | null,   // Expected output glob, e.g. "*.mp4"
        successMessage: string
      }
    }
  ]
}`;
}

export function buildRefinementPrompt(
  currentSchema: UISchema,
  dump: CapabilityDump,
  feedback?: string,
): string {
  const toolName = currentSchema.projectName;
  return `Here is a UISchema generated for the CLI tool "${toolName}":

\`\`\`json
${JSON.stringify(currentSchema, null, 2)}
\`\`\`

${feedback ? `The user provided this feedback: "${feedback}"\n\nPlease improve the schema based on this feedback.` : 'Please review and improve the schema:'}
- Fix any incorrect command templates ({step_id} placeholders must match actual step IDs)
- Improve labels and guidance text to be more user-friendly
- Fix step types if they don't match the argument type (files → file_input, choices → dropdown, etc.)
- Remove any steps that are confusing or rarely useful
- Add sensible defaults where missing

The tool's CapabilityDump for reference:
Language: ${dump.stack.language}, Framework: ${dump.stack.framework}
${dump.readme.description ? `Description: ${dump.readme.description}` : ''}

Output ONLY the improved JSON object. No markdown, no explanation, no code fences.`;
}
