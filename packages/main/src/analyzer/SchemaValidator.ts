import type { UISchema } from '@gui-bridge/shared';

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
      const stepIds = new Set(workflow.steps?.map(s => s.id) ?? []);
      const placeholders = workflow.execute.command.match(/\{(\w+)\}/g) ?? [];
      for (const placeholder of placeholders) {
        const id = placeholder.slice(1, -1);
        if (!stepIds.has(id)) {
          console.warn(`[SchemaValidator] Workflow "${workflow.id}" command references {${id}} but no step with that ID exists`);
        }
      }

      // Validate individual steps
      for (const step of workflow.steps ?? []) {
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
}
