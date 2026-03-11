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
  const stepIds = workflow.steps.map((s) => s.id).join(', ');
  const trimmedError = errorOutput.slice(-1500);

  return `You are debugging a failed command-line execution inside a Docker container.

## Workflow
Name: ${workflow.name}
Original command template: ${workflow.execute.command}
Available step IDs (placeholders): ${stepIds}

## Command that was run
${failedCommand}

## Error output
${trimmedError}

## Your task
Fix the command template so it succeeds. Respond with ONLY this JSON object (no markdown, no explanation outside it):

{"template":"fixed command using {step_id} placeholders","explanation":"what changed in 15 words or fewer"}

Rules:
- Use the EXACT same {step_id} placeholders as the original (step IDs: ${stepIds})
- Docker volume layout: /input/ is a flat directory containing all user-selected files (each mounted by its basename). /output/ is where results go.
- For single-file steps: /input/{step_id} expands to /input/filename.ext at runtime — correct.
- For multi-file steps (merge, combine, batch): iterate /input/ directly (e.g. os.listdir('/input'), /input/*.pdf). Do NOT use /input/{step_id} as a directory — {step_id} is a filename, not a subdirectory.
- Keep the tool binary name unchanged
- explanation must be ≤15 words
- Output ONLY valid JSON, nothing else`;
}
