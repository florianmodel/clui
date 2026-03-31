import { useState, useCallback } from 'react';
import type { UISchema, CapabilityDump } from '@gui-bridge/shared';
import { WorkflowSummary } from './WorkflowSummary.js';
import { AnalysisProgress } from '../AnalysisProgress/AnalysisProgress.js';
import type { AnalysisProgressEvent } from '@gui-bridge/shared';

interface SchemaReviewProps {
  schema: UISchema;
  dump: CapabilityDump;
  warnings?: string[];
  onApprove: (schema: UISchema) => void;
  onBack: () => void;
}

export function SchemaReview({ schema, dump, warnings, onApprove, onBack }: SchemaReviewProps) {
  const [feedback, setFeedback] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [progressEvents, setProgressEvents] = useState<AnalysisProgressEvent[]>([]);
  const [currentSchema, setCurrentSchema] = useState(schema);
  const [error, setError] = useState<string | null>(null);

  const handleRegenerate = useCallback(async (withFeedback: boolean) => {
    setRegenerating(true);
    setError(null);
    setProgressEvents([]);

    const cleanup = window.electronAPI.on.analysisProgress(event => {
      setProgressEvents(prev => [...prev, event]);
    });

    try {
      const res = await window.electronAPI.schema.generate({
        dump,
        dockerImage: currentSchema.dockerImage,
        forceRegenerate: true,
        feedback: withFeedback ? feedback : undefined,
        currentSchema: withFeedback ? currentSchema : undefined,
      });

      if (res.ok && res.schema) {
        setCurrentSchema(res.schema);
        setFeedback('');
      } else {
        setError(res.error ?? 'Regeneration failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      cleanup();
      setRegenerating(false);
      setProgressEvents([]);
    }
  }, [dump, currentSchema, feedback]);

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={onBack}>
          ← Back
        </button>
        <div style={styles.titleBlock}>
          <div style={styles.title}>
            Generated UI for <em>{currentSchema.projectName}</em>
          </div>
          <div style={styles.subtitle}>
            {currentSchema.workflows.length} workflow{currentSchema.workflows.length !== 1 ? 's' : ''} ·
            {' '}{currentSchema.description}
          </div>
        </div>
      </div>

      {/* Progress overlay during regeneration */}
      {regenerating && (
        <AnalysisProgress events={progressEvents} toolName={currentSchema.projectName} />
      )}

      {!regenerating && (
        <>
          {/* Schema warnings from validator */}
          {warnings && warnings.length > 0 && (
            <div style={styles.warningBox}>
              <div style={styles.warningTitle}>
                ⚠ {warnings.length} issue{warnings.length > 1 ? 's' : ''} detected — auto-repaired where possible
              </div>
              <ul style={styles.warningList}>
                {warnings.map((w, i) => (
                  <li key={i} style={styles.warningItem}>{w}</li>
                ))}
              </ul>
              <div style={styles.warningHint}>
                If commands still fail at runtime, use "Regenerate" to produce a cleaner schema.
              </div>
            </div>
          )}

          {/* Workflow summaries */}
          <div style={styles.workflows}>
            {currentSchema.workflows.map((wf, i) => (
              <WorkflowSummary key={wf.id} workflow={wf} index={i} />
            ))}
          </div>

          {error && (
            <div style={styles.errorBox}>
              <div style={styles.errorText}>{error}</div>
            </div>
          )}

          {/* Feedback + regenerate */}
          <div style={styles.feedbackSection}>
            <div style={styles.feedbackLabel}>
              Optional: describe what to change
            </div>
            <textarea
              style={styles.feedbackInput}
              placeholder="e.g. Add a subtitle download option. Remove the quality step and default to best quality."
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              rows={2}
            />
            <div style={styles.feedbackActions}>
              <button
                type="button"
                style={styles.regenBtn}
                onClick={() => handleRegenerate(true)}
                disabled={!feedback.trim()}
              >
                Regenerate with feedback
              </button>
              <button
                type="button"
                style={styles.regenBtnSecondary}
                onClick={() => handleRegenerate(false)}
              >
                Regenerate
              </button>
            </div>
          </div>

          {/* Approve */}
          <div style={styles.approveRow}>
            <button
              type="button"
              style={styles.approveBtn}
              onClick={() => onApprove(currentSchema)}
            >
              Looks Good — Use This UI →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', gap: 14,
    padding: 4,
  },
  header: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-muted)', fontSize: 12, padding: '4px 0',
    flexShrink: 0, paddingTop: 2,
  },
  titleBlock: { display: 'flex', flexDirection: 'column', gap: 3 },
  title: { fontSize: 14, fontWeight: 700, color: 'var(--text)' },
  subtitle: { fontSize: 11, color: 'var(--text-muted)' },
  workflows: { display: 'flex', flexDirection: 'column', gap: 8 },
  feedbackSection: { display: 'flex', flexDirection: 'column', gap: 8 },
  feedbackLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  feedbackInput: {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 10px',
    fontSize: 12, color: 'var(--text)',
    resize: 'vertical', outline: 'none',
    fontFamily: 'inherit',
  },
  feedbackActions: { display: 'flex', gap: 8 },
  regenBtn: {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 14px',
    fontSize: 12, color: 'var(--text)', cursor: 'pointer',
  },
  regenBtnSecondary: {
    background: 'none', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 14px',
    fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer',
  },
  approveRow: { display: 'flex', paddingTop: 4 },
  approveBtn: {
    background: 'var(--accent)', border: 'none',
    borderRadius: 8, padding: '10px 20px',
    fontSize: 13, fontWeight: 600, color: 'var(--bg)', cursor: 'pointer',
  },
  errorBox: {
    background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)',
    borderRadius: 8, padding: '10px 12px',
  },
  errorText: { fontSize: 12, color: 'var(--red)' },
  warningBox: {
    background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.35)',
    borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4,
  },
  warningTitle: { fontSize: 12, fontWeight: 700, color: '#f59e0b' },
  warningList: { margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 2 },
  warningItem: { fontSize: 11, color: '#f59e0b' },
  warningHint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
};
