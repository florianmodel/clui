import Anthropic from '@anthropic-ai/sdk';
import type { CapabilityDump, ExecutionConfig, UISchema } from '@gui-bridge/shared';
import { buildSchemaGenerationPrompt, buildRefinementPrompt, buildRepairPrompt } from './prompts/generate-schema.js';
import { SchemaValidator } from './SchemaValidator.js';
import { MODELS, TOKEN_LIMITS } from './models.js';

export interface ILLMClient {
  generateUISchema(dump: CapabilityDump, dockerImage: string): Promise<{ schema: UISchema; warnings: string[] }>;
  refineUISchema(
    currentSchema: UISchema,
    dump: CapabilityDump,
    dockerImage: string,
    feedback?: string,
  ): Promise<UISchema>;
}

/** Real Claude API client. */
export class LLMClient implements ILLMClient {
  private client: Anthropic;
  private validator = new SchemaValidator();
  private static readonly MODEL = MODELS.anthropic;
  private static readonly MAX_TOKENS = TOKEN_LIMITS.schemaGeneration;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateUISchema(dump: CapabilityDump, dockerImage: string): Promise<{ schema: UISchema; warnings: string[] }> {
    const userPrompt = buildSchemaGenerationPrompt(dump, dockerImage);

    // Turn 1: generate initial schema
    const response = await this.client.messages.create({
      model: LLMClient.MODEL,
      max_tokens: LLMClient.MAX_TOKENS,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const turn1Text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    const { schema, warnings } = this.validator.parseWithWarnings(turn1Text);

    // Turn 2: if validator found fixable issues, ask LLM to repair them
    const repairableWarnings = warnings.filter(w =>
      w.includes('placeholder mismatch') || w.includes('multi-file input'),
    );

    if (repairableWarnings.length > 0) {
      try {
        const repairPrompt = buildRepairPrompt(turn1Text, repairableWarnings);
        const repairResponse = await this.client.messages.create({
          model: LLMClient.MODEL,
          max_tokens: TOKEN_LIMITS.schemaRepair,
          messages: [
            { role: 'user', content: userPrompt },
            { role: 'assistant', content: turn1Text },
            { role: 'user', content: repairPrompt },
          ],
        });

        const turn2Text = repairResponse.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map(block => block.text)
          .join('');

        const { schema: repairedSchema, warnings: remainingWarnings } = this.validator.parseWithWarnings(turn2Text);
        repairedSchema.dockerImage = dockerImage;
        return { schema: repairedSchema, warnings: remainingWarnings };
      } catch {
        // If repair fails, return the original schema with warnings
        schema.dockerImage = dockerImage;
        return { schema, warnings };
      }
    }

    schema.dockerImage = dockerImage;
    return { schema, warnings };
  }

  async refineUISchema(
    currentSchema: UISchema,
    dump: CapabilityDump,
    dockerImage: string,
    feedback?: string,
  ): Promise<UISchema> {
    const response = await this.client.messages.create({
      model: LLMClient.MODEL,
      max_tokens: LLMClient.MAX_TOKENS,
      messages: [{ role: 'user', content: buildRefinementPrompt(currentSchema, dump, feedback) }],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    const { schema: refined, warnings } = this.validator.parseWithWarnings(text);
    if (warnings.length > 0) {
      throw new Error(`Refined schema is invalid: ${warnings.join('; ')}`);
    }
    // Ensure dockerImage is preserved
    refined.dockerImage = dockerImage;
    return refined;
  }

  /**
   * Send a raw prompt and return the response text as-is.
   * Used for autofix (returns simple JSON, not a UISchema).
   */
  async rawComplete(prompt: string, maxTokens?: number): Promise<string> {
    const response = await this.client.messages.create({
      model: LLMClient.MODEL,
      max_tokens: maxTokens ?? TOKEN_LIMITS.commandFix,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }

  /** Validate the API key by making a minimal API call. */
  static async validateKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const client = new Anthropic({ apiKey });
      await client.messages.create({
        model: LLMClient.MODEL,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      });
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }
}

/** Mock LLM client that returns a basic schema without calling the API. */
export class MockLLMClient implements ILLMClient {
  async generateUISchema(dump: CapabilityDump, dockerImage: string): Promise<{ schema: UISchema; warnings: string[] }> {
    // Simulate a short delay
    await new Promise(resolve => setTimeout(resolve, 800));

    const toolName = this.getToolName(dump);
    const projectId = toolName.toLowerCase().replace(/[_\s]/g, '-');

    // Build a simple schema from the first few required args
    const steps = this.buildSteps(dump);

    const schema: UISchema = {
      projectId,
      projectName: toolName,
      description: dump.readme.description ?? `Run ${toolName} with a friendly interface.`,
      version: '1.0.0',
      dockerImage,
      workflows: [
        {
          id: 'run',
          name: 'Run',
          description: `Run ${toolName} with default settings.`,
          guidance:
            'Fill in the fields below, then click Run. Output files will appear in the results panel.',
          steps,
          execute: {
            ...this.buildExecution(dump, steps),
            outputDir: '/output',
            outputPattern: undefined,
            successMessage: `${toolName} completed successfully.`,
          },
        },
      ],
    };
    return { schema, warnings: [] };
  }

  async refineUISchema(
    currentSchema: UISchema,
    dump: CapabilityDump,
    dockerImage: string,
    _feedback?: string, // intentionally ignored in mock mode — always regenerates from scratch
  ): Promise<UISchema> {
    // Mock: just regenerate
    const { schema } = await this.generateUISchema(dump, dockerImage);
    return schema;
  }

  private getToolName(dump: CapabilityDump): string {
    if (dump.stack.entrypoint) {
      const base = dump.stack.entrypoint.includes(':')
        ? dump.stack.entrypoint.split(':')[0]
        : dump.stack.entrypoint;
      return base.split('/').pop() ?? base;
    }
    return dump.dockerImage.split('/').pop()?.split(':')[0] ?? 'Tool';
  }

  private buildSteps(dump: CapabilityDump) {
    const args = [
      ...dump.arguments.filter(a => a.required),
      ...dump.arguments.filter(a => !a.required),
    ].slice(0, 5);

    return args.map(arg => {
      const id = arg.name.replace(/^-+/, '').replace(/-/g, '_');
      const label = id
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());

      const base = {
        id,
        label,
        description: arg.description ?? undefined,
        required: arg.required,
        default: arg.default as string | number | boolean | undefined,
      };

      if (arg.type === 'int' || arg.type === 'float') {
        return { ...base, type: 'number' as const };
      }
      if (arg.type === 'bool') {
        return { ...base, type: 'toggle' as const };
      }
      if (arg.type === 'file') {
        return { ...base, type: 'file_input' as const };
      }
      if (arg.type === 'directory') {
        return { ...base, type: 'directory_input' as const };
      }
      if (arg.type === 'choice' && arg.choices?.length) {
        return {
          ...base,
          type: 'dropdown' as const,
          options: arg.choices.map(c => ({ value: c, label: c })),
        };
      }
      return { ...base, type: 'text_input' as const };
    });
  }

  private buildExecution(
    dump: CapabilityDump,
    steps: ReturnType<MockLLMClient['buildSteps']>,
  ): Pick<ExecutionConfig, 'executable' | 'args'> {
    const toolCmd = dump.stack.entrypoint?.includes(':')
      ? dump.stack.entrypoint.split(':')[0]
      : (dump.stack.entrypoint ?? dump.dockerImage.split('/').pop()?.split(':')[0] ?? 'run');

    const args: string[] = [];
    for (const step of steps) {
      if (step.type === 'file_input') {
        args.push(`/input/${step.id}/{${step.id}}`);
      } else if (step.type === 'directory_input') {
        args.push(`/input/${step.id}`);
      } else if (step.type === 'toggle') {
        args.push(`{${step.id}}`);
      } else {
        args.push(`--${step.id.replace(/_/g, '-')}`, `{${step.id}}`);
      }
    }
    return { executable: toolCmd, args };
  }
}
