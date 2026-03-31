/**
 * Shared execution resolver — used in both the main process (runtime) and the renderer (preview).
 * Must not use Node.js APIs so it works in both environments.
 */

import type { Step, Workflow } from './ui-schema.js';

export interface InputBinding {
  stepId: string;
  type: 'file_input' | 'directory_input';
  multiple: boolean;
  sourcePaths: string[];
  containerDir: string;
  containerValue: string;
}

export interface ResolvedExecution {
  mode: 'argv' | 'shell';
  executable?: string;
  args?: string[];
  shellScript?: string;
  preview: string;
  inputBindings: InputBinding[];
}

/**
 * Cross-platform basename — works in Node and browser without importing 'path'.
 * Returns the last path segment after any '/' or '\'.
 */
function basename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
}

/**
 * Preview-friendly shell quoting used only for display.
 */
function quoteForPreview(value: string): string {
  return /[\s"'`$\\]/.test(value)
    ? JSON.stringify(value)
    : value;
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function containerDir(stepId: string): string {
  return `/input/${stepId}`;
}

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function looksLikeShellScript(command: string): boolean {
  return /[\n;&|`]|(?:\$\()|\bfor\b|\bwhile\b|\bif\b/.test(command);
}

function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | '\'' | null = null;
  let escaped = false;

  for (const char of command) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && quote !== '\'') {
      escaped = true;
      continue;
    }

    if ((char === '"' || char === '\'') && (!quote || quote === char)) {
      quote = quote ? null : char;
      continue;
    }

    if (!quote && /\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) tokens.push(current);
  return tokens;
}

function buildInputBindings(workflow: Workflow, inputs: Record<string, unknown>): InputBinding[] {
  const bindings: InputBinding[] = [];

  for (const step of workflow.steps) {
    if (step.type !== 'file_input' && step.type !== 'directory_input') continue;

    const raw = inputs[step.id];
    if (raw === null || raw === undefined || raw === '') continue;

    if (step.type === 'file_input') {
      const sourcePaths = (Array.isArray(raw) ? raw : [raw]).map(String).filter(Boolean);
      if (sourcePaths.length === 0) continue;
      bindings.push({
        stepId: step.id,
        type: 'file_input',
        multiple: !!step.multiple,
        sourcePaths,
        containerDir: containerDir(step.id),
        containerValue: step.multiple
          ? containerDir(step.id)
          : `${containerDir(step.id)}/${basename(sourcePaths[0])}`,
      });
      continue;
    }

    bindings.push({
      stepId: step.id,
      type: 'directory_input',
      multiple: false,
      sourcePaths: [String(raw)],
      containerDir: containerDir(step.id),
      containerValue: containerDir(step.id),
    });
  }

  return bindings;
}

function buildValueResolver(
  workflow: Workflow,
  inputs: Record<string, unknown>,
  bindings: InputBinding[],
) {
  const steps = new Map(workflow.steps.map((step) => [step.id, step]));
  const bindingMap = new Map(bindings.map((binding) => [binding.stepId, binding]));

  return (stepId: string, shellMode: boolean, usage: 'whole' | 'inline'): string | null => {
    const step = steps.get(stepId);
    const raw = inputs[stepId];

    if (!step) return null;

    if (step.type === 'file_input' || step.type === 'directory_input') {
      const binding = bindingMap.get(stepId);
      if (!binding) return null;
      if (usage === 'inline' && step.type === 'file_input' && !step.multiple) {
        const fileName = basename(binding.sourcePaths[0]);
        return shellMode ? shellEscape(fileName) : fileName;
      }
      return shellMode ? shellEscape(binding.containerValue) : binding.containerValue;
    }

    if (step.type === 'checkbox' || step.type === 'toggle') {
      const enabled = normalizeBoolean(raw);
      if (!enabled) return null;
      return `--${step.id.replace(/_/g, '-')}`;
    }

    if (raw === null || raw === undefined || raw === '') return null;
    const stringValue = String(raw);
    return shellMode ? shellEscape(stringValue) : stringValue;
  };
}

function resolveArgToken(
  token: string,
  workflow: Workflow,
  resolveValue: (stepId: string, shellMode: boolean, usage: 'whole' | 'inline') => string | null,
): string | null {
  const placeholders = Array.from(token.matchAll(/\{(\w+)\}/g));
  if (placeholders.length === 0) return token;

  if (placeholders.length === 1 && token === placeholders[0][0]) {
    return resolveValue(placeholders[0][1], false, 'whole');
  }

  let resolved = token;
  for (const match of placeholders) {
    const value = resolveValue(match[1], false, 'inline');
    if (value === null) return null;
    resolved = resolved.replaceAll(match[0], value);
  }

  return resolved;
}

function resolveArgs(
  workflow: Workflow,
  args: string[],
  resolveValue: (stepId: string, shellMode: boolean, usage: 'whole' | 'inline') => string | null,
): string[] {
  const resolved: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    const value = resolveArgToken(token, workflow, resolveValue);

    if (value === null) {
      if (resolved.length > 0 && /^-{1,2}[\w-]+$/.test(resolved[resolved.length - 1])) {
        resolved.pop();
      }
      continue;
    }

    resolved.push(value);
  }

  return resolved;
}

function resolveShellScript(
  script: string,
  resolveValue: (stepId: string, shellMode: boolean, usage: 'whole' | 'inline') => string | null,
): string {
  return script.replace(/\{(\w+)\}/g, (match, stepId, offset, source) => {
    const before = offset === 0 ? '' : source[offset - 1];
    const after = source[offset + match.length] ?? '';
    const usage =
      (!before || /[\s"'=:([]/.test(before)) &&
      (!after || /[\s"'=;:)\]]/.test(after))
        ? 'whole'
        : 'inline';
    return resolveValue(stepId, true, usage) ?? '';
  });
}

function describeExecutionParts(workflow: Workflow): { mode: 'argv' | 'shell'; executable?: string; args?: string[]; shellScript?: string } {
  const execute = workflow.execute;

  if (execute.shellScript) {
    return { mode: 'shell', shellScript: execute.shellScript };
  }

  if (execute.executable) {
    return { mode: 'argv', executable: execute.executable, args: execute.args ?? [] };
  }

  if (execute.command) {
    if (looksLikeShellScript(execute.command)) {
      return { mode: 'shell', shellScript: execute.command };
    }
    const tokens = tokenizeCommand(execute.command);
    if (tokens.length > 0) {
      return { mode: 'argv', executable: tokens[0], args: tokens.slice(1) };
    }
  }

  return { mode: 'argv', executable: '', args: [] };
}

export function describeExecution(workflow: Workflow): string {
  const execution = describeExecutionParts(workflow);
  if (execution.mode === 'shell') {
    return execution.shellScript ? `sh -lc ${quoteForPreview(execution.shellScript)}` : '';
  }
  if (!execution.executable) return '';
  return [execution.executable, ...(execution.args ?? [])].join(' ');
}

/**
 * Resolve a workflow into either argv execution or explicit shell execution.
 * This is the single source of truth used by both the main process executor
 * and the renderer command preview — they will always match.
 */
export function resolveExecution(workflow: Workflow, inputs: Record<string, unknown>): ResolvedExecution {
  const execution = describeExecutionParts(workflow);
  const inputBindings = buildInputBindings(workflow, inputs);
  const resolveValue = buildValueResolver(workflow, inputs, inputBindings);

  if (execution.mode === 'shell') {
    const shellScript = resolveShellScript(execution.shellScript ?? '', resolveValue);
    return {
      mode: 'shell',
      shellScript,
      preview: shellScript ? `sh -lc ${quoteForPreview(shellScript)}` : '',
      inputBindings,
    };
  }

  const executable = execution.executable ?? '';
  const args = resolveArgs(workflow, execution.args ?? [], resolveValue);
  const preview = [executable, ...args].filter(Boolean).map(quoteForPreview).join(' ').trim();
  return {
    mode: 'argv',
    executable,
    args,
    preview,
    inputBindings,
  };
}

export function buildCommand(workflow: Workflow, inputs: Record<string, unknown>): string {
  return resolveExecution(workflow, inputs).preview;
}

/**
 * Collect all step-aware input bindings so runtimes can mount each input
 * under /input/<step_id>/ without basename collisions.
 */
export function collectInputBindings(workflow: Workflow, inputs: Record<string, unknown>): InputBinding[] {
  return buildInputBindings(workflow, inputs);
}

/**
 * Legacy helper retained for older callsites that only need flat file lists.
 */
export function collectInputFiles(workflow: Workflow, inputs: Record<string, unknown>): string[] {
  return buildInputBindings(workflow, inputs)
    .filter((binding) => binding.type === 'file_input')
    .flatMap((binding) => binding.sourcePaths);
}
