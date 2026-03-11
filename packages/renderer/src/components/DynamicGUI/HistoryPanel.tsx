import { useState, useEffect, useCallback } from 'react';
import type { RunRecord } from '@gui-bridge/shared';

interface Props {
  projectId: string;
  refreshKey?: number;
}

function formatAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

export function HistoryPanel({ projectId, refreshKey }: Props) {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<RunRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(() => {
    window.electronAPI.projects.getHistory({ projectId }).then((res) => {
      if (res.ok && res.records) setRecords(res.records);
    });
  }, [projectId]);

  useEffect(() => {
    if (open) load();
  }, [open, load, refreshKey]);

  async function handleClear() {
    await window.electronAPI.projects.clearHistory(projectId);
    setRecords([]);
  }

  return (
    <div style={styles.container}>
      <button type="button" style={styles.toggle} onClick={() => setOpen((o) => !o)}>
        <span style={styles.chevron}>{open ? '▾' : '▸'}</span>
        <span style={styles.toggleLabel}>Run History</span>
        {records.length > 0 && <span style={styles.badge}>{records.length}</span>}
      </button>

      {open && (
        <div style={styles.body}>
          {records.length === 0 ? (
            <span style={styles.empty}>No runs yet.</span>
          ) : (
            <>
              <div style={styles.listHeader}>
                <button type="button" style={styles.clearBtn} onClick={handleClear}>
                  Clear
                </button>
              </div>
              {records.map((r) => (
                <div key={r.id} style={styles.record}>
                  <button
                    type="button"
                    style={styles.recordBtn}
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  >
                    <span style={{ ...styles.statusIcon, color: r.success ? 'var(--green)' : 'var(--red)' }}>
                      {r.success ? '✓' : '✗'}
                    </span>
                    <span style={styles.recordName}>{r.workflowName}</span>
                    <span style={styles.recordMeta}>
                      {formatDuration(r.durationMs)}
                      {r.outputFiles.length > 0 && ` · ${r.outputFiles.length} file${r.outputFiles.length !== 1 ? 's' : ''}`}
                      {' · '}{formatAge(r.startedAt)}
                    </span>
                  </button>
                  {expandedId === r.id && (
                    <div style={styles.expanded}>
                      {r.error && <div style={styles.errorMsg}>{r.error}</div>}
                      {r.outputFiles.map((f) => (
                        <button
                          key={f}
                          type="button"
                          style={styles.fileLink}
                          onClick={() => window.electronAPI.files.showInFinder(f)}
                          title="Show in Finder"
                        >
                          {f.split('/').pop()}
                        </button>
                      ))}
                      {r.outputFiles.length === 0 && !r.error && (
                        <span style={styles.noFiles}>No output files.</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    borderTop: '1px solid var(--border)',
    marginTop: 8,
  },
  toggle: {
    display: 'flex', alignItems: 'center', gap: 6,
    width: '100%', background: 'none', border: 'none',
    color: 'var(--text-muted)', fontSize: 12, fontWeight: 600,
    padding: '10px 0', cursor: 'pointer',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  chevron: { fontSize: 10, color: 'var(--text-muted)' },
  toggleLabel: {},
  badge: {
    marginLeft: 'auto',
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 10, fontSize: 11, padding: '1px 7px', color: 'var(--text-muted)',
  },
  body: { display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 8 },
  empty: { fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' },
  listHeader: { display: 'flex', justifyContent: 'flex-end', marginBottom: 4 },
  clearBtn: {
    background: 'transparent', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text-muted)', fontSize: 11,
    padding: '2px 8px', cursor: 'pointer',
  },
  record: { display: 'flex', flexDirection: 'column' },
  recordBtn: {
    display: 'flex', alignItems: 'baseline', gap: 8,
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '5px 0', textAlign: 'left', width: '100%',
  },
  statusIcon: { fontSize: 12, flexShrink: 0, fontWeight: 700 },
  recordName: { fontSize: 13, color: 'var(--text)', fontWeight: 500 },
  recordMeta: { fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' },
  expanded: {
    display: 'flex', flexDirection: 'column', gap: 4,
    padding: '4px 0 6px 20px',
  },
  errorMsg: { fontSize: 12, color: 'var(--red)', fontStyle: 'italic' },
  fileLink: {
    background: 'transparent', border: 'none',
    color: 'var(--accent)', fontSize: 12, fontFamily: 'var(--font-mono)',
    cursor: 'pointer', textAlign: 'left', padding: 0,
    textDecoration: 'underline',
  },
  noFiles: { fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' },
};
