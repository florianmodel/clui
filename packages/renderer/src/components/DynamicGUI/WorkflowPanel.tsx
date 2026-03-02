import { useState, useCallback, useEffect } from 'react';
import type { Workflow, UISchema, ExecCompleteEvent, ExecLogEvent } from '@gui-bridge/shared';
import { useLogEvents, useCompleteEvent } from '../../hooks/useIPC.js';
import { StepRenderer } from './StepRenderer.js';
import { CommandPreview } from './CommandPreview.js';

interface Props {
  workflow: Workflow;
  schema: UISchema;
  onLog: (event: ExecLogEvent) => void;
  onClearLogs: () => void;
}

type RunStatus = 'idle' | 'running' | 'done' | 'error';

/** Build command preview in the renderer (no Node.js — uses own basename). */
function buildPreview(workflow: Workflow, inputs: Record<string, unknown>): string {
  let cmd = workflow.execute.command;
  for (const [stepId, value] of Object.entries(inputs)) {
    if (value === null || value === undefined || value === '') continue;
    const step = workflow.steps.find((s) => s.id === stepId);
    if (step?.type === 'file_input') {
      const v = Array.isArray(value) ? value[0] : value;
      const filename = String(v).split('/').pop() ?? String(v);
      cmd = cmd.replaceAll(`{${stepId}}`, filename);
    } else if (step?.type === 'checkbox' || step?.type === 'toggle') {
      cmd = cmd.replaceAll(`{${stepId}}`, value ? 'true' : 'false');
    } else {
      cmd = cmd.replaceAll(`{${stepId}}`, String(value));
    }
  }
  return cmd;
}

/** Initialize form values from schema defaults. */
function initValues(workflow: Workflow): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const step of workflow.steps) {
    if (step.default !== undefined) {
      values[step.id] = step.default;
    }
  }
  return values;
}

