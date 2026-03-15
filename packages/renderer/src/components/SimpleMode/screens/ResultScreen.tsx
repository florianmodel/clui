import { useState, useEffect } from 'react';
import type { ExecLogEvent, FileInfo } from '@gui-bridge/shared';

interface Props {
  outputFiles: string[];
  logs: ExecLogEvent[];
  onRunAgain: () => void;
  onNewTask: () => void;
}

export function ResultScreen({ outputFiles, logs, onRunAgain, onNewTask }: Props) {
  const [fileInfos, setFileInfos] = useState<Map<string, FileInfo>>(new Map());
  const [showLogs, setShowLogs] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  useEffect(() => {
    // Load info for each output file
    for (const filePath of outputFiles) {
      window.electronAPI.files.getInfo({ filePath }).then((res) => {
        if (res.ok && res.info) {
          setFileInfos((prev) => new Map(prev).set(filePath, res.info!));
        }
      });
    }
  }, [outputFiles]);

  async function openFile(filePath: string) {
    await window.electronAPI.files.open(filePath);
  }

  async function showInFinder(filePath: string) {
    await window.electronAPI.files.showInFinder(filePath);
  }

  async function copyPath(filePath: string) {
    await window.electronAPI.clipboard.write(filePath);
    setCopiedPath(filePath);
    setTimeout(() => setCopiedPath(null), 1500);
  }

  const hasFiles = outputFiles.length > 0;

  return (
    <div style={styles.root}>
      <div style={styles.content}>
        {/* Success header */}
        <div style={styles.successHeader}>
          <div style={styles.successIcon}>✓</div>
          <div>
            <div style={styles.successTitle}>Done!</div>
            <div style={styles.successSub}>
              {hasFiles ? `${outputFiles.length} file${outputFiles.length > 1 ? 's' : ''} ready` : 'Completed successfully'}
            </div>
          </div>
        </div>

        {/* Output files */}
        {hasFiles && (
          <div style={styles.filesSection}>
            <div style={styles.sectionLabel}>Output files</div>
            <div style={styles.filesList}>
              {outputFiles.map((filePath) => {
                const info = fileInfos.get(filePath);
                const name = filePath.split('/').pop() ?? filePath;

                return (
                  <div key={filePath} style={styles.fileCard}>
                    {/* Preview */}
                    {info?.previewable && (
                      <img
                        src={`file://${filePath}`}
                        alt={name}
                        style={styles.preview}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    {info?.type === 'video' && (
                      <div style={styles.videoPreview}>
                        <span style={styles.videoIcon}>🎬</span>
                      </div>
                    )}
                    {info?.type === 'audio' && (
                      <div style={styles.videoPreview}>
                        <span style={styles.videoIcon}>🎵</span>
                      </div>
                    )}

                    <div style={styles.fileInfo}>
                      <div style={styles.fileName}>{name}</div>
                      {info && (
                        <div style={styles.fileMeta}>
                          {info.sizeLabel}
                          {info.extension && ` · ${info.extension.toUpperCase()}`}
                        </div>
                      )}
                    </div>

                    <div style={styles.fileActions}>
                      <button type="button" style={styles.actionBtn} onClick={() => openFile(filePath)} title="Open file">
                        Open
                      </button>
                      <button type="button" style={styles.actionBtn} onClick={() => showInFinder(filePath)} title="Show in Finder">
                        Show
                      </button>
                      <button
                        type="button"
                        style={{ ...styles.actionBtn, color: copiedPath === filePath ? 'var(--green)' : 'var(--text-muted)' }}
                        onClick={() => copyPath(filePath)}
                        title="Copy path"
                      >
                        {copiedPath === filePath ? '✓' : 'Copy'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={styles.actions}>
          <button type="button" style={styles.runAgainBtn} onClick={onRunAgain}>
            Run again
          </button>
          <button type="button" style={styles.newTaskBtn} onClick={onNewTask}>
            New task
          </button>
        </div>

        {/* Logs toggle */}
        <button type="button" style={styles.logsToggle} onClick={() => setShowLogs((v) => !v)}>
          {showLogs ? 'Hide' : 'Show'} logs ({logs.length})
        </button>

        {showLogs && (
          <div style={styles.logsPanel}>
            {logs.map((log, i) => (
              <div key={i} style={{ ...styles.logLine, color: log.stream === 'stderr' ? 'var(--red)' : 'var(--text)' }}>
                {log.line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { flex: 1, display: 'flex', justifyContent: 'center', padding: '32px 24px' },
  content: { width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 24 },
  successHeader: {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '20px 24px', borderRadius: 14,
    background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
  },
  successIcon: {
    width: 44, height: 44, borderRadius: '50%',
    background: 'rgba(34,197,94,0.15)', border: '2px solid rgba(34,197,94,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, color: 'var(--green)', flexShrink: 0,
  },
  successTitle: { fontSize: 20, fontWeight: 700, color: 'var(--text)' },
  successSub: { fontSize: 13, color: 'var(--text-muted)', marginTop: 2 },
  filesSection: { display: 'flex', flexDirection: 'column', gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' },
  filesList: { display: 'flex', flexDirection: 'column', gap: 8 },
  fileCard: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 14px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--surface)',
  },
  preview: { width: 44, height: 44, borderRadius: 6, objectFit: 'cover' as const, flexShrink: 0 },
  videoPreview: {
    width: 44, height: 44, borderRadius: 6, flexShrink: 0,
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  videoIcon: { fontSize: 20 },
  fileInfo: { flex: 1, minWidth: 0 },
  fileName: { fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  fileMeta: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
  fileActions: { display: 'flex', gap: 4 },
  actionBtn: {
    background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
    color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', padding: '3px 8px',
    fontFamily: 'inherit',
  },
  actions: { display: 'flex', gap: 10 },
  runAgainBtn: {
    flex: 1, padding: '12px 20px', borderRadius: 10, border: 'none',
    background: 'var(--accent)', color: 'var(--bg)',
    fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  newTaskBtn: {
    flex: 1, padding: '12px 20px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'transparent',
    color: 'var(--text)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
  logsToggle: {
    background: 'transparent', border: 'none',
    color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
    textDecoration: 'underline', fontFamily: 'inherit',
    alignSelf: 'center' as const,
  },
  logsPanel: {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '10px 12px', maxHeight: 200, overflowY: 'auto' as const,
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  logLine: { fontSize: 11, fontFamily: 'var(--font-mono)', lineHeight: 1.5, whiteSpace: 'pre-wrap' as const },
};
