import type { SearchResult } from '@gui-bridge/shared';

const GITHUB_API = 'https://api.github.com';
const HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'gui-bridge/1.0',
  'X-GitHub-Api-Version': '2022-11-28',
};

export class GitHubClient {
  /** Search GitHub repositories. Returns rate-limit info on 403. */
  async search(query: string): Promise<{
    ok: boolean;
    results?: SearchResult[];
    rateLimited?: boolean;
    error?: string;
  }> {
    const url = `${GITHUB_API}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=15`;

    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });

      if (res.status === 403 || res.status === 429) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        const msg = (body.message as string | undefined) ?? 'Rate limit exceeded';
        return { ok: false, rateLimited: true, error: msg };
      }

      if (!res.ok) {
        return { ok: false, error: `GitHub API error: ${res.status} ${res.statusText}` };
      }

      const data = await res.json() as {
        items: Array<{
          full_name: string;
          name: string;
          owner: { login: string };
          description: string | null;
          stargazers_count: number;
          language: string | null;
          topics: string[];
          pushed_at: string;
          license: { name: string } | null;
          html_url: string;
        }>;
      };

      const results: SearchResult[] = data.items.map((item) => ({
        owner: item.owner.login,
        repo: item.name,
        fullName: item.full_name,
        description: item.description ?? '',
        stars: item.stargazers_count,
        language: item.language ?? 'Unknown',
        topics: item.topics ?? [],
        lastUpdated: item.pushed_at,
        license: item.license?.name,
        htmlUrl: item.html_url,
      }));

      return { ok: true, results };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }
}
