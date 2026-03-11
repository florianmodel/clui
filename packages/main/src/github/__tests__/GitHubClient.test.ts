import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubClient } from '../GitHubClient.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGitHubItem(overrides: Partial<{
  full_name: string;
  name: string;
  owner_login: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  topics: string[];
  pushed_at: string;
  license: string | null;
  html_url: string;
}> = {}) {
  return {
    full_name: overrides.full_name ?? 'acme/my-tool',
    name: overrides.name ?? 'my-tool',
    owner: { login: overrides.owner_login ?? 'acme' },
    description: overrides.description !== undefined ? overrides.description : 'A great tool',
    stargazers_count: overrides.stargazers_count ?? 42,
    language: overrides.language !== undefined ? overrides.language : 'Python',
    topics: overrides.topics ?? ['cli', 'tool'],
    pushed_at: overrides.pushed_at ?? '2024-06-01T12:00:00Z',
    license: overrides.license !== undefined ? { name: overrides.license } : null,
    html_url: overrides.html_url ?? 'https://github.com/acme/my-tool',
  };
}

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GitHubClient.search', () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = new GitHubClient();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns mapped SearchResult array on a successful response', async () => {
    mockFetch(200, { items: [makeGitHubItem()] });

    const res = await client.search('my-tool');

    expect(res.ok).toBe(true);
    expect(res.results).toHaveLength(1);
    expect(res.results![0]).toMatchObject({
      owner: 'acme',
      repo: 'my-tool',
      fullName: 'acme/my-tool',
      description: 'A great tool',
      stars: 42,
      language: 'Python',
      topics: ['cli', 'tool'],
      lastUpdated: '2024-06-01T12:00:00Z',
      htmlUrl: 'https://github.com/acme/my-tool',
    });
  });

  it('returns an empty array when the API returns no items', async () => {
    mockFetch(200, { items: [] });

    const res = await client.search('nothing-here');

    expect(res.ok).toBe(true);
    expect(res.results).toEqual([]);
  });

  it('maps multiple items correctly', async () => {
    mockFetch(200, {
      items: [
        makeGitHubItem({ name: 'tool-a', full_name: 'org/tool-a' }),
        makeGitHubItem({ name: 'tool-b', full_name: 'org/tool-b' }),
      ],
    });

    const res = await client.search('tool');

    expect(res.results).toHaveLength(2);
    expect(res.results![0].repo).toBe('tool-a');
    expect(res.results![1].repo).toBe('tool-b');
  });

  it('uses empty string for null description', async () => {
    mockFetch(200, { items: [makeGitHubItem({ description: null })] });

    const res = await client.search('tool');

    expect(res.results![0].description).toBe('');
  });

  it('uses "Unknown" for null language', async () => {
    mockFetch(200, { items: [makeGitHubItem({ language: null })] });

    const res = await client.search('tool');

    expect(res.results![0].language).toBe('Unknown');
  });

  it('includes license name when present', async () => {
    mockFetch(200, { items: [makeGitHubItem({ license: 'MIT License' })] });

    const res = await client.search('tool');

    expect(res.results![0].license).toBe('MIT License');
  });

  it('returns rateLimited: true on 403', async () => {
    mockFetch(403, { message: 'API rate limit exceeded' });

    const res = await client.search('tool');

    expect(res.ok).toBe(false);
    expect(res.rateLimited).toBe(true);
    expect(res.error).toContain('rate limit');
  });

  it('returns rateLimited: true on 429', async () => {
    mockFetch(429, { message: 'Too Many Requests' });

    const res = await client.search('tool');

    expect(res.ok).toBe(false);
    expect(res.rateLimited).toBe(true);
  });

  it('uses fallback message when 403 body has no message field', async () => {
    mockFetch(403, {});

    const res = await client.search('tool');

    expect(res.ok).toBe(false);
    expect(res.rateLimited).toBe(true);
    expect(res.error).toBe('Rate limit exceeded');
  });

  it('returns ok: false with error string on 5xx', async () => {
    mockFetch(500, {});

    const res = await client.search('tool');

    expect(res.ok).toBe(false);
    expect(res.rateLimited).toBeUndefined();
    expect(res.error).toContain('500');
  });

  it('returns ok: false when fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));

    const res = await client.search('tool');

    expect(res.ok).toBe(false);
    expect(res.error).toContain('Network failure');
  });
});
