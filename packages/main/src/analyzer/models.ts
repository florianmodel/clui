/**
 * LLM model names used across the app.
 * Update these to switch models globally.
 */
export const MODELS = {
  /** Main model for schema generation and refinement — fast and cost-effective. */
  anthropic: 'claude-haiku-4-5-20251001',

  /** OpenAI fallback model — matches Haiku tier in speed/cost. */
  openai: 'gpt-4o-mini',
} as const;

/** Token limits */
export const TOKEN_LIMITS = {
  /** Full schema generation / refinement. */
  schemaGeneration: 8192,
  /** Schema repair pass. */
  schemaRepair: 4096,
  /** Short diagnostic call (error classification). */
  diagnosis: 512,
  /** Command fix call. */
  commandFix: 1024,
} as const;
