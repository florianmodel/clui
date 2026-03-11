import type { UISchema, Step } from '@gui-bridge/shared';

export class SchemaValidator {
  /**
   * Parse LLM response text into a UISchema.
   * Handles common issues: markdown fences, leading/trailing text.
   */
  parse(response: string): UISchema {
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

    this.validate(schema);
    return schema;
  }

  /**
   * Validate schema structure and log warnings for common issues.
   * Throws on fatal structural errors.
   */
  validate(schema: UISchema): void {
    if (!schema.projectId) throw new Error('Missing projectId in generated schema');
    if (!schema.workflows?.length) throw new Error('No workflows in generated schema');

    for (const workflow of schema.workflows) {
      if (!workflow.id || !workflow.name) {
        throw new Error(`Workflow missing id or name: ${JSON.stringify(workflow)}`);
      }
      if (!workflow.execute?.command) {
        throw new Error(`Workflow "${workflow.id}" missing execute.command`);
      }

      // Check that all {placeholder}s in command reference existing step IDs
      const steps = workflow.steps ?? [];
      const stepIds = new Set(steps.map(s => s.id));
      const placeholders = workflow.execute.command.match(/\{(\w+)\}/g) ?? [];
      const badPlaceholders = placeholders.filter(p => !stepIds.has(p.slice(1, -1)));
      if (badPlaceholders.length > 0) {
        console.warn(`[SchemaValidator] Workflow "${workflow.id}": mismatched placeholders ${badPlaceholders.join(', ')} — rebuilding command`);
        workflow.execute.command = this.repairCommand(workflow.execute.command, steps);
      }

      // Warn about multi-file anti-patterns (LLM using /input/{step_id} for multiple steps)
      for (const step of steps) {
        if (step.type === 'file_input' && step.multiple) {
          if (workflow.execute.command.includes(`/input/{${step.id}}`)) {
            console.warn(`[SchemaValidator] Workflow "${workflow.id}" step "${step.id}" is multiple=true but command uses /input/{${step.id}} — this will produce IsADirectoryError at runtime. Regenerate UI to fix.`);
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
          console.warn(`[SchemaValidator] Step "${step.id}" is ${step.type} but has no options`);
        }
      }
    }
  }

  /**
   * Rebuild a command template using actual step IDs when the LLM used mismatched placeholder names.
   * Extracts the tool name from the existing command and reconstructs args from steps.
   */
  private repairCommand(command: string, steps: Step[]): string {
    // Extract the tool name (first word before any placeholder or flag)
    const toolMatch = command.match(/^([^\s{]+)/);
    const toolName = toolMatch ? toolMatch[1] : 'tool';

    const parts = [toolName];
    for (const step of steps) {
      const flagName = '--' + step.id.replace(/_/g, '-');
      if (step.type === 'file_input') {
        if (step.multiple) {
          // Multi-file: command must iterate /input/ directly — can't auto-repair loop structure
          console.warn(`[SchemaValidator] repairCommand: skipping multi-file step "${step.id}" — command needs manual regeneration`);
        } else {
          parts.push(`/input/{${step.id}}`);
        }
      } else if (step.type === 'toggle') {
        // Expands to --flag-name when true, stripped when false
        parts.push(`{${step.id}}`);
      } else if (/url|uri|link|source/i.test(step.id)) {
        // URL-like steps are positional
        parts.push(`{${step.id}}`);
      } else if (step.id === 'output_filename' || step.id === 'output_file' || step.id === 'output') {
        parts.push(`-o /output/{${step.id}}`);
      } else {
        parts.push(`${flagName} {${step.id}}`);
      }
    }
    const repaired = parts.join(' ');
    console.log(`[SchemaValidator] Repaired command: ${repaired}`);
    return repaired;
  }
}
