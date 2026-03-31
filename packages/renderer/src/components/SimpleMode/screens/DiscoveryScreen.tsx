import { useState, useEffect } from 'react';
import {
  type ProjectMeta,
  findCuratedToolMatches,
  friendlyProjectName,
  getToolIconForRepo,
} from '@gui-bridge/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  intent: string;
  installedProjects: ProjectMeta[];
  onInstall: (owner: string, repo: string, name: string) => void;
  onOpenProject: (projectId: string) => void;
  onBack: () => void;
}

type State = 'loading' | 'results' | 'empty' | 'error';

// Unified result card data — local and LLM results share the same shape
interface ResultCard {
  owner: string;
  repo: string;
  icon: string;
  description: string;
  why: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DiscoveryScreen({ intent, installedProjects, onInstall, onOpenProject, onBack }: Props) {
  const [state, setState] = useState<State>('loading');
  const [results, setResults] = useState<ResultCard[]>([]);
  const [source, setSource] = useState<'local' | 'llm'>('local');
  const [error, setError] = useState('');
  const [installingId, setInstallingId] = useState<string | null>(null);

  useEffect(() => {
    void search();
  }, [intent]);

  async function search() {
    setState('loading');
    setResults([]);
    setError('');

    // 1. Try local curated list first — instant, no network
    const localMatches = findCuratedToolMatches(intent);
    if (localMatches.length > 0) {
      setResults(localMatches.map((t) => ({
        owner: t.owner,
        repo: t.repo,
        icon: t.icon,
        description: t.description,
        why: t.why,
      })));
      setSource('local');
      setState('results');
      return;
    }

    // 2. Fall back to LLM-powered GitHub recommendation
    try {
      const res = await window.electronAPI.github.recommend({ description: intent });
      if (!res.ok || !res.repos || res.repos.length === 0) {
        setState('empty');
        return;
      }
      setResults(res.repos.slice(0, 3).map((s) => ({
        owner: s.owner,
        repo: s.repo,
        icon: getToolIconForRepo(s.repo),
        description: s.description,
        why: s.why,
      })));
      setSource('llm');
      setState('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setState('error');
    }
  }

  function handleUse(card: ResultCard) {
    const projectId = `${card.owner}--${card.repo}`;
    const existing = installedProjects.find((p) => p.projectId === projectId);

    if (existing?.status === 'ready') {
      onOpenProject(projectId);
      return;
    }

    setInstallingId(projectId);
    onInstall(card.owner, card.repo, friendlyProjectName(card.repo));
  }

  return (
    <div style={styles.root}>
      <div style={styles.content}>
        {/* Back + intent display */}
        <div style={styles.topRow}>
          <button type="button" style={styles.backBtn} onClick={onBack}>← Back</button>
          <div style={styles.intentBubble}>"{intent}"</div>
        </div>

        {state === 'loading' && (
          <div style={styles.loadingBlock}>
            <div style={styles.loadingDots}>
              <span style={{ ...styles.dot, animationDelay: '0ms' }} />
              <span style={{ ...styles.dot, animationDelay: '200ms' }} />
              <span style={{ ...styles.dot, animationDelay: '400ms' }} />
            </div>
            <div style={styles.loadingText}>Finding the right tool for you…</div>
          </div>
        )}

        {state === 'results' && (
          <>
            <div style={styles.sectionTitle}>
              {source === 'llm' ? 'AI suggestion' : 'Best matches'}
            </div>
            <div style={styles.cards}>
              {results.map((card) => {
                const projectId = `${card.owner}--${card.repo}`;
                const existing = installedProjects.find((p) => p.projectId === projectId);
                const isInstalled = existing?.status === 'ready';
                const isInstalling = installingId === projectId;

                return (
                  <div key={projectId} style={styles.card}>
                    <div style={styles.cardHeader}>
                      <span style={styles.cardIcon}>{card.icon}</span>
                      <div style={styles.cardMeta}>
                        <div style={styles.cardName}>{friendlyProjectName(card.repo)}</div>
                        <div style={styles.cardSlug}>{card.owner}/{card.repo}</div>
                      </div>
                      {isInstalled && <span style={styles.installedBadge}>Installed</span>}
                    </div>
                    <div style={styles.cardDesc}>{card.description}</div>
                    {card.why && (
                      <div style={styles.cardWhy}>
                        <span style={styles.cardWhyIcon}>✓</span> {card.why}
                      </div>
                    )}
                    <button
                      type="button"
                      style={{ ...styles.useBtn, opacity: isInstalling ? 0.6 : 1 }}
                      onClick={() => handleUse(card)}
                      disabled={isInstalling}
                    >
                      {isInstalled ? 'Open →' : isInstalling ? 'Setting up…' : 'Use this tool →'}
                    </button>
                  </div>
                );
              })}
            </div>
            <button type="button" style={styles.tryAgainBtn} onClick={onBack}>
              Try different words
            </button>
          </>
        )}

        {state === 'empty' && (
          <div style={styles.emptyBlock}>
            <div style={styles.emptyIcon}>🔍</div>
            <div style={styles.emptyTitle}>No tools found for that</div>
            <div style={styles.emptyDesc}>
              Try describing what file type you're working with, like "compress MP4 video" or "resize PNG images".
            </div>
            <button type="button" style={styles.primaryBtn} onClick={onBack}>
              Try again
            </button>
          </div>
        )}

        {state === 'error' && (
          <div style={styles.emptyBlock}>
            <div style={styles.emptyIcon}>⚠️</div>
            <div style={styles.emptyTitle}>Something went wrong</div>
            <div style={styles.emptyDesc}>{error}</div>
            <div style={styles.btnRow}>
              <button type="button" style={styles.primaryBtn} onClick={() => void search()}>Retry</button>
              <button type="button" style={styles.secondaryBtn} onClick={onBack}>Go back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { flex: 1, display: 'flex', justifyContent: 'center', padding: '32px 24px' },
  content: { width: '100%', maxWidth: 540, display: 'flex', flexDirection: 'column', gap: 20 },
  topRow: { display: 'flex', alignItems: 'center', gap: 12 },
  backBtn: {
    background: 'transparent', border: 'none',
    color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', padding: '4px 0',
    fontFamily: 'inherit',
  },
  intentBubble: {
    flex: 1, padding: '6px 14px',
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20,
    fontSize: 13, color: 'var(--text)', fontStyle: 'italic',
  },
  loadingBlock: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginTop: 60 },
  loadingDots: { display: 'flex', gap: 8 },
  dot: {
    width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)',
    animation: 'bounce 1.2s infinite',
    display: 'inline-block',
  },
  loadingText: { fontSize: 14, color: 'var(--text-muted)' },
  sectionTitle: {
    fontSize: 13, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase' as const, letterSpacing: '0.06em',
  },
  cards: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    padding: '16px 18px', borderRadius: 12,
    border: '1px solid var(--border)', background: 'var(--surface)',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 10 },
  cardIcon: { fontSize: 24, flexShrink: 0 },
  cardMeta: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: 700, color: 'var(--text)' },
  cardSlug: { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  installedBadge: {
    fontSize: 10, fontWeight: 700, padding: '2px 8px',
    background: 'rgba(34,197,94,0.15)', color: 'var(--green)',
    borderRadius: 10, border: '1px solid rgba(34,197,94,0.2)',
  },
  cardDesc: { fontSize: 12, color: 'var(--text)', lineHeight: 1.5 },
  cardWhy: {
    display: 'flex', alignItems: 'flex-start', gap: 6,
    fontSize: 12, color: 'var(--text-muted)',
    background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px',
  },
  cardWhyIcon: { color: 'var(--green)', flexShrink: 0 },
  useBtn: {
    padding: '10px 16px', borderRadius: 8, border: 'none',
    background: 'var(--accent)', color: 'var(--bg)',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
    alignSelf: 'flex-start' as const,
    transition: 'opacity 0.15s',
    fontFamily: 'inherit',
  },
  tryAgainBtn: {
    background: 'transparent', border: 'none',
    color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
    textAlign: 'center' as const, textDecoration: 'underline',
    fontFamily: 'inherit',
  },
  emptyBlock: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
    marginTop: 60, textAlign: 'center' as const,
  },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: 'var(--text)' },
  emptyDesc: { fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 360 },
  primaryBtn: {
    padding: '10px 20px', borderRadius: 10, border: 'none',
    background: 'var(--accent)', color: 'var(--bg)',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  secondaryBtn: {
    padding: '10px 20px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'transparent',
    color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnRow: { display: 'flex', gap: 10 },
};
