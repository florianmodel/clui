import type { InstallProgressEvent } from '@gui-bridge/shared';

interface Props {
  projectName: string;
  events: InstallProgressEvent[];
}

const STAGES: Array<{ key: InstallProgressEvent['stage']; label: string }> = [
  { key: 'cloning', label: 'Cloning repository' },
  { key: 'detecting', label: 'Detecting project type' },
  { key: 'building', label: 'Building Docker image' },
  { key: 'analyzing', label: 'Analyzing CLI interface' },
  { key: 'generating', label: 'Generating interface with AI' },
];

export function InstallProgress({ projectName, events }: Props) {
  const lastEvent = events[events.length - 1];
  const currentStage = lastEvent?.stage;
  const isError = currentStage === 'error';
  const isComplete = currentStage === 'complete';

  const completedStages = new Set<string>();

  for (const s of STAGES) {
    if (s.key === currentStage) break;
    completedStages.add(s.key);
  }

  // Once complete, mark all stages done
  if (isComplete) {
    STAGES.forEach((s) => completedStages.add(s.key));
  }

  return (
    <div style={styles.container}>
      <div style={styles.title}>Installing {projectName}</div>

      <div style={styles.steps}>
        {STAGES.map((s) => {
          const done = completedStages.has(s.key);
          const active = s.key === currentStage && !isComplete;
          const pending = !done && !active;

          return (
            <div key={s.key} style={styles.stepRow}>
              <span style={styles.stepIcon}>
                {done ? '✅' : active ? '⏳' : '○'}
              </span>
              <span
                style={{
                  ...styles.stepLabel,
                  color: done || active ? 'var(--text)' : 'var(--text-muted)',
                  fontWeight: active ? 600 : 400,
                  opacity: pending ? 0.5 : 1,
                }}
              >
                {s.label}
              </span>
            </div>
          );
        })}

        {isComplete && (
          <div style={styles.stepRow}>
            <span style={styles.stepIcon}>🎉</span>
            <span style={{ ...styles.stepLabel, color: 'var(--green)', fontWeight: 600 }}>
              Ready to use!
            </span>
          </div>
        )}

        {isError && (
          <div style={styles.errorBox}>
            <span style={styles.errorTitle}>Installation failed</span>
            <span style={styles.errorMsg}>{lastEvent?.message}</span>
          </div>
        )}
      </div>

      {/* Live log of the current stage */}
      {lastEvent && !isComplete && !isError && (
        <div style={styles.logLine}>{lastEvent.message}</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', gap: 20,
    padding: 24, background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 12,
  },
  title: { fontSize: 16, fontWeight: 700, color: 'var(--text)' },
  steps: { display: 'flex', flexDirection: 'column', gap: 10 },
  stepRow: { display: 'flex', alignItems: 'center', gap: 10 },
  stepIcon: { fontSize: 16, width: 24, textAlign: 'center' as const, flexShrink: 0 },
  stepLabel: { fontSize: 14 },
  logLine: {
    fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '6px 10px',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  errorBox: {
    display: 'flex', flexDirection: 'column', gap: 4,
    padding: '10px 14px',
    background: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
  },
  errorTitle: { fontSize: 13, fontWeight: 700, color: 'var(--red)' },
  errorMsg: { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
};
