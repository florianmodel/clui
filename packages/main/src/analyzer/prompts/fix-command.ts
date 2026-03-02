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
- File inputs must reference /input/{step_id}; output paths must use /output/
- Keep the tool binary name unchanged
- explanation must be ≤15 words
- Output ONLY valid JSON, nothing else`;
}
