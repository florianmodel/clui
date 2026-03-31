import { describeExecution, type Workflow } from '@gui-bridge/shared';

interface WorkflowSummaryProps {
  workflow: Workflow;
  index: number;
}

export function WorkflowSummary({ workflow, index }: WorkflowSummaryProps) {
  const stepTypeIcon: Record<string, string> = {
    file_input: '📄',
    directory_input: '📁',
    text_input: '✏️',
    number: '🔢',
    dropdown: '▾',
    radio: '◉',
    toggle: '◎',
    checkbox: '☑',
    textarea: '¶',
  };

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.workflowNum}>#{index + 1}</div>
        <div style={styles.workflowName}>{workflow.name}</div>
      </div>

      {workflow.description && (
        <div style={styles.description}>{workflow.description}</div>
      )}

      <div style={styles.steps}>
        {workflow.steps.map(step => (
          <div key={step.id} style={styles.stepRow}>
            <span style={styles.stepIcon}>{stepTypeIcon[step.type] ?? '·'}</span>
            <span style={styles.stepLabel}>{step.label}</span>
            {step.required && <span style={styles.requiredBadge}>required</span>}
            <span style={styles.stepType}>{step.type}</span>
          </div>
        ))}
        {workflow.steps.length === 0 && (
          <div style={styles.noSteps}>No input steps (runs directly)</div>
        )}
      </div>

      <div style={styles.command}>
        <span style={styles.commandLabel}>Command: </span>
        <span style={styles.commandText}>{describeExecution(workflow)}</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '12px 14px',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  header: { display: 'flex', alignItems: 'center', gap: 8 },
  workflowNum: {
    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 4, padding: '1px 5px', flexShrink: 0,
  },
  workflowName: { fontSize: 13, fontWeight: 700, color: 'var(--text)' },
  description: { fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 },
  steps: { display: 'flex', flexDirection: 'column', gap: 4 },
  stepRow: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 },
  stepIcon: { fontSize: 12, width: 16, flexShrink: 0 },
  stepLabel: { color: 'var(--text)', flex: 1 },
  requiredBadge: {
    fontSize: 9, color: 'var(--accent)', background: 'rgba(167,139,250,0.1)',
    border: '1px solid rgba(167,139,250,0.3)',
    borderRadius: 3, padding: '1px 4px', fontWeight: 600,
  },
  stepType: { color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' },
  noSteps: { fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' },
  command: {
    fontSize: 10, fontFamily: 'var(--font-mono)',
    background: 'var(--bg)', borderRadius: 6, padding: '6px 8px',
    overflowX: 'auto', whiteSpace: 'pre',
    color: 'var(--text-muted)',
  },
  commandLabel: { fontWeight: 600, color: 'var(--text)' },
  commandText: {},
};
