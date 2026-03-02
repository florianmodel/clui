import * as path from 'path';
import type { Workflow } from '@gui-bridge/shared';

/**
 * Build a Docker command string from a workflow template and user inputs.
 * Replaces {stepId} placeholders with actual values.
 */
export function buildCommand(workflow: Workflow, inputs: Record<string, unknown>): string {
  let cmd = workflow.execute.command;

  for (const [stepId, value] of Object.entries(inputs)) {
    if (value === null || value === undefined || value === '') continue;

    const step = workflow.steps.find((s) => s.id === stepId);

    if (step?.type === 'file_input') {
      // File inputs: only the filename is relevant (file is mounted at /input/)
      const files = Array.isArray(value) ? value : [value];
      const filename = path.basename(String(files[0]));
      cmd = cmd.replaceAll(`{${stepId}}`, filename);
    } else if (step?.type === 'checkbox' || step?.type === 'toggle') {
      cmd = cmd.replaceAll(`{${stepId}}`, value ? 'true' : 'false');
    } else {
      cmd = cmd.replaceAll(`{${stepId}}`, String(value));
    }
  }

  return cmd;
}

/**
 * Collect all host file paths from file_input steps so they can be
 * copied into the container's /input directory.
 */
export function collectInputFiles(workflow: Workflow, inputs: Record<string, unknown>): string[] {
  const files: string[] = [];

  for (const step of workflow.steps) {
    if (step.type === 'file_input' && inputs[step.id]) {
      const val = inputs[step.id];
      if (Array.isArray(val)) {
        files.push(...val.map(String));
      } else {
        files.push(String(val));
      }
    }
  }

  return files;
}
