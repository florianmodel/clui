import { useState } from 'react';
import type { UISchema, ExecLogEvent } from '@gui-bridge/shared';
import { WorkflowSelector } from './WorkflowSelector.js';
import { WorkflowPanel } from './WorkflowPanel.js';

type ImproveStatus = 'idle' | 'open' | 'thinking' | 'error';
type AddWorkflowStatus = 'idle' | 'open' | 'thinking' | 'error' | 'infeasible';

interface Props {
  schema: UISchema;
  onLog: (event: ExecLogEvent) => void;
  onClearLogs: () => void;
  dockerStatus: 'checking' | 'ok' | 'error';
  /** If set, shows the Improve button so users can refine the schema */
  projectId?: string;
  /** Called when an improved schema is returned from the LLM */
  onSchemaImproved?: (schema: UISchema) => void;
}

export function DynamicGUI({ schema, onLog, onClearLogs, dockerStatus, projectId, onSchemaImproved }: Props) {
  const [activeWorkflowId, setActiveWorkflowId] = useState(schema.workflows[0].id);

  // Improve panel state
  const [improveStatus, setImproveStatus] = useState<ImproveStatus>('idle');
  const [improveFeedback, setImproveFeedback] = useState('');
  const [improveError, setImproveError] = useState('');

  // New Use Case panel state
  const [addStatus, setAddStatus] = useState<AddWorkflowStatus>('idle');
  const [addInput, setAddInput] = useState('');
  const [addMessage, setAddMessage] = useState('');

  const activeWorkflow =
    schema.workflows.find((w) => w.id === activeWorkflowId) ?? schema.workflows[0];

  async function handleAddWorkflow() {
    if (!addInput.trim() || !projectId) return;
    setAddStatus('thinking');
    setAddMessage('');

    const res = await window.electronAPI.projects.addWorkflow({
      projectId,
      description: addInput.trim(),
      currentSchema: schema,
    });

    if (res.infeasible) {
      setAddStatus('infeasible');
      setAddMessage(res.infeasible);
    } else if (res.ok && res.schema) {
      setAddStatus('idle');
      setAddInput('');
      onSchemaImproved?.(res.schema);
      // Switch to the newly added workflow tab
      const newWf = res.schema.workflows[res.schema.workflows.length - 1];
      if (newWf) setActiveWorkflowId(newWf.id);
    } else {
      setAddStatus('error');
      setAddMessage(res.error ?? 'Failed to generate workflow.');
    }
  }

  async function handleImprove() {
    if (!improveFeedback.trim() || !projectId) return;
    setImproveStatus('thinking');
    setImproveError('');

    const res = await window.electronAPI.projects.improve({
      projectId,
      feedback: improveFeedback.trim(),
      currentSchema: schema,
    });

    if (res.ok && res.schema) {
      setImproveStatus('idle');
      setImproveFeedback('');
      onSchemaImproved?.(res.schema);
    } else {
      setImproveStatus('error');
      setImproveError(res.error ?? 'Improvement failed');
    }
  }

  return (
    <div style={styles.container}>
      {/* Project header */}
      <div style={styles.header}>
        <div style={styles.headerRow}>
          {schema.icon && <span style={styles.icon}>{schema.icon}</span>}
          <div style={{ flex: 1 }}>
            <h1 style={styles.title}>{schema.projectName}</h1>
            <p style={styles.subtitle}>{schema.description}</p>
          </div>

          {/* Buttons — only shown for installed projects */}
          {projectId && onSchemaImproved && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {/* New Use Case */}
              <button
                type="button"
                style={{
                  ...styles.improveBtn,
                  ...(addStatus !== 'idle' ? styles.improveBtnActive : {}),
                }}
                onClick={() => {
                  if (addStatus === 'idle') {
                    setAddStatus('open');
                    setAddMessage('');
                    setImproveStatus('idle');
                  } else if (addStatus !== 'thinking') {
                    setAddStatus('idle');
                    setAddInput('');
                    setAddMessage('');
                  }
                }}
                disabled={addStatus === 'thinking'}
                title="Add a new workflow tab with AI"
              >
                + New Use Case
              </button>

              {/* Improve */}
              <button
                type="button"
                style={{
                  ...styles.improveBtn,
                  ...(improveStatus === 'open' || improveStatus === 'thinking' || improveStatus === 'error'
                    ? styles.improveBtnActive
                    : {}),
                }}
                onClick={() => {
                  if (improveStatus === 'idle') {
                    setImproveStatus('open');
                    setImproveError('');
                    setAddStatus('idle');
                  } else if (improveStatus !== 'thinking') {
                    setImproveStatus('idle');
                    setImproveFeedback('');
                    setImproveError('');
                  }
                }}
                disabled={improveStatus === 'thinking'}
              >
                ✨ Improve
              </button>
            </div>
          )}
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

      {/* New Use Case panel */}
      {addStatus !== 'idle' && (
        <div style={styles.improvePanel}>
          <div style={styles.improvePanelTitle}>New Use Case</div>
          <div style={styles.improvePanelHint}>
            Describe what you want this tool to do and AI will check feasibility and generate a new workflow tab.
          </div>
          <textarea
            style={styles.improveTextarea}
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            placeholder="e.g. Extract text from a PDF, resize images in bulk…"
            rows={3}
            disabled={addStatus === 'thinking'}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddWorkflow();
            }}
          />
          {addStatus === 'infeasible' && (
            <div style={{ ...styles.improveError, color: 'var(--yellow)' }}>
              Not feasible: {addMessage}
            </div>
          )}
          {addStatus === 'error' && (
            <div style={styles.improveError}>{addMessage}</div>
          )}
          <div style={styles.improveActions}>
            <button
              type="button"
              style={styles.improveSubmitBtn}
              onClick={handleAddWorkflow}
              disabled={addStatus === 'thinking' || !addInput.trim()}
            >
              {addStatus === 'thinking' ? 'Checking feasibility…' : 'Generate Workflow'}
            </button>
            <button
              type="button"
              style={styles.improveCancelBtn}
              onClick={() => { setAddStatus('idle'); setAddInput(''); setAddMessage(''); }}
              disabled={addStatus === 'thinking'}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Improve panel */}
      {(improveStatus === 'open' || improveStatus === 'thinking' || improveStatus === 'error') && (
        <div style={styles.improvePanel}>
          <div style={styles.improvePanelTitle}>What would you like to change?</div>
          <div style={styles.improvePanelHint}>
            Describe the UX improvement and Claude will regenerate the interface.
            Example: "Let me select multiple PDF files" or "Add a quality slider"
          </div>
          <textarea
            style={styles.improveTextarea}
            value={improveFeedback}
            onChange={(e) => setImproveFeedback(e.target.value)}
            placeholder="Describe what you'd like to improve…"
            rows={3}
            disabled={improveStatus === 'thinking'}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleImprove();
            }}
          />
          {improveError && <div style={styles.improveError}>{improveError}</div>}
          <div style={styles.improveActions}>
            <button
              type="button"
              style={styles.improveSubmitBtn}
              onClick={handleImprove}
              disabled={improveStatus === 'thinking' || !improveFeedback.trim()}
            >
              {improveStatus === 'thinking' ? 'Refining with AI…' : 'Improve Interface'}
            </button>
            <button
              type="button"
              style={styles.improveCancelBtn}
              onClick={() => { setImproveStatus('idle'); setImproveFeedback(''); setImproveError(''); }}
              disabled={improveStatus === 'thinking'}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
  headerRow: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  icon: { fontSize: 28, lineHeight: 1 },
  title: {
    fontSize: 20, fontWeight: 700, margin: 0,
    color: 'var(--text)',
  },
  subtitle: { fontSize: 12, color: 'var(--text-muted)', margin: 0 },
  statusRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 12px', background: 'var(--surface-2)',
    borderRadius: 8, border: '1px solid var(--border)',
  },
  statusText: { fontSize: 13, color: 'var(--text)' },
  divider: { height: 1, background: 'var(--border)' },

  // Improve button
  improveBtn: {
    flexShrink: 0,
    border: '1px solid var(--border)', borderRadius: 8,
    background: 'transparent', color: 'var(--text-muted)',
    fontSize: 12, padding: '6px 12px', cursor: 'pointer',
    marginTop: 2,
  },
  improveBtnActive: {
    border: '1px solid var(--accent)',
    color: 'var(--accent)',
  },

  // Improve panel
  improvePanel: {
    display: 'flex', flexDirection: 'column', gap: 10,
    padding: '14px 16px',
    background: 'var(--surface-2)',
    border: '1px solid var(--accent)',
    borderRadius: 10,
    marginBottom: 4,
  },
  improvePanelTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text)' },
  improvePanelHint: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 },
  improveTextarea: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text)', fontSize: 13,
    padding: '8px 12px', fontFamily: 'inherit',
    outline: 'none', resize: 'vertical' as const,
    lineHeight: 1.5,
  },
  improveError: {
    fontSize: 12, color: 'var(--red)', fontWeight: 600,
  },
  improveActions: { display: 'flex', gap: 8, alignItems: 'center' },
  improveSubmitBtn: {
    border: 'none', borderRadius: 8,
    background: 'var(--accent)', color: 'var(--bg)',
    fontWeight: 700, fontSize: 12, padding: '6px 14px', cursor: 'pointer',
  },
  improveCancelBtn: {
    border: 'none', background: 'transparent',
    color: 'var(--text-muted)', fontSize: 12, padding: '6px 8px', cursor: 'pointer',
  },
};
