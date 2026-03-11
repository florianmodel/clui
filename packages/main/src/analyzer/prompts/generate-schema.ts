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
    // For large argument sets, prioritize required args + first 35 total
    // Strip verbose description text to keep prompt compact
    arguments: [
      ...dump.arguments.filter(a => a.required),
      ...dump.arguments.filter(a => !a.required),
    ].slice(0, 35).map(a => ({
      name: a.name,
      type: a.type,
      required: a.required,
      default: a.default,
      choices: a.choices,
      // Truncate descriptions to keep prompt size down
      description: a.description?.slice(0, 80),
    })),
    subcommands: dump.subcommands.slice(0, 10).map(sc => ({
      name: sc.name,
      description: sc.description?.slice(0, 80),
      arguments: [
        ...sc.arguments.filter(a => a.required),
        ...sc.arguments.filter(a => !a.required),
      ].slice(0, 10).map(a => ({
        name: a.name, type: a.type, required: a.required, default: a.default,
      })),
    })),
    helpText: dump.helpText?.slice(0, 800),
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
   - **Multi-file input**: If the tool merges, combines, concatenates, or batch-processes multiple files (e.g. "merge PDFs", "join videos", "combine images"), set \`"multiple": true\` on the file_input step. Think: "Would a user need to select more than one file for this workflow?" If yes, use \`multiple: true\`.
4. **Write human-friendly labels and guidance.** The user is non-technical. Instead of "--output-format", say "Output Format". Instead of "-crf", say "Quality (lower = better, 18-28 recommended)". Add guidance text explaining what each step does in plain English.
5. **Build the command template** that maps step IDs to the actual CLI command. Use {step_id} placeholders. File inputs should reference /input/{step_id} (files are mounted there at runtime). Output goes to /output/.
6. **Skip internal/developer flags.** Things like --verbose, --debug, --version, --help, --config-file, --log-level should usually NOT be in the UI.

## Critical output rules — MUST follow to avoid truncation:
- Output ONLY valid JSON. No markdown fences, no text before or after.
- **Maximum 3 workflows.** Maximum 5 steps per workflow. No exceptions.
- **Keep all string values SHORT:** labels ≤ 5 words, descriptions ≤ 10 words, guidance ≤ 20 words.
- **Omit null/optional fields entirely** — do not include keys with null values.
- Every workflow must have a working command template using {step_id} placeholders.
- **CRITICAL: Every {placeholder} in the command MUST exactly match a step's "id" field.** Never invent names. If a step has id "video_url", write {video_url} in the command — NOT {url_arg} or {url_flag}.
- For toggle steps: write {step_id} in the command. It expands to --step-id when enabled and is omitted when disabled.
- For **single** file_input steps: write /input/{step_id} in the command (expands to /input/filename at runtime).
- For **multiple** file_input steps ("multiple": true): all selected files are mounted as flat files inside /input/. Iterate /input/ directly — do NOT reference {step_id} in any path.
  WRONG: [process('/input/' + '{' + 'step_id' + '}') for f in os.listdir('/input')]  <- {step_id} becomes '' leaving /input/ as a directory
  WRONG: os.listdir('/input/{step_id}')  <- {step_id} becomes filename, not a directory
  RIGHT: [process('/input/' + f) for f in sorted(os.listdir('/input')) if f.lower().endswith('.pdf')]
  RIGHT: for f in /input/*.pdf; do tool "$f" -o /output/; done
  - In bash: ALWAYS quote path variables ("$f" not $f) to handle filenames with spaces
  - For batch output where each input produces an output, derive output name from input filename: '/output/' + os.path.splitext(f)[0] + '.out' (do NOT hardcode a fixed name that gets overwritten each iteration)
- For output paths: always write a FULL file path — never the bare directory '/output/'.
  WRONG: m.write('/output/')         <- '/output/' is a directory, not a file — IsADirectoryError
  WRONG: open('/output/', 'wb')      <- same error
  RIGHT (single merged output): m.write('/output/merged.pdf')
  RIGHT (step-based output): -o /output/{output_step_id}
  RIGHT (tool with output dir support): -o /output/ (only valid when the CLI tool itself creates filenames)
  RIGHT (yt-dlp style): -o /output/%(title)s.%(ext)s
- The projectId should be the tool's common name in kebab-case (e.g. "yt-dlp", "black").
- The dockerImage field must be exactly: "${dockerImage}"
- The version field must be: "1.0.0"

## Input: CapabilityDump

\`\`\`json
${JSON.stringify(trimmedDump, null, 2)}
\`\`\`

## Output format — respond with ONLY this JSON (no extra fields, omit nulls):

{
  "projectId": "tool-name",
  "projectName": "Tool Name",
  "description": "One short sentence.",
  "version": "1.0.0",
  "dockerImage": "${dockerImage}",
  "workflows": [
    {
      "id": "workflow-id",
      "name": "Workflow Name",
      "description": "Brief description.",
      "guidance": "Short instruction.",
      "steps": [
        {
          "id": "step_id",
          "label": "Short Label",
          "type": "text_input",
          "required": true,
          "default": "value or omit",
          "placeholder": "hint or omit",
          "options": [{"value":"v","label":"L"}],
          "accept": ".mp4 or omit",
          "multiple": true,
          "min": 0,
          "max": 100
        }
      ],
      "execute": {
        "command": "tool --flag {step_id} /input/{file_step} -o /output/result",
        "outputDir": "/output",
        "successMessage": "Done."
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
