import { useState, useCallback, useRef } from 'react';
import type { SearchResult, ProjectMeta, RepoSuggestion } from '@gui-bridge/shared';
import { ResultCard } from './ResultCard.js';

const POPULAR_QUERIES = [
  'video converter', 'image resize', 'PDF merge',
  'code formatter', 'audio converter', 'file converter',
];

interface Props {
  installedProjects: ProjectMeta[];
  onInstall: (result: SearchResult) => void;
}

export function ProjectBrowser({ installedProjects, onInstall }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI recommendation state
  const [recommendQuery, setRecommendQuery] = useState('');
  const [recommending, setRecommending] = useState(false);
  const [recommendations, setRecommendations] = useState<RepoSuggestion[] | null>(null);
  const [recommendError, setRecommendError] = useState<string | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults(null);
      setError(null);
      setRateLimited(false);
      return;
    }

    setSearching(true);
    setError(null);
    setRateLimited(false);
    setRecommendations(null);

    const res = await window.electronAPI.github.search({ query: q });
    setSearching(false);

    if (res.rateLimited) {
      setRateLimited(true);
      setResults(null);
    } else if (!res.ok) {
      setError(res.error ?? 'Search failed');
      setResults(null);
    } else {
      setResults(res.results ?? []);
    }
  }, []);

  function handleInput(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 350);
  }

  function handleChip(q: string) {
    setQuery(q);
    doSearch(q);
  }

  async function handleRecommend() {
    if (!recommendQuery.trim()) return;
    setRecommending(true);
    setRecommendError(null);
    setRecommendations(null);
    setResults(null);
    setQuery('');

    const res = await window.electronAPI.github.recommend({ description: recommendQuery.trim() });
    setRecommending(false);

    if (!res.ok) {
      setRecommendError(res.error ?? 'Recommendation failed');
    } else {
      setRecommendations(res.repos ?? []);
    }
  }

  function suggestionToSearchResult(s: RepoSuggestion): SearchResult {
    return {
      fullName: `${s.owner}/${s.repo}`,
      owner: s.owner,
      repo: s.repo,
      description: s.description,
      stars: 0,
      language: '',
      topics: [],
      lastUpdated: new Date().toISOString(),
      htmlUrl: `https://github.com/${s.owner}/${s.repo}`,
    };
  }

  return (
    <div style={styles.container}>
      {/* GitHub search bar */}
      <div style={styles.searchBox}>
        <div style={styles.searchRow}>
          <span style={styles.searchIcon}>🔍</span>
          <input
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Search for CLI tools on GitHub…"
            style={styles.input}
            autoFocus
            onFocus={() => { if (recommendations) { setRecommendations(null); } }}
          />
          {searching && <span style={styles.spinner}>⏳</span>}
        </div>

        {/* Popular chips — shown when input is empty */}
        {!query && (
          <div style={styles.chips}>
            <span style={styles.chipsLabel}>Popular:</span>
            {POPULAR_QUERIES.map((q) => (
              <button key={q} type="button" style={styles.chip} onClick={() => handleChip(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* AI recommendation section */}
      <div style={styles.recommendBox}>
        <div style={styles.recommendLabel}>Or describe what you want:</div>
        <div style={styles.recommendRow}>
          <input
            type="text"
            value={recommendQuery}
            onChange={(e) => setRecommendQuery(e.target.value)}
            placeholder="e.g. merge PDFs, compress images, download videos…"
            style={styles.recommendInput}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRecommend(); }}
          />
          <button
            type="button"
            style={styles.recommendBtn}
            onClick={handleRecommend}
            disabled={recommending || !recommendQuery.trim()}
          >
            {recommending ? '…' : 'Find Tools'}
          </button>
        </div>
      </div>

      {/* Rate limit warning */}
      {rateLimited && (
        <div style={styles.rateLimitMsg}>
          ⚠️ GitHub search rate limit reached. Please wait a moment and try again.
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={styles.errorMsg}>{error}</div>
      )}

      {/* Recommendation error */}
      {recommendError && (
        <div style={styles.errorMsg}>{recommendError}</div>
      )}

      {/* AI Recommendations */}
      {recommendations !== null && (
        <div style={styles.results}>
          <div style={styles.resultsHeader}>
            AI suggestions for &ldquo;{recommendQuery}&rdquo;
          </div>
          {recommendations.length === 0 ? (
            <div style={styles.noResults}>No suggestions found.</div>
          ) : (
            <div style={styles.resultList}>
              {recommendations.map((s) => (
                <div key={`${s.owner}/${s.repo}`} style={styles.suggestionCard}>
                  <div style={styles.suggestionHeader}>
                    <span style={styles.suggestionName}>{s.owner}/{s.repo}</span>
                  </div>
                  <p style={styles.suggestionDesc}>{s.description}</p>
                  <p style={styles.suggestionWhy}>{s.why}</p>
                  <div style={styles.suggestionFooter}>
                    <button
                      type="button"
                      style={styles.installBtn}
                      onClick={() => onInstall(suggestionToSearchResult(s))}
                    >
                      Install
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* GitHub search results */}
      {results !== null && recommendations === null && (
        <div style={styles.results}>
          {results.length === 0 ? (
            <div style={styles.noResults}>No results found for &ldquo;{query}&rdquo;</div>
          ) : (
            <>
              <div style={styles.resultsHeader}>
                {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
              </div>
              <div style={styles.resultList}>
                {results.map((r) => (
                  <ResultCard
                    key={r.fullName}
                    result={r}
                    installedProject={installedProjects.find((p) => p.fullName === r.fullName)}
                    onInstall={onInstall}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Empty state */}
      {!query && results === null && recommendations === null && !recommendError && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>🔎</div>
          <div style={styles.emptyTitle}>Find any CLI tool on GitHub</div>
          <div style={styles.emptySubtitle}>
            Search for a tool and install it with one click.
            The app will clone it, build a Docker container, and generate a point-and-click interface.
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 16 },
  searchBox: {
    display: 'flex', flexDirection: 'column', gap: 10,
    padding: '12px 14px',
    background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 12,
  },
  searchRow: { display: 'flex', alignItems: 'center', gap: 10 },
  searchIcon: { fontSize: 16, flexShrink: 0 },
  input: {
    flex: 1, background: 'transparent',
    border: 'none', outline: 'none',
    fontSize: 14, color: 'var(--text)',
    fontFamily: 'inherit',
  },
  spinner: { fontSize: 14 },
  chips: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  chipsLabel: { fontSize: 11, color: 'var(--text-muted)' },
  chip: {
    fontSize: 11, padding: '3px 10px',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 20, color: 'var(--text-muted)',
    cursor: 'pointer',
  },

  // AI recommendation
  recommendBox: {
    display: 'flex', flexDirection: 'column', gap: 8,
    padding: '12px 14px',
    background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 12,
  },
  recommendLabel: { fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em' },
  recommendRow: { display: 'flex', gap: 8, alignItems: 'center' },
  recommendInput: {
    flex: 1, background: 'var(--surface-2)',
    border: '1px solid var(--border)', borderRadius: 8, outline: 'none',
    fontSize: 13, color: 'var(--text)', fontFamily: 'inherit',
    padding: '7px 12px',
  },
  recommendBtn: {
    border: 'none', borderRadius: 8,
    background: 'var(--accent)', color: 'var(--bg)',
    fontWeight: 700, fontSize: 13, padding: '7px 14px', cursor: 'pointer',
    flexShrink: 0,
  },

  results: { display: 'flex', flexDirection: 'column', gap: 10 },
  resultsHeader: { fontSize: 12, color: 'var(--text-muted)' },
  resultList: { display: 'flex', flexDirection: 'column', gap: 8 },
  noResults: {
    padding: 20, textAlign: 'center',
    fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic',
  },

  // Suggestion card (simpler than ResultCard)
  suggestionCard: {
    padding: '12px 14px',
    background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 10,
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  suggestionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  suggestionName: { fontSize: 14, fontWeight: 700, color: 'var(--text)' },
  suggestionDesc: { fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 },
  suggestionWhy: {
    fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5,
    fontStyle: 'italic',
  },
  suggestionFooter: { display: 'flex', justifyContent: 'flex-end', marginTop: 2 },
  installBtn: {
    border: 'none', borderRadius: 8,
    background: 'var(--accent)', color: 'var(--bg)',
    fontWeight: 700, fontSize: 13, padding: '6px 16px', cursor: 'pointer',
  },

  rateLimitMsg: {
    padding: '10px 14px', fontSize: 13,
    background: 'rgba(251, 191, 36, 0.08)',
    border: '1px solid rgba(251, 191, 36, 0.3)',
    borderRadius: 8, color: '#fbbf24',
  },
  errorMsg: {
    padding: '10px 14px', fontSize: 13,
    background: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 8, color: 'var(--red)',
  },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    padding: '40px 20px', textAlign: 'center',
  },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: 700, color: 'var(--text)' },
  emptySubtitle: {
    fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 400,
  },
};
