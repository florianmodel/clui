import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  FolderAction,
  FolderContext,
  FolderRunState,
  FolderRunLogEvent,
  FolderRunCompleteEvent,
  FolderRunUrlEvent,
} from '@gui-bridge/shared';
import { friendlyProjectName } from '@gui-bridge/shared';

interface Props {
  folderPath: string;
  onBack: () => void;
  onOpenProject: (projectId: string) => void;
  onInstall: (owner: string, repo: string, name: string) => void;
}

function kindIcon(kind: FolderContext['kind']): string {
  if (kind === 'node') return '🟢';
  if (kind === 'python') return '🐍';
  if (kind === 'rust') return '🦀';
  if (kind === 'media-heavy') return '🗂';
  if (kind === 'mixed') return '🧩';
  return '📁';
}

export function FinderFolderScreen({ folderPath, onBack, onOpenProject, onInstall }: Props) {
  const [context, setContext] = useState<FolderContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [logs, setLogs] = useState<FolderRunLogEvent[]>([]);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [runState, setRunState] = useState<FolderRunState>({ status: 'idle', detectedUrls: [] });
  const [currentActionLabel, setCurrentActionLabel] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const runIdRef = useRef<string | undefined>(undefined);

  async function loadContext() {
    setLoading(true);
    setError(null);
    const result = await window.electronAPI.folder.scan({ folderPath });
    if (!result.ok || !result.context) {
      setContext(null);
      setError(result.error ?? 'Failed to scan folder');
      setLoading(false);
      return;
    }
    setContext(result.context);
    setLoading(false);
  }

  useEffect(() => {
    void loadContext();
  }, [folderPath]);

  useEffect(() => {
    const cleanupLog = window.electronAPI.on.folderRunLog((event: FolderRunLogEvent) => {
      if (!runIdRef.current || event.runId !== runIdRef.current) return;
      setLogs((prev) => [...prev, event]);
    });
    const cleanupUrl = window.electronAPI.on.folderRunUrl((event: FolderRunUrlEvent) => {
      if (!runIdRef.current || event.runId !== runIdRef.current) return;
      setRunState((prev) => ({
        ...prev,
        detectedUrls: prev.detectedUrls.includes(event.url) ? prev.detectedUrls : [...prev.detectedUrls, event.url],
      }));
    });
    const cleanupComplete = window.electronAPI.on.folderRunComplete((event: FolderRunCompleteEvent) => {
      if (!runIdRef.current || event.runId !== runIdRef.current) return;
      runIdRef.current = undefined;
      setRunState((prev) => ({
        ...prev,
        status: event.canceled ? 'stopped' : event.exitCode === 0 ? 'success' : 'error',
      }));
      setRunMessage(event.canceled
        ? 'Stopped'
        : event.exitCode === 0
          ? 'Finished successfully'
          : (event.error ?? `Exited with code ${event.exitCode}`));
      void loadContext();
    });

    return () => {
      cleanupLog();
      cleanupUrl();
      cleanupComplete();
      if (runIdRef.current) {
        void window.electronAPI.folder.cancel();
      }
    };
  }, [folderPath]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs]);

  const primaryAction = useMemo(() => {
    if (!context) return null;
    return context.actions.find((action) => action.id === context.primaryActionId) ?? context.actions[0] ?? null;
  }, [context]);

  const moreActions = useMemo(() => {
    if (!context || !primaryAction) return [];
    return context.actions.filter((action) => action.id !== primaryAction.id);
  }, [context, primaryAction]);

  async function handleAction(action: FolderAction) {
    setShowMore(false);

    if (action.type === 'open-project' && action.projectId) {
      onOpenProject(action.projectId);
      return;
    }

    if (action.type === 'install-project' && action.owner && action.repo) {
      onInstall(action.owner, action.repo, friendlyProjectName(action.repo));
      return;
    }

    if (action.confirm) {
      const res = await window.electronAPI.dialog.confirm(action.confirm);
      if (!res.confirmed) return;
    }

    setLogs([]);
    setRunMessage(null);
    setCurrentActionLabel(action.label);
    setRunState({ status: 'running', actionId: action.id, detectedUrls: [] });

    const result = await window.electronAPI.folder.run({ folderPath, actionId: action.id });
    if (!result.ok || !result.runId) {
      setRunState({ status: 'error', actionId: action.id, detectedUrls: [] });
      setRunMessage(result.error ?? 'Failed to start');
      return;
    }

    runIdRef.current = result.runId;
  }

  async function handleStop() {
    await window.electronAPI.folder.cancel();
  }

  async function openUrl(url: string) {
    await window.electronAPI.app.openExternal(url);
  }

  if (loading) {
    return (
      <div style={styles.root}>
        <div style={styles.loadingCard}>Looking at this folder…</div>
      </div>
    );
  }

  if (error || !context) {
    return (
      <div style={styles.root}>
        <div style={styles.errorCard}>
          <div style={styles.errorTitle}>Couldn&apos;t read this folder</div>
          <div style={styles.errorText}>{error ?? 'Unknown error'}</div>
          <button type="button" style={styles.secondaryBtn} onClick={onBack}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <div style={styles.content}>
        <div style={styles.topRow}>
          <button type="button" style={styles.secondaryBtn} onClick={onBack}>
            ← Change folder
          </button>
          <button type="button" style={styles.ghostBtn} onClick={() => void loadContext()}>
            Refresh
          </button>
        </div>

        <div style={styles.pathCard}>
          <div style={styles.pathMeta}>
            <div style={styles.pathBadge}>{kindIcon(context.kind)} {context.kind.replace('-', ' ')}</div>
            <div style={styles.folderName}>{context.folderName}</div>
            <div style={styles.folderPath}>{context.folderPath}</div>
          </div>
        </div>

        <div style={styles.summaryCard}>
          <div style={styles.summaryTitle}>What CLUI sees</div>
          <div style={styles.summaryText}>{context.summary}</div>
          {context.details && <div style={styles.summaryDetail}>{context.details}</div>}
        </div>

        {primaryAction ? (
          <div style={styles.actionCard}>
            <div style={styles.actionHeader}>
              <div>
                <div style={styles.actionLabel}>Main action</div>
                <div style={styles.actionTitle}>{primaryAction.label}</div>
                <div style={styles.actionDescription}>{primaryAction.description}</div>
              </div>
              <div style={styles.actionButtons}>
                <button type="button" style={styles.primaryBtn} onClick={() => void handleAction(primaryAction)}>
                  {primaryAction.label}
                </button>
                {moreActions.length > 0 && (
                  <div style={styles.moreWrap}>
                    <button type="button" style={styles.secondaryBtn} onClick={() => setShowMore((prev) => !prev)}>
                      More actions ▾
                    </button>
                    {showMore && (
                      <div style={styles.menu}>
                        {moreActions.map((action) => (
                          <button
                            key={action.id}
                            type="button"
                            style={styles.menuItem}
                            onClick={() => void handleAction(action)}
                          >
                            <div style={styles.menuItemTitle}>{action.label}</div>
                            <div style={styles.menuItemDesc}>{action.description}</div>
                            {action.commandPreview && <div style={styles.menuItemCmd}>{action.commandPreview}</div>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {primaryAction.commandPreview ? (
              <div style={styles.commandBox}>
                <div style={styles.commandLabel}>Command preview</div>
                <code style={styles.commandText}>{primaryAction.commandPreview}</code>
              </div>
            ) : (
              <div style={styles.commandHint}>
                This action opens or installs a matching tool instead of running a direct command in this folder.
              </div>
            )}
          </div>
        ) : (
          <div style={styles.summaryCard}>
            <div style={styles.summaryTitle}>No direct action yet</div>
            <div style={styles.summaryText}>CLUI does not have a high-confidence action for this folder yet.</div>
          </div>
        )}

        {(runState.status !== 'idle' || logs.length > 0 || runMessage || runState.detectedUrls.length > 0) && (
          <div style={styles.runCard}>
            <div style={styles.runHeader}>
              <div>
                <div style={styles.runTitle}>
                  {currentActionLabel ?? 'Action'}
                  {runState.status === 'running' ? ' is running…' : ''}
                </div>
                {runMessage && <div style={styles.runMessage}>{runMessage}</div>}
              </div>
              {runState.status === 'running' && (
                <button type="button" style={styles.stopBtn} onClick={handleStop}>
                  Stop
                </button>
              )}
            </div>

            {runState.detectedUrls.length > 0 && (
              <div style={styles.urlPanel}>
                <div style={styles.urlTitle}>Detected local app</div>
                {runState.detectedUrls.map((url) => (
                  <div key={url} style={styles.urlRow}>
                    <code style={styles.urlText}>{url}</code>
                    <button type="button" style={styles.openUrlBtn} onClick={() => void openUrl(url)}>
                      Open
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div ref={scrollRef} style={styles.logPanel}>
              {logs.length === 0 ? (
                <div style={styles.logPlaceholder}>Output will appear here.</div>
              ) : (
                logs.map((log, index) => (
                  <div
                    key={`${log.timestamp}-${index}`}
                    style={{
                      ...styles.logLine,
                      color: log.stream === 'stderr' ? 'var(--red)' : log.stream === 'system' ? 'var(--text-muted)' : 'var(--text)',
                    }}
                  >
                    {log.line}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    padding: '28px 24px',
  },
  content: {
    width: '100%',
    maxWidth: 860,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
  },
  pathCard: {
    padding: '18px 20px',
    borderRadius: 18,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
  },
  pathMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  pathBadge: {
    alignSelf: 'flex-start',
    padding: '4px 10px',
    borderRadius: 999,
    background: 'var(--surface-2)',
    fontSize: 11,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  folderName: {
    fontSize: 28,
    fontWeight: 800,
    color: 'var(--text)',
    letterSpacing: '-0.03em',
  },
  folderPath: {
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    wordBreak: 'break-all' as const,
  },
  summaryCard: {
    padding: '18px 20px',
    borderRadius: 18,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  },
  summaryText: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text)',
  },
  summaryDetail: {
    fontSize: 13,
    color: 'var(--text-muted)',
    lineHeight: 1.6,
  },
  actionCard: {
    padding: '18px 20px',
    borderRadius: 18,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  actionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    alignItems: 'flex-start',
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: 4,
  },
  actionTitle: {
    fontSize: 24,
    fontWeight: 800,
    color: 'var(--text)',
    letterSpacing: '-0.03em',
  },
  actionDescription: {
    marginTop: 4,
    color: 'var(--text-muted)',
    fontSize: 14,
    lineHeight: 1.5,
    maxWidth: 500,
  },
  actionButtons: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
    flexShrink: 0,
  },
  moreWrap: {
    position: 'relative' as const,
  },
  menu: {
    position: 'absolute' as const,
    right: 0,
    top: 44,
    width: 280,
    padding: 8,
    borderRadius: 14,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    zIndex: 20,
  },
  menuItem: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid transparent',
    background: 'transparent',
    color: 'var(--text)',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
  },
  menuItemTitle: {
    fontSize: 13,
    fontWeight: 700,
  },
  menuItemDesc: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginTop: 2,
  },
  menuItemCmd: {
    fontSize: 11,
    color: 'var(--text)',
    marginTop: 6,
    fontFamily: 'var(--font-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  primaryBtn: {
    padding: '12px 18px',
    borderRadius: 12,
    border: 'none',
    background: 'var(--accent)',
    color: 'var(--bg)',
    fontSize: 14,
    fontWeight: 700,
    fontFamily: 'inherit',
    whiteSpace: 'nowrap' as const,
  },
  secondaryBtn: {
    padding: '11px 16px',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text)',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
  },
  ghostBtn: {
    padding: '11px 14px',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text-muted)',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
  },
  commandBox: {
    padding: '14px 16px',
    borderRadius: 14,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  commandLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  },
  commandText: {
    fontSize: 13,
    color: 'var(--text)',
    fontFamily: 'var(--font-mono)',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  commandHint: {
    fontSize: 13,
    color: 'var(--text-muted)',
    lineHeight: 1.6,
  },
  runCard: {
    padding: '18px 20px',
    borderRadius: 18,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  runHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  runTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text)',
  },
  runMessage: {
    marginTop: 4,
    color: 'var(--text-muted)',
    fontSize: 13,
  },
  stopBtn: {
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid rgba(239,68,68,0.25)',
    background: 'rgba(239,68,68,0.08)',
    color: 'var(--red)',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'inherit',
  },
  urlPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '14px 16px',
    borderRadius: 14,
    background: 'rgba(34,197,94,0.08)',
    border: '1px solid rgba(34,197,94,0.2)',
  },
  urlTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--green)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  },
  urlRow: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  urlText: {
    color: 'var(--text)',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  openUrlBtn: {
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid rgba(34,197,94,0.25)',
    background: 'rgba(34,197,94,0.12)',
    color: 'var(--green)',
    fontSize: 12,
    fontWeight: 700,
    fontFamily: 'inherit',
    flexShrink: 0,
  },
  logPanel: {
    maxHeight: 280,
    overflowY: 'auto' as const,
    padding: '14px 16px',
    borderRadius: 14,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  logPlaceholder: {
    color: 'var(--text-muted)',
    fontSize: 12,
  },
  logLine: {
    fontSize: 12,
    lineHeight: 1.5,
    fontFamily: 'var(--font-mono)',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  loadingCard: {
    padding: '24px',
    borderRadius: 18,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
  },
  errorCard: {
    padding: '24px',
    borderRadius: 18,
    background: 'var(--surface)',
    border: '1px solid rgba(239,68,68,0.2)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text)',
  },
  errorText: {
    color: 'var(--text-muted)',
    fontSize: 13,
    lineHeight: 1.6,
  },
};
