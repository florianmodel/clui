import type { UISchema } from '@gui-bridge/shared';

const REGISTRY_BASE = 'https://raw.githubusercontent.com/florianmodel/clui-registry/main';

/** How long to wait for the registry before giving up and falling through to LLM generation. */
const FETCH_TIMEOUT_MS = 2_000;

export interface RegistryHit {
  /** The validated UISchema, with _registryMeta stripped. */
  schema: UISchema;
  /** The commit SHA the schema was generated from (from _registryMeta). */
  commitSha: string;
}

/**
 * Read-only client for the CLUI community template registry.
 * Fetches pre-generated UISchemas from a public GitHub repo so users can skip
 * LLM generation for tools that have already been catalogued.
 *
 * All failures are silent — the caller always falls through to normal LLM generation
 * if the registry is unreachable, returns an unknown project, or returns invalid JSON.
 *
 * See REGISTRY.md in the project root for how to add schemas to the registry.
 */
export class TemplateRegistry {
  /**
   * Look up a pre-generated schema for the given GitHub owner/repo.
   * Returns null if not found, offline, or on any error.
   * Completes in ≤ FETCH_TIMEOUT_MS regardless of network conditions.
   */
  async lookup(owner: string, repo: string): Promise<RegistryHit | null> {
    const url = `${REGISTRY_BASE}/schemas/${owner}--${repo}/latest.json`;

    let raw: unknown;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) return null; // 404 = not in registry yet
      raw = await response.json();
    } catch {
      // Network error, timeout, JSON parse failure — all silent
      return null;
    }

    if (!this.isValidRegistryFile(raw)) return null;

    // Extract _registryMeta then strip it from the schema
    const file = raw as Record<string, unknown>;
    const meta = file['_registryMeta'] as Record<string, unknown>;
    const commitSha = typeof meta['commitSha'] === 'string' ? meta['commitSha'] : '';

    // Build a clean UISchema without _registryMeta
    const { _registryMeta: _stripped, ...schema } = file;
    void _stripped; // explicitly unused

    return { schema: schema as unknown as UISchema, commitSha };
  }

  /** Structural validation — ensures the file is a usable UISchema with _registryMeta. */
  private isValidRegistryFile(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const obj = data as Record<string, unknown>;

    // Must have _registryMeta with a commitSha
    if (!obj['_registryMeta'] || typeof obj['_registryMeta'] !== 'object') return false;
    const meta = obj['_registryMeta'] as Record<string, unknown>;
    if (typeof meta['commitSha'] !== 'string' || !meta['commitSha']) return false;

    // Must have the core UISchema fields
    if (typeof obj['projectId'] !== 'string') return false;
    if (typeof obj['dockerImage'] !== 'string') return false;
    if (!Array.isArray(obj['workflows']) || obj['workflows'].length === 0) return false;

    return true;
  }
}
