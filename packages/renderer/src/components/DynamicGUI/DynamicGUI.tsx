import { useState } from 'react';
import type { UISchema, ExecLogEvent } from '@gui-bridge/shared';
import { WorkflowSelector } from './WorkflowSelector.js';
import { WorkflowPanel } from './WorkflowPanel.js';

interface Props {
  schema: UISchema;
  onLog: (event: ExecLogEvent) => void;
  onClearLogs: () => void;
  dockerStatus: 'checking' | 'ok' | 'error';
}

export function DynamicGUI({ schema, onLog, onClearLogs, dockerStatus }: Props) {
  const [activeWorkflowId, setActiveWorkflowId] = useState(schema.workflows[0].id);

  const activeWorkflow =
    schema.workflows.find((w) => w.id === activeWorkflowId) ?? schema.workflows[0];

  return (
    <div style={styles.container}>
      {/* Project header */}
      <div style={styles.header}>
        <div style={styles.headerRow}>
          {schema.icon && <span style={styles.icon}>{schema.icon}</span>}
          <div>
            <h1 style={styles.title}>{schema.projectName}</h1>
            <p style={styles.subtitle}>{schema.description}</p>
          </div>
        </div>

        {/* Docker status */}
        <div style={styles.statusRow}>
          <StatusDot state={dockerStatus} />
          <span style={styles.statusText}>
            {dockerStatus === 'checking' && 'Checking Docker…'}
            {dockerStatus === 'ok' && 'Docker ready'}
            {dockerStatus === 'error' && 'Docker not running — please start Docker Desktop'}
          </span>
        </div>
      </div>

      {/* Workflow tabs (only when multiple workflows) */}
      {schema.workflows.length > 1 && (
        <WorkflowSelector
          workflows={schema.workflows}
          activeId={activeWorkflowId}
          onChange={setActiveWorkflowId}
        />
      )}

      {/* Divider */}
      <div style={styles.divider} />

      {/* Active workflow form — key forces remount on workflow switch */}
      <WorkflowPanel
        key={`${schema.projectId}-${activeWorkflowId}`}
        workflow={activeWorkflow}
        schema={schema}
        onLog={onLog}
        onClearLogs={onClearLogs}
      />
    </div>
  );
}

function StatusDot({ state }: { state: 'checking' | 'ok' | 'error' }) {
  const color =
    state === 'ok' ? 'var(--green)' :
    state === 'error' ? 'var(--red)' :
    'var(--yellow)';
  return (
    <div style={{
      width: 8, height: 8, borderRadius: '50%',
      background: color, boxShadow: `0 0 6px ${color}`, flexShrink: 0,
    }} />
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', gap: 16,
    padding: 24, background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 12,
  },
  header: { display: 'flex', flexDirection: 'column', gap: 10 },
  headerRow: { display: 'flex', alignItems: 'center', gap: 12 },
  icon: { fontSize: 28, lineHeight: 1 },
  title: {
    fontSize: 20, fontWeight: 700, margin: 0,
    background: 'linear-gradient(90deg, #a78bfa, #60a5fa)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
  },
  subtitle: { fontSize: 12, color: 'var(--text-muted)', margin: 0 },
  statusRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 12px', background: 'var(--surface-2)',
    borderRadius: 8, border: '1px solid var(--border)',
  },
  statusText: { fontSize: 13, color: 'var(--text)' },
  divider: { height: 1, background: 'var(--border)' },
};
