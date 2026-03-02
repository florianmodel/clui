import type { AnalysisProgressEvent } from '@gui-bridge/shared';

const STAGES: AnalysisProgressEvent['stage'][] = [
  'detecting',
  'readme',
  'introspecting',
  'help',
  'generating-ui',
  'complete',
];

const STAGE_LABELS: Record<AnalysisProgressEvent['stage'], string> = {
  detecting: 'Detecting language & framework',
  readme: 'Reading documentation',
  introspecting: 'Extracting CLI arguments',
  help: 'Fetching help text',
  'generating-ui': 'Generating UI with AI',
  complete: 'Done',
  error: 'Error',
};

interface AnalysisProgressProps {
  events: AnalysisProgressEvent[];
  toolName?: string;
}

export function AnalysisProgress({ events, toolName }: AnalysisProgressProps) {
  // Determine which stages have completed/are active
  const completedStages = new Set(events.map(e => e.stage));
  const lastEvent = events[events.length - 1];
  const isError = lastEvent?.stage === 'error';
  const isDone = lastEvent?.stage === 'complete';
  const currentStage = lastEvent?.stage;

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div style={styles.title}>
          {isError ? 'Analysis failed' : isDone ? 'Analysis complete' : `Analyzing${toolName ? ` ${toolName}` : ''}…`}
        </div>
      </div>

      <div style={styles.stageList}>
        {STAGES.filter(s => s !== 'complete').map(stage => {
          const isDoneStage = completedStages.has(stage) && stage !== currentStage;
          const isActive = stage === currentStage && !isDone && !isError;
          const isPending = !completedStages.has(stage);

          const event = events.find(e => e.stage === stage);

          return (
            <div key={stage} style={styles.stageRow}>
              <div style={{
                ...styles.dot,
                ...(isDone || isDoneStage ? styles.dotDone : {}),
                ...(isActive ? styles.dotActive : {}),
                ...(isPending ? styles.dotPending : {}),
              }}>
                {(isDone || isDoneStage) ? '✓' : isActive ? '…' : '○'}
              </div>
              <div style={styles.stageInfo}>
                <div style={{
                  ...styles.stageLabel,
                  ...(isActive ? styles.stageLabelActive : {}),
                  ...(isPending ? styles.stageLabelPending : {}),
                }}>
                  {STAGE_LABELS[stage]}
                </div>
                {event?.detail && (
                  <div style={styles.stageDetail}>{event.detail}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Show "Generating UI" progress if active */}
      {currentStage === 'generating-ui' && !isDone && !isError && (
        <div style={styles.aiNote}>
          This usually takes 5–15 seconds.
        </div>
      )}

      {/* Error message */}
      {isError && lastEvent?.message && (
        <div style={styles.errorBox}>
          <div style={styles.errorText}>{lastEvent.message}</div>
        </div>
      )}

      {/* Done checkmark */}
      {isDone && (
        <div style={styles.doneRow}>
          <span style={styles.doneCheck}>✓</span>
          <span style={styles.doneText}>{lastEvent.message}</span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', gap: 16,
    padding: 4,
  },
  header: { display: 'flex', flexDirection: 'column', gap: 4 },
  title: { fontSize: 15, fontWeight: 700, color: 'var(--text)' },
  stageList: { display: 'flex', flexDirection: 'column', gap: 10 },
  stageRow: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  dot: {
    width: 20, height: 20,
    borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, flexShrink: 0,
  },
  dotDone: { background: '#22c55e', color: '#fff' },
  dotActive: { background: 'var(--accent)', color: '#0f0c29', animation: 'pulse 1s ease-in-out infinite' },
  dotPending: { background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' },
  stageInfo: { display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 1 },
  stageLabel: { fontSize: 13, color: 'var(--text)' },
  stageLabelActive: { fontWeight: 600, color: 'var(--accent)' },
  stageLabelPending: { color: 'var(--text-muted)' },
  stageDetail: { fontSize: 11, color: 'var(--text-muted)' },
  aiNote: {
    fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic',
    paddingLeft: 32,
  },
  errorBox: {
    background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)',
    borderRadius: 8, padding: '10px 12px',
  },
  errorText: { fontSize: 12, color: 'var(--red)' },
  doneRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 12px',
    background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
    borderRadius: 8,
  },
  doneCheck: { fontSize: 16, color: '#22c55e' },
  doneText: { fontSize: 12, color: 'var(--text)' },
};
