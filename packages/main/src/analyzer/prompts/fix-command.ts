import { describeExecution, type Workflow } from '@gui-bridge/shared';

interface DiagnosisContext {
  errorClass: string;
  shortReason: string;
  relevantLine?: string | null;
}

/**
 * Build a prompt asking Claude to fix a failed command template.
 * Returns a prompt that expects JSON: { "execute": {...}, "explanation": "..." }
 */
export function buildFixCommandPrompt(
  workflow: Workflow,
  failedCommand: string,
  errorOutput: string,
  inputValues?: Record<string, unknown>,
  diagnosis?: DiagnosisContext,
): string {
  const stepDetails = workflow.steps
    .map((s) => {
      if (s.type === 'file_input' && s.multiple) {
        return `  - ${s.id}: ${s.type} (DIRECTORY mounted at /input/${s.id})`;
      }
      if (s.type === 'file_input') {
        return `  - ${s.id}: ${s.type} (FILE mounted at /input/${s.id}/{${s.id}})`;
      }
      if (s.type === 'directory_input') {
        return `  - ${s.id}: ${s.type} (DIRECTORY mounted at /input/${s.id})`;
      }
      return `  - ${s.id}: ${s.type}`;
    })
    .join('\n');
  const trimmedError = errorOutput.slice(-3000);

  // Build a concrete "inputs used" section so LLM knows actual filenames/values
  let inputsSection = '';
  if (inputValues && Object.keys(inputValues).length > 0) {
    const lines = Object.entries(inputValues).map(([k, v]) => {
      const step = workflow.steps.find((s) => s.id === k);
      if (step?.type === 'file_input') {
        const files = Array.isArray(v) ? v : [v];
        const names = files.map((f) => String(f).split('/').pop()).join(', ');
        return step.multiple
          ? `  - ${k}: ${names} (mounted under /input/${k}/)`
          : `  - ${k}: ${names} (mounted at /input/${k}/{${k}})`;
      }
      if (step?.type === 'directory_input') {
        const dirName = String(v).split('/').pop() ?? String(v);
        return `  - ${k}: ${dirName} (mounted at /input/${k})`;
      }
      return `  - ${k}: ${JSON.stringify(v)}`;
    });
    inputsSection = `\n## Actual inputs used\n${lines.join('\n')}\n`;
  }

  // Diagnosis section from the classify step
  let diagnosisSection = '';
  if (diagnosis) {
    diagnosisSection = `\n## Error diagnosis
Type: ${diagnosis.errorClass}
Reason: ${diagnosis.shortReason}${diagnosis.relevantLine ? `\nKey line: ${diagnosis.relevantLine}` : ''}
`;
  }

  return `You are debugging a failed command-line execution inside a Docker container.
${diagnosisSection}
## Workflow
Name: ${workflow.name}
Original execution config: ${describeExecution(workflow)}
Step details:
${stepDetails}
${inputsSection}
## Command that was run
${failedCommand}

## Error output
${trimmedError}

## Your task
Fix the execution config so it succeeds. Respond with ONLY this JSON object (no markdown, no explanation outside it):

{"execute":{"executable":"tool","args":["--flag","{step_id}"]},"explanation":"what changed in 15 words or fewer"}

If a loop is truly required, return:
{"execute":{"shellScript":"for f in /input/input_files/*; do tool \"$f\"; done"},"explanation":"what changed in 15 words or fewer"}

Rules:
- CRITICAL: {step_id} placeholders are RUNTIME VARIABLES substituted with a different value every run. NEVER replace a placeholder with the literal value shown in "Actual inputs used" or in the failed command. If you see output_filename="merged.pdf", your template must still say /output/{output_filename} — not /output/merged.pdf or /output/. Hardcoding the literal value permanently breaks all future runs.
- Use the EXACT same {step_id} placeholders as listed in Step details above
- Prefer execute.executable + execute.args. Use shellScript only when a loop over a mounted directory is required.
- Docker volume layout: /output/ is where results go.
- For single-file steps: /input/<step_id>/{step_id} resolves to the selected filename.
- For MULTIPLE FILES steps: iterate /input/<step_id>/ directly.
- For DIRECTORY_INPUT steps: use /input/<step_id>.
- Never use /input/ as a catch-all directory.
- Output must be a FULL FILE PATH — never the bare directory '/output/':
  WRONG: m.write('/output/')         <- IsADirectoryError: /output/ is a directory, not a file
  WRONG: open('/output/', 'wb')      <- same
  RIGHT: m.write('/output/merged.pdf')
  RIGHT: writer.write('/output/result.pdf')
- In bash: quote path variables ("$f" not $f) to handle filenames with spaces
- Keep the tool binary name unchanged
- explanation must be ≤15 words
- Output ONLY valid JSON, nothing else`;
}
