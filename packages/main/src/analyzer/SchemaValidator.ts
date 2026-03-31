import type { ExecutionConfig, UISchema } from '@gui-bridge/shared';

const DANGEROUS_ARGV_OPERATORS = /(?:^|[\s;])(?:rm\s|mv\s|cp\s|sudo\s|curl\s|wget\s|bash\s|sh\s|eval\s|exec\s|dd\s)|[`]|(?<!\{)\$\(|(?:&&|\|\||\bssh\b|\bscp\b)/;
const DANGEROUS_SHELL_OPERATORS = /(?:^|[\s;])(?:rm\s|mv\s|cp\s|sudo\s|curl\s|wget\s|bash\s|eval\s|exec\s|dd\s|mkfs\s|chmod\s|chown\s)|[`]|(?<!\{)\$\(|(?:&&|\|\||\bssh\b|\bscp\b)/;

export class SchemaValidator {
  /**
   * Parse LLM response text into a UISchema.
   * Handles common issues: markdown fences, leading/trailing text.
   */
  /**
   * Parse LLM response text into a UISchema.
   * Handles common issues: markdown fences, leading/trailing text.
   */
  parse(response: string): UISchema {
    return this.parseWithWarnings(response).schema;
  }

  /**
   * Parse LLM response text into a UISchema, also returning any non-fatal warnings.
   */
  parseWithWarnings(response: string): { schema: UISchema; warnings: string[] } {
    // Strip markdown code fences
    let json = response
      .replace(/^```json\s*/m, '')
      .replace(/^```\s*/m, '')
      .replace(/```\s*$/m, '')
      .trim();

    // Extract the JSON object in case there's surrounding text
    const firstBrace = json.indexOf('{');
    const lastBrace = json.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('No JSON object found in LLM response');
    }
    json = json.slice(firstBrace, lastBrace + 1);

    let schema: UISchema;
    try {
      schema = JSON.parse(json) as UISchema;
    } catch (e) {
      throw new Error(`Failed to parse LLM response as JSON: ${e instanceof Error ? e.message : String(e)}`);
    }

    const warnings = this.validate(schema);
    return { schema, warnings };
  }

  /**
   * Validate schema structure. Throws on fatal structural errors.
   * Returns an array of non-fatal warning strings (previously logged to console).
   */
  validate(schema: UISchema): string[] {
    const warnings: string[] = [];

    if (!schema.projectId) throw new Error('Missing projectId in generated schema');
    if (!schema.workflows?.length) throw new Error('No workflows in generated schema');

    for (const workflow of schema.workflows) {
      if (!workflow.id || !workflow.name) {
        throw new Error(`Workflow missing id or name: ${JSON.stringify(workflow)}`);
      }
      const execution = this.validateExecution(workflow.id, workflow.execute, workflow.steps, warnings);

      const steps = workflow.steps ?? [];
      const stepIds = new Set(steps.map(s => s.id));
      const placeholderNames = this.extractPlaceholders(execution);
      const badPlaceholders = placeholderNames.filter(name => !stepIds.has(name));

      if (badPlaceholders.length > 0) {
        const repaired = this.repairExecutionPlaceholders(execution, steps);
        const remaining = this.extractPlaceholders(repaired).filter(name => !stepIds.has(name));

        if (remaining.length === 0) {
          workflow.execute = repaired;
          warnings.push(`Workflow "${workflow.id}": placeholder mismatch ${badPlaceholders.map((name) => `{${name}}`).join(', ')} — placeholder names were normalized`);
        } else {
          warnings.push(`Workflow "${workflow.id}": unresolved placeholder mismatch ${remaining.map((name) => `{${name}}`).join(', ')}`);
        }
      }

      const executionText = this.executionText(execution);

      for (const step of steps) {
        if (step.type === 'file_input' && step.multiple) {
          if (executionText.includes(`/input/{${step.id}}`) || executionText.includes(`/input/${step.id}`)) {
            warnings.push(`Workflow "${workflow.id}" step "${step.id}": multi-file input must use /input/${step.id} as a directory, not a file path`);
          }
        }

        if (step.type === 'directory_input') {
          if (executionText.includes(`{${step.id}}`) && !executionText.includes(`/input/${step.id}`)) {
            warnings.push(`Workflow "${workflow.id}" step "${step.id}": directory input should reference /input/${step.id}`);
          }
        }
      }

      // Validate individual steps
      for (const step of steps) {
        if (!step.id || !step.label || !step.type) {
          throw new Error(`Step missing required fields: ${JSON.stringify(step)}`);
        }
        if ((step.type === 'dropdown' || step.type === 'radio') &&
            (!step.options || step.options.length === 0)) {
          warnings.push(`Step "${step.id}" is ${step.type} but has no options — users will see an empty dropdown`);
        }
      }
    }

    return warnings;
  }

  private validateExecution(
    workflowId: string,
    execute: ExecutionConfig | undefined,
    steps: UISchema['workflows'][number]['steps'],
    warnings: string[],
  ): ExecutionConfig {
    if (!execute) {
      throw new Error(`Workflow "${workflowId}" missing execute block`);
    }

    const hasShell = typeof execute.shellScript === 'string' && execute.shellScript.trim().length > 0;
    const hasArgv = typeof execute.executable === 'string' && execute.executable.trim().length > 0;
    const hasLegacy = typeof execute.command === 'string' && execute.command.trim().length > 0;

    if (!hasShell && !hasArgv && !hasLegacy) {
      throw new Error(`Workflow "${workflowId}" must define execute.executable, execute.shellScript, or legacy execute.command`);
    }

    if (hasShell && (hasArgv || (execute.args?.length ?? 0) > 0 || hasLegacy)) {
      throw new Error(`Workflow "${workflowId}" mixes shellScript with argv/command execution`);
    }

    if (!hasShell && !hasArgv && execute.args?.length) {
      throw new Error(`Workflow "${workflowId}" has execute.args without execute.executable`);
    }

    const normalized: ExecutionConfig = {
      ...execute,
      executable: execute.executable?.trim(),
      shellScript: execute.shellScript?.trim(),
      command: execute.command?.trim(),
    };

    if (hasShell) {
      if (DANGEROUS_SHELL_OPERATORS.test(normalized.shellScript!)) {
        warnings.push(`Workflow "${workflowId}": shellScript contains potentially dangerous shell constructs`);
      }

      const shellCapableSteps = steps.filter((step) => step.type === 'directory_input' || (step.type === 'file_input' && step.multiple));
      if (shellCapableSteps.length === 0) {
        warnings.push(`Workflow "${workflowId}": shellScript should only be used for workflows that iterate directories or multiple files`);
      }
    } else {
      const argvText = [normalized.executable, ...(normalized.args ?? []), normalized.command]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join(' ');
      if (argvText && DANGEROUS_ARGV_OPERATORS.test(argvText)) {
        warnings.push(`Workflow "${workflowId}": execution contains potentially dangerous shell constructs`);
      }
    }

    return normalized;
  }

  private executionText(execute: ExecutionConfig): string {
    if (execute.shellScript) return execute.shellScript;
    if (execute.executable) return [execute.executable, ...(execute.args ?? [])].join(' ');
    return execute.command ?? '';
  }

  private extractPlaceholders(execute: ExecutionConfig): string[] {
    return Array.from(this.executionText(execute).matchAll(/\{(\w+)\}/g), (match) => match[1]);
  }

  private repairExecutionPlaceholders(execute: ExecutionConfig, steps: UISchema['workflows'][number]['steps']): ExecutionConfig {
    const aliases = new Map<string, string[]>();

    for (const step of steps) {
      const normalizedId = this.normalizeStepToken(step.id);
      const existing = aliases.get(normalizedId) ?? [];
      aliases.set(normalizedId, [...existing, step.id]);
    }

    const replaceText = (text: string | undefined): string | undefined => {
      if (!text) return text;
      return text.replace(/\{(\w+)\}/g, (match, rawId) => {
        const matches = aliases.get(this.normalizeStepToken(rawId)) ?? [];
        return matches.length === 1 ? `{${matches[0]}}` : match;
      });
    };

    return {
      ...execute,
      shellScript: replaceText(execute.shellScript),
      command: replaceText(execute.command),
      args: execute.args?.map((arg) => replaceText(arg) ?? arg),
    };
  }

  private normalizeStepToken(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
}
