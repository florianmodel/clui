import type { Workflow } from '@gui-bridge/shared';

/**
 * Build a prompt asking Claude to map a natural-language description to
 * concrete form field values for the given workflow.
 * Returns a prompt expecting ONLY a JSON object: { stepId: value, ... }
 */
export function buildFormFillPrompt(description: string, workflow: Workflow): string {
  const FILE_TYPES = ['file_input', 'directory_input'];

  const stepsDesc = workflow.steps
    .filter((s) => !FILE_TYPES.includes(s.type))
    .map((s) => {
      const parts: string[] = [`- id: "${s.id}", type: "${s.type}"`];
      if (s.label) parts.push(`label: "${s.label}"`);
      if (s.description) parts.push(`description: "${s.description}"`);
      if ('options' in s && Array.isArray((s as { options?: unknown[] }).options)) {
        const opts = (s as { options: { value: unknown; label: string }[] }).options;
        parts.push(`options: [${opts.map((o) => `"${o.value}"`).join(', ')}]`);
      }
      if ('min' in s || 'max' in s) {
        const ns = s as { min?: number; max?: number; default?: unknown };
        parts.push(`range: ${ns.min ?? '?'} – ${ns.max ?? '?'}`);
        if (ns.default !== undefined) parts.push(`default: ${ns.default}`);
      }
      return parts.join(', ');
    })
    .join('\n');

  return `You are helping a user fill in a form for a CLI tool called "${workflow.name}".

## Form fields (file inputs excluded — do NOT include them)
${stepsDesc || '(no non-file fields)'}

## User wants to
"${description}"

## Your task
Map the user's description to specific field values. Only include fields you are confident about.
Skip fields where the user's description gives no clear signal.

## Output format — respond with ONLY valid JSON (no markdown, no extra text):
{"stepId": value, "stepId2": value2}

If you cannot confidently fill any fields, respond with: {}`;
}
