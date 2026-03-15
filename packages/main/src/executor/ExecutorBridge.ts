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
      if (step.multiple) {
        // Multiple files: all mounted as flat files inside /input/.
        // The command should iterate /input/ directly — replace {step_id} with
        // empty string so "/input/{step_id}" becomes "/input/".
        cmd = cmd.replaceAll(`{${stepId}}`, '');
      } else {
        // Single file: mounted at /input/<basename>
        const files = Array.isArray(value) ? value : [value];
        const filename = path.basename(String(files[0]));
        cmd = cmd.replaceAll(`{${stepId}}`, filename);
      }
    } else if (step?.type === 'checkbox' || step?.type === 'toggle') {
      if (value) {
        // Replace {step_id} with --step-id flag when enabled
        const flagName = '--' + stepId.replace(/_/g, '-');
        cmd = cmd.replaceAll(`{${stepId}}`, flagName);
      }
      // If false/unchecked, leave the placeholder — cleanup below will strip it
    } else {
      cmd = cmd.replaceAll(`{${stepId}}`, String(value));
    }
  }

  // Strip unfilled placeholders.  Two passes:
  //
  // Pass 1 — remove "flag + unfilled-value" pairs so dangling flags don't remain.
  // Matches patterns like:  -crf {crf}  |  --quality {quality}  |  -preset {preset}
  // This prevents ffmpeg/other tools seeing "-crf" with no value which causes parse errors.
  cmd = cmd.replace(/\s+-{1,2}[\w-]+\s+\{[^}]+\}/g, '');
  //
  // Pass 2 — remove any remaining bare {placeholder} tokens (positional args, path suffixes, etc.)
  cmd = cmd.replace(/\s*\{[^}]+\}/g, '').trim();

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
