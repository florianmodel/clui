import type { CapabilityDump, UISchema } from '@gui-bridge/shared';
import { buildSchemaGenerationPrompt, buildRefinementPrompt } from './prompts/generate-schema.js';
import { SchemaValidator } from './SchemaValidator.js';
import type { ILLMClient } from './LLMClient.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';
const MAX_TOKENS = 8192;

/** OpenAI-compatible LLM client using gpt-4o-mini. */
export class OpenAIClient implements ILLMClient {
  private apiKey: string;
  private validator = new SchemaValidator();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateUISchema(dump: CapabilityDump, dockerImage: string): Promise<UISchema> {
    const text = await this.complete(buildSchemaGenerationPrompt(dump, dockerImage));
    return this.validator.parse(text);
  }

  async refineUISchema(
    currentSchema: UISchema,
    dump: CapabilityDump,
    dockerImage: string,
    feedback?: string,
  ): Promise<UISchema> {
    const text = await this.complete(buildRefinementPrompt(currentSchema, dump, feedback));
    const refined = this.validator.parse(text);
    refined.dockerImage = dockerImage;
    return refined;
  }

  async rawComplete(prompt: string): Promise<string> {
    return this.complete(prompt, 256);
  }

  private async complete(content: string, maxTokens = MAX_TOKENS): Promise<string> {
    const res = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI API error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content ?? '';
  }

  static async validateKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        return { ok: false, error: body?.error?.message ?? `HTTP ${res.status}` };
      }
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
