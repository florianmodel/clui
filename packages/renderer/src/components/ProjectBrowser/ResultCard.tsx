import type { SearchResult, ProjectMeta } from '@gui-bridge/shared';

interface Props {
  result: SearchResult;
  installedProject?: ProjectMeta;
  onInstall: (result: SearchResult) => void;
}

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  if (months < 12) return `${months} months ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function ResultCard({ result, installedProject, onInstall }: Props) {
  const installed = !!installedProject;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.meta}>
          <span style={styles.fullName}>{result.fullName}</span>
          {result.language && result.language !== 'Unknown' && (
            <span style={styles.langBadge}>{result.language}</span>
          )}
        </div>
        <div style={styles.stars}>
          <span style={styles.starIcon}>⭐</span>
          <span style={styles.starCount}>{formatStars(result.stars)}</span>
        </div>
      </div>

      {result.description && (
        <p style={styles.description}>{result.description}</p>
      )}

      <div style={styles.footer}>
        <span style={styles.updated}>Updated {timeAgo(result.lastUpdated)}</span>

        {installed ? (
          <span style={styles.installedBadge}>✓ Installed</span>
        ) : (
          <button
            type="button"
            style={styles.installBtn}
            onClick={() => onInstall(result)}
          >
            Install
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    padding: '14px 16px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  meta: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 },
  fullName: { fontSize: 14, fontWeight: 700, color: 'var(--text)' },
  langBadge: {
    fontSize: 11, padding: '2px 8px',
    background: 'var(--surface-2)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 20, color: 'var(--text)',
  },
  stars: { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 },
  starIcon: { fontSize: 12 },
  starCount: { fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' },
  description: { fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  updated: { fontSize: 11, color: 'var(--text-muted)' },
  installBtn: {
    border: 'none', borderRadius: 8,
    background: 'var(--accent)', color: 'var(--bg)',
    fontWeight: 700, fontSize: 13, padding: '6px 16px', cursor: 'pointer',
  },
  installedBadge: {
    fontSize: 12, fontWeight: 600, color: 'var(--green)',
    padding: '4px 10px',
    background: 'rgba(52, 211, 153, 0.08)',
    border: '1px solid rgba(52, 211, 153, 0.3)',
    borderRadius: 8,
  },
};
