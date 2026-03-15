import type { InstallProgressEvent } from '@gui-bridge/shared';

const STAGE_LABELS: Record<string, string> = {
  cloning: 'Downloading…',
  detecting: 'Checking compatibility…',
  registry: 'Checking community templates…',
  building: 'Setting up environment…',
  analyzing: 'Learning the tool…',
  generating: 'Creating your interface…',
  complete: 'Ready!',
  error: 'Setup failed',
};

const STAGE_PROGRESS: Record<string, number> = {
  cloning: 10,
  detecting: 20,
  registry: 28,
  building: 55,
  analyzing: 75,
  generating: 90,
  complete: 100,
  error: 0,
};

interface Props {
  projectName: string;
  stage: InstallProgressEvent['stage'];
  message: string;
  onOpen?: () => void;
  onDismiss: () => void;
}

export function InstallingToast({ projectName, stage, message, onOpen, onDismiss }: Props) {
  const isComplete = stage === 'complete';
  const isError = stage === 'error';
  const progress = STAGE_PROGRESS[stage] ?? 50;
  const label = STAGE_LABELS[stage] ?? message;

  return (
    <div style={{ ...styles.toast, borderColor: isError ? 'var(--red)' : isComplete ? 'var(--green)' : 'var(--border)' }}>
      <div style={styles.toastHeader}>
        <div style={styles.toastIcon}>
          {isComplete ? '✓' : isError ? '✗' : <span style={styles.spinner}>⟳</span>}
        </div>
        <div style={styles.toastInfo}>
          <div style={styles.toastName}>{projectName}</div>
          <div style={styles.toastLabel}>{label}</div>
        </div>
        <button type="button" style={styles.dismissBtn} onClick={onDismiss}>✕</button>
      </div>

      {!isComplete && !isError && (
        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${progress}%` }} />
        </div>
      )}

      {isComplete && onOpen && (
        <button type="button" style={styles.openBtn} onClick={onOpen}>
          Open →
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toast: {
    width: 240, padding: '10px 12px',
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
    display: 'flex', flexDirection: 'column', gap: 8,
    transition: 'border-color 0.3s',
  },
  toastHeader: { display: 'flex', alignItems: 'center', gap: 8 },
  toastIcon: {
    width: 24, height: 24, borderRadius: '50%',
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, color: 'var(--accent)',
    flexShrink: 0,
  },
  spinner: {
    display: 'inline-block',
    animation: 'spin 1s linear infinite',
  },
  toastInfo: { flex: 1, minWidth: 0 },
  toastName: { fontSize: 12, fontWeight: 700, color: 'var(--text)' },
  toastLabel: { fontSize: 10, color: 'var(--text-muted)', marginTop: 1 },
  dismissBtn: {
    background: 'transparent', border: 'none',
    color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', padding: 2,
    flexShrink: 0,
  },
  progressBar: {
    height: 3, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', background: 'var(--accent)', borderRadius: 2,
    transition: 'width 0.6s ease',
  },
  openBtn: {
    background: 'transparent', border: 'none',
    color: 'var(--accent)', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', padding: '2px 0', textAlign: 'left' as const,
    fontFamily: 'inherit',
  },
};
