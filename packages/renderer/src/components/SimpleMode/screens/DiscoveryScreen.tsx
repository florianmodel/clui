import { useState, useEffect } from 'react';
import type { ProjectMeta, RepoSuggestion } from '@gui-bridge/shared';

interface Props {
  intent: string;
  installedProjects: ProjectMeta[];
  onInstall: (owner: string, repo: string, name: string) => void;
  onOpenProject: (projectId: string) => void;
  onBack: () => void;
}

type State = 'loading' | 'results' | 'empty' | 'error';

function getToolIcon(repo: string): string {
  const r = repo.toLowerCase();
  if (r.includes('ffmpeg') || r.includes('video')) return '🎬';
  if (r.includes('image') || r.includes('magick')) return '🖼️';
  if (r.includes('pdf')) return '📄';
  if (r.includes('audio') || r.includes('mp3')) return '🎵';
  if (r.includes('yt') || r.includes('youtube')) return '📺';
  if (r.includes('pandoc') || r.includes('doc')) return '📝';
  if (r.includes('zip') || r.includes('compress')) return '📦';
  return '⚙️';
}

function friendlyName(repo: string): string {
  return repo.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DiscoveryScreen({ intent, installedProjects, onInstall, onOpenProject, onBack }: Props) {
  const [state, setState] = useState<State>('loading');
  const [suggestions, setSuggestions] = useState<RepoSuggestion[]>([]);
  const [error, setError] = useState('');
  const [installingId, setInstallingId] = useState<string | null>(null);

  useEffect(() => {
    search();
  }, [intent]);

  async function search() {
    setState('loading');
    setSuggestions([]);
    setError('');

    try {
      const res = await window.electronAPI.github.recommend({ description: intent });
      if (!res.ok || !res.repos || res.repos.length === 0) {
        setState('empty');
        return;
      }
      setSuggestions(res.repos.slice(0, 3));
      setState('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setState('error');
    }
  }

  function handleUse(suggestion: RepoSuggestion) {
    const projectId = `${suggestion.owner}--${suggestion.repo}`;
    const existing = installedProjects.find((p) => p.projectId === projectId);

    if (existing?.status === 'ready') {
      onOpenProject(projectId);
      return;
    }

    setInstallingId(projectId);
    onInstall(suggestion.owner, suggestion.repo, friendlyName(suggestion.repo));
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
            <div style={styles.sectionTitle}>We found these tools</div>
            <div style={styles.cards}>
              {suggestions.map((s) => {
                const projectId = `${s.owner}--${s.repo}`;
                const existing = installedProjects.find((p) => p.projectId === projectId);
                const isInstalled = existing?.status === 'ready';
                const isInstalling = installingId === projectId;

                return (
                  <div key={projectId} style={styles.card}>
                    <div style={styles.cardHeader}>
                      <span style={styles.cardIcon}>{getToolIcon(s.repo)}</span>
                      <div style={styles.cardMeta}>
                        <div style={styles.cardName}>{friendlyName(s.repo)}</div>
                        <div style={styles.cardSlug}>{s.owner}/{s.repo}</div>
                      </div>
                      {isInstalled && <span style={styles.installedBadge}>Installed</span>}
                    </div>
                    <div style={styles.cardDesc}>{s.description}</div>
                    <div style={styles.cardWhy}>
                      <span style={styles.cardWhyIcon}>✓</span> {s.why}
                    </div>
                    <button
                      type="button"
                      style={{ ...styles.useBtn, opacity: isInstalling ? 0.6 : 1 }}
                      onClick={() => handleUse(s)}
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
              <button type="button" style={styles.primaryBtn} onClick={search}>Retry</button>
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
  sectionTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' },
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
  cardWhyIcon: { color: 'var(--green)', flexShrink: 0, marginTop: 0 },
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
