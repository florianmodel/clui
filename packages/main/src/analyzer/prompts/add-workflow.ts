import type { UISchema } from '@gui-bridge/shared';

/**
 * Build a prompt asking Claude to generate a single new Workflow for an existing project.
 * Returns a prompt expecting JSON: { "feasible": true, "workflow": {...} }
 *                               or { "feasible": false, "reason": "..." }
 */
export function buildAddWorkflowPrompt(description: string, schema: UISchema): string {
  const existingSummary = schema.workflows.map((wf) => (
    `  - "${wf.name}": ${wf.execute.command}`
  )).join('\n');

  return `You are a UX expert adding a new workflow to an existing CLI tool's GUI.

## Tool
Name: ${schema.projectName}
Docker image: ${schema.dockerImage}
Description: ${schema.description ?? '(not provided)'}

## Existing workflows
${existingSummary}

## User request
The user wants to: "${description}"

## Your task
1. Decide if this is FEASIBLE for this tool (the Docker image already exists and has the tool installed).
2. If feasible: generate ONE new Workflow object for this use case.
3. If not feasible: explain briefly why (≤20 words).

## Command template rules — MUST follow:
- Use {step_id} placeholders that exactly match your step IDs
- Single file input: /input/{step_id} (expands to /input/filename at runtime)
- Multiple files (multiple=true): iterate /input/ directly — NEVER use /input/{step_id} as a path
  RIGHT: [f for f in os.listdir('/input') if f.endswith('.pdf')]
  RIGHT: for f in /input/*.pdf; do tool "$f" -o /output/; done
- Output: always a FULL file path — NEVER write to bare '/output/'
  RIGHT: writer.write('/output/merged.pdf')
  RIGHT: -o /output/{output_step_id}
- Bash: ALWAYS quote path variables ("$f" not $f)
- Toggle steps: {step_id} expands to --step-id when true, omitted when false

## Output format — respond with ONLY valid JSON (no markdown, no extra text):

If feasible:
{"feasible":true,"workflow":{"id":"workflow-id","name":"Workflow Name","description":"Brief.","steps":[{"id":"step_id","label":"Label","type":"file_input","required":true}],"execute":{"command":"tool /input/{step_id} -o /output/result.ext","outputDir":"/output","successMessage":"Done."}}}

If not feasible:
{"feasible":false,"reason":"Reason in 20 words or fewer."}`;
}
