import { useState, useCallback, useRef } from 'react';
import type { SearchResult, ProjectMeta } from '@gui-bridge/shared';
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

  return (
    <div style={styles.container}>
      {/* Search bar */}
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

      {/* Results */}
      {results !== null && (
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
      {!query && results === null && (
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
  results: { display: 'flex', flexDirection: 'column', gap: 10 },
  resultsHeader: { fontSize: 12, color: 'var(--text-muted)' },
  resultList: { display: 'flex', flexDirection: 'column', gap: 8 },
  noResults: {
    padding: 20, textAlign: 'center',
    fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic',
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
