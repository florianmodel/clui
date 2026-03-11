import type { Workflow } from '@gui-bridge/shared';

/**
 * Build a prompt asking Claude to fix a failed command template.
 * Returns a prompt that expects JSON: { "template": "...", "explanation": "..." }
 */
export function buildFixCommandPrompt(
  workflow: Workflow,
  failedCommand: string,
  errorOutput: string,
): string {
  const stepDetails = workflow.steps
    .map((s) => `  - ${s.id}: ${s.type}${s.multiple ? ' (MULTIPLE FILES — all files flat in /input/, iterate directly)' : ''}`)
    .join('\n');
  const trimmedError = errorOutput.slice(-1500);

  return `You are debugging a failed command-line execution inside a Docker container.

## Workflow
Name: ${workflow.name}
Original command template: ${workflow.execute.command}
Step details:
${stepDetails}

## Command that was run
${failedCommand}

## Error output
${trimmedError}

## Your task
Fix the command template so it succeeds. Respond with ONLY this JSON object (no markdown, no explanation outside it):

{"template":"fixed command using {step_id} placeholders","explanation":"what changed in 15 words or fewer"}

Rules:
- Use the EXACT same {step_id} placeholders as listed in Step details above
- Docker volume layout: /input/ is a flat directory of all user-selected files (each by its basename). /output/ is where results go.
- For single-file steps: /input/{step_id} expands to /input/filename.ext at runtime — correct.
- For MULTIPLE FILES steps: iterate /input/ directly — do NOT use /input/{step_id} as a path.
  WRONG: [process('/input/') for f in os.listdir('/input')]  <- /input/ is a directory, not a file
  RIGHT: [process('/input/' + f) for f in sorted(os.listdir('/input')) if f.lower().endswith('.pdf')]
  RIGHT: for f in /input/*.pdf; do tool "$f" -o /output/; done
- In bash: quote path variables ("$f" not $f) to handle filenames with spaces
- Keep the tool binary name unchanged
- explanation must be ≤15 words
- Output ONLY valid JSON, nothing else`;
}