export function WorkflowPanel({ workflow, schema, onLog, onClearLogs }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>(() => initValues(workflow));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [runStatus, setRunStatus] = useState<RunStatus>('idle');
  const [outputFiles, setOutputFiles] = useState<string[]>([]);
  const [outputDir, setOutputDir] = useState<string>('');
  const [outputDirError, setOutputDirError] = useState<string>('');

  // Load desktop path as default output dir once on mount
  useEffect(() => {
    window.electronAPI.app.getDesktopPath().then((p) => {
      setOutputDir((prev) => prev || p);
    });
  }, []);

  // Reset form state when workflow changes (keep outputDir — user's preference)
  useEffect(() => {
    setValues(initValues(workflow));
    setErrors({});
    setRunStatus('idle');
    setOutputFiles([]);
  }, [workflow.id]);

  // Forward streamed logs to App.tsx
  useLogEvents(onLog);

  // Handle execution complete
  useCompleteEvent(
    useCallback(
      (event: ExecCompleteEvent) => {
        if (event.exitCode === 0) {
          setOutputFiles(event.outputFiles);
          setRunStatus('done');
          onLog({
            stream: 'system',
            line: workflow.execute.successMessage ?? `Done! Output: ${event.outputFiles.join(', ') || '(none)'}`,
            timestamp: Date.now(),
          });
        } else {
          setRunStatus('error');
          onLog({
            stream: 'system',
            line: `Process exited with code ${event.exitCode}. ${event.error ?? ''}`,
            timestamp: Date.now(),
          });
        }
      },
      [workflow, onLog],
    ),
  );

  function handleChange(stepId: string, value: unknown) {
    setValues((prev) => ({ ...prev, [stepId]: value }));
    // Clear error on change
    if (errors[stepId]) {
      setErrors((prev) => { const e = { ...prev }; delete e[stepId]; return e; });
    }
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    for (const step of workflow.steps) {
      // Check showIf — skip hidden steps
      if (step.showIf) {
        const { stepId, equals } = step.showIf;
        if (values[stepId] !== equals) continue;
      }

      const value = values[step.id];
      if (step.required && (value === undefined || value === null || value === '')) {
        newErrors[step.id] = `${step.label} is required`;
        continue;
      }

      if (value !== undefined && value !== null && value !== '' && step.validation?.pattern) {
        const re = new RegExp(step.validation.pattern);
        if (!re.test(String(value))) {
          newErrors[step.id] = step.validation.message ?? `Invalid value for ${step.label}`;
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function pickOutputDir() {
    const result = await window.electronAPI.files.pick({
      title: 'Select output folder',
      properties: ['openDirectory'],
    });
    if (!result.canceled && result.filePaths[0]) {
      setOutputDir(result.filePaths[0]);
      setOutputDirError('');
    }
  }

  async function handleRun() {
    if (!validate()) return;
    if (!outputDir) {
      setOutputDirError('Please select an output folder');
      return;
    }
    setOutputDirError('');

    onClearLogs();
    setOutputFiles([]);
    setRunStatus('running');

    const response = await window.electronAPI.exec.schemaRun({
      workflow,
      dockerImage: schema.dockerImage,
      dockerfilePath: schema.dockerfilePath,
      inputs: values,
      outputDir,
    });

    if (!response.ok && runStatus !== 'error') {
      setRunStatus('error');
    }
  }

  const busy = runStatus === 'running';
  const commandPreview = buildPreview(workflow, values);

  // Determine visible steps (respecting showIf)
  const visibleSteps = workflow.steps.filter((step) => {
    if (!step.showIf) return true;
    const { stepId, equals } = step.showIf;
    return values[stepId] === equals;
  });

  return (
    <div style={styles.container}>
      {/* Workflow header */}
      <div style={styles.header}>
        <h2 style={styles.name}>{workflow.name}</h2>
        <p style={styles.description}>{workflow.description}</p>
      </div>

      {/* Guidance box */}
      {workflow.guidance && (
        <div style={styles.guidance}>
          <span style={styles.guidanceIcon}>💡</span>
          {workflow.guidance}
        </div>
      )}

      {/* Form steps */}
      <div style={styles.steps}>
        {visibleSteps.map((step) => (
          <StepRenderer
            key={step.id}
            step={step}
            value={values[step.id] as string}
            onChange={handleChange}
            error={errors[step.id]}
          />
        ))}
      </div>

      {/* Output folder */}
      <div style={styles.outputDirField}>
        <label style={styles.outputDirLabel}>Save output to</label>
        <div style={styles.outputDirRow}>
          <button
            type="button"
            style={{ ...styles.outputDirBtn, ...(outputDirError ? styles.outputDirBtnError : {}) }}
            onClick={pickOutputDir}
          >
            Choose folder…
          </button>
          {outputDir ? (
            <span style={styles.outputDirPath}>{outputDir.replace(/^\/Users\/[^/]+/, '~')}</span>
          ) : (
            <span style={styles.outputDirPlaceholder}>No folder selected</span>
          )}
        </div>
        {outputDirError && <div style={styles.outputDirErrorMsg}>{outputDirError}</div>}
      </div>

      {/* Run button */}
      <div style={styles.actions}>
        <button
          type="button"
          style={{
            ...styles.runBtn,
            background: runStatus === 'done' ? 'var(--green)' : 'var(--accent)',
            opacity: busy ? 0.7 : 1,
          }}
          onClick={handleRun}
          disabled={busy}
        >
          {busy && '⏳ Running…'}
          {runStatus === 'idle' && '▶ Run'}
          {runStatus === 'done' && '✓ Done — Run Again'}
          {runStatus === 'error' && '✗ Error — Retry'}
        </button>

        {busy && (
          <button
            type="button"
            style={styles.stopBtn}
            onClick={() => window.electronAPI.exec.cancel()}
          >
            ■ Stop
          </button>
        )}
      </div>

      {/* Command preview */}
      <CommandPreview command={commandPreview} />

      {/* Estimated duration */}
      {workflow.execute.estimatedDuration && (
        <div style={styles.estimate}>
          Estimated: {workflow.execute.estimatedDuration}
        </div>
      )}

      {/* Output files */}
      {outputFiles.length > 0 && (
        <div style={styles.outputSection}>
          <div style={styles.outputTitle}>Output files</div>
          {outputFiles.map((f) => (
            <div key={f} style={styles.outputFile}>
              <span style={styles.outputFileName}>{f.split('/').pop()}</span>
              <button
                type="button"
                style={styles.openBtn}
                onClick={() => window.electronAPI.files.showInFinder(f)}
              >
                Show in Finder
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 16 },
  header: { display: 'flex', flexDirection: 'column', gap: 2 },
  name: { fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 },
  description: { fontSize: 13, color: 'var(--text-muted)', margin: 0 },
  guidance: {
    display: 'flex', alignItems: 'flex-start', gap: 8,
    padding: '10px 14px',
    background: 'rgba(96, 165, 250, 0.08)',
    border: '1px solid rgba(96, 165, 250, 0.25)',
    borderRadius: 8, fontSize: 13, color: 'var(--text)',
    lineHeight: 1.5,
  },
  guidanceIcon: { flexShrink: 0 },
  steps: { display: 'flex', flexDirection: 'column', gap: 14 },
  outputDirField: { display: 'flex', flexDirection: 'column', gap: 4 },
  outputDirLabel: { fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  outputDirRow: { display: 'flex', alignItems: 'center', gap: 10 },
  outputDirBtn: {
    background: 'transparent', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text)', fontSize: 13,
    padding: '7px 14px', cursor: 'pointer', flexShrink: 0,
  },
  outputDirBtnError: { borderColor: 'var(--red)' },
  outputDirPath: {
    fontSize: 12, color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  outputDirPlaceholder: { fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' },
  outputDirErrorMsg: { fontSize: 12, color: 'var(--red)' },
  actions: { display: 'flex', gap: 10 },
  runBtn: {
    flex: 1, border: 'none', borderRadius: 10,
    color: '#0f0c29', fontWeight: 700, fontSize: 15,
    padding: '12px 24px', cursor: 'pointer', letterSpacing: '-0.01em',
  },
  stopBtn: {
    border: '1px solid var(--red)', borderRadius: 10,
    background: 'transparent', color: 'var(--red)',
    fontWeight: 700, fontSize: 14, padding: '12px 20px', cursor: 'pointer',
  },
  estimate: {
    fontSize: 12, color: 'var(--text-muted)',
    fontStyle: 'italic', textAlign: 'center',
  },
  outputSection: {
    display: 'flex', flexDirection: 'column', gap: 8,
    padding: '12px 16px', background: 'var(--surface-2)',
    borderRadius: 8, border: '1px solid var(--border)',
  },
  outputTitle: {
    fontSize: 12, fontWeight: 600, letterSpacing: '0.05em',
    textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4,
  },
  outputFile: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  outputFileName: { fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--green)' },
  openBtn: {
    background: 'transparent', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text-muted)', fontSize: 12,
    padding: '3px 10px', cursor: 'pointer',
  },
};
