import { useState, useCallback, useEffect, useRef } from 'react';
import type { Workflow, UISchema, ExecCompleteEvent, ExecLogEvent } from '@gui-bridge/shared';
import { useLogEvents, useCompleteEvent } from '../../hooks/useIPC.js';
import { StepRenderer } from './StepRenderer.js';
import { CommandPreview } from './CommandPreview.js';
import { FileCard } from '../OutputPanel/FileCard.js';

interface Props {
  workflow: Workflow;
  schema: UISchema;
  onLog: (event: ExecLogEvent) => void;
  onClearLogs: () => void;
  projectId?: string;
  onRunComplete?: () => void;
}

type RunStatus = 'idle' | 'running' | 'done' | 'error';
type FixStatus = 'idle' | 'thinking' | 'ready' | 'rerunning' | 'save-prompt';

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

export function WorkflowPanel({ workflow, schema, onLog, onClearLogs, projectId, onRunComplete }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>(() => initValues(workflow));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [runStatus, setRunStatus] = useState<RunStatus>('idle');
  const [outputFiles, setOutputFiles] = useState<string[]>([]);
  const [outputDir, setOutputDir] = useState<string>('');
  const [outputDirError, setOutputDirError] = useState<string>('');

  // Batch mode
  const [batchMode, setBatchMode] = useState(false);
  const [batchFiles, setBatchFiles] = useState<string[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);

  // Advanced options visibility
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Natural language form fill
  const [fillInput, setFillInput] = useState('');
  const [fillStatus, setFillStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  // Local mutable workflow copy — updated when auto-fix accepts a new command template
  const [currentWorkflow, setCurrentWorkflow] = useState<Workflow>(workflow);

  // Auto-fix state
  const [fixStatus, setFixStatus] = useState<FixStatus>('idle');
  const [fixedTemplate, setFixedTemplate] = useState<string | null>(null);
  const [fixExplanation, setFixExplanation] = useState<string | null>(null);
  const [failedCommand, setFailedCommand] = useState<string>('');

  // Keep a ref in sync so the complete-event callback can read fixStatus without a stale closure
  const fixStatusRef = useRef<FixStatus>('idle');
  useEffect(() => { fixStatusRef.current = fixStatus; }, [fixStatus]);

  // Accumulated error output for the auto-fix request — use a ref to avoid re-renders
  const errorOutputRef = useRef('');

  // Execution timer
  const [elapsed, setElapsed] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (runStatus === 'running') {
      startedAtRef.current = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - (startedAtRef.current ?? Date.now())) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [runStatus]);

  function formatElapsed(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  // Load desktop path as default output dir once on mount
  useEffect(() => {
    window.electronAPI.app.getDesktopPath().then((p) => {
      setOutputDir((prev) => prev || p);
    });
  }, []);

  // Reset all state when the workflow prop changes (tab switch)
  useEffect(() => {
    setCurrentWorkflow(workflow);
    setValues(initValues(workflow));
    setErrors({});
    setRunStatus('idle');
    setOutputFiles([]);
    setFixStatus('idle');
    setFixedTemplate(null);
    setFixExplanation(null);
    setFailedCommand('');
    errorOutputRef.current = '';
    setBatchMode(false);
    setBatchFiles([]);
    setBatchProgress(null);
    setFillInput('');
    setFillStatus('idle');
    setShowAdvanced(false);
  }, [workflow.id]);

  // Capture stderr/system lines for the auto-fix request
  useEffect(() => {
    return window.electronAPI.on.log((event) => {
      if (event.stream === 'stderr' || event.stream === 'system') {
        errorOutputRef.current += event.line + '\n';
      }
    });
  }, []);

  // Forward streamed logs to App.tsx
  useLogEvents(onLog);

  // Handle execution complete
  useCompleteEvent(
    useCallback(
      (event: ExecCompleteEvent) => {
        if (event.exitCode === 0) {
          setOutputFiles(event.outputFiles);
          setRunStatus('done');
          // If this was a successful re-run after accepting a fix, prompt to save
          if (fixStatusRef.current === 'rerunning') {
            setFixStatus('save-prompt');
          }
          onLog({
            stream: 'system',
            line: currentWorkflow.execute.successMessage ?? `Done! Output: ${event.outputFiles.join(', ') || '(none)'}`,
            timestamp: Date.now(),
          });
        } else {
          setRunStatus('error');
          // If the fix attempt also failed, reset fix state so user can try again
          if (fixStatusRef.current === 'rerunning') {
            setFixStatus('idle');
          }
          onLog({
            stream: 'system',
            line: `Process exited with code ${event.exitCode}. ${event.error ?? ''}`,
            timestamp: Date.now(),
          });
        }
        onRunComplete?.();
      },
      [currentWorkflow, onLog, onRunComplete],
    ),
  );

  function handleChange(stepId: string, value: unknown) {
    setValues((prev) => ({ ...prev, [stepId]: value }));
    if (errors[stepId]) {
      setErrors((prev) => { const e = { ...prev }; delete e[stepId]; return e; });
    }
  }

  function validate(wf: Workflow = currentWorkflow): boolean {
    const newErrors: Record<string, string> = {};

    for (const step of wf.steps) {
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

  // Batch mode helpers
  const batchFileStep = currentWorkflow.steps.find((s) => s.type === 'file_input' && !s.multiple);
  const batchEligible = !!batchFileStep;

  async function handleAddBatchFiles() {
    const result = await window.electronAPI.files.pick({
      title: 'Select files to process',
      properties: ['openFile', 'multiSelections'],
    });
    if (!result.canceled) {
      setBatchFiles((prev) => [...prev, ...result.filePaths.filter((f) => !prev.includes(f))]);
    }
  }

  async function handleBatchRun() {
    if (!batchFiles.length || !batchFileStep) return;
    if (!outputDir) { setOutputDirError('Please select an output folder'); return; }
    setOutputDirError('');
    onClearLogs();
    setOutputFiles([]);
    setRunStatus('running');
    setBatchProgress({ current: 0, total: batchFiles.length });
    errorOutputRef.current = '';

    const allOutputFiles: string[] = [];
    for (let i = 0; i < batchFiles.length; i++) {
      const file = batchFiles[i];
      const filename = file.split('/').pop() ?? file;
      onLog({ stream: 'system', line: `--- File ${i + 1}/${batchFiles.length}: ${filename} ---`, timestamp: Date.now() });

      const completePromise = new Promise<ExecCompleteEvent>((resolve) => {
        const cleanup = window.electronAPI.on.complete((event) => { cleanup(); resolve(event); });
      });

      const response = await window.electronAPI.exec.schemaRun({
        workflow: currentWorkflow,
        dockerImage: schema.dockerImage,
        dockerfilePath: schema.dockerfilePath,
        inputs: { ...values, [batchFileStep.id]: file },
        outputDir,
        projectId,
      });
      if (!response.ok) {
        onLog({ stream: 'system', line: `Failed to start: ${response.error ?? 'unknown'}`, timestamp: Date.now() });
        continue;
      }
      const result = await completePromise;
      allOutputFiles.push(...result.outputFiles);
      setBatchProgress({ current: i + 1, total: batchFiles.length });
    }

    setOutputFiles(allOutputFiles);
    setRunStatus('done');
    setBatchProgress(null);
    onRunComplete?.();
  }

  // Natural language form fill
  async function handleFormFill() {
    if (!fillInput.trim() || !projectId) return;
    setFillStatus('loading');
    const res = await window.electronAPI.projects.fillForm({
      description: fillInput,
      workflow: currentWorkflow,
      projectId,
    });
    if (!res.ok || !res.values) {
      setFillStatus('error');
      setTimeout(() => setFillStatus('idle'), 2000);
      return;
    }
    const fileStepIds = new Set(
      currentWorkflow.steps.filter((s) => s.type === 'file_input' || s.type === 'directory_input').map((s) => s.id),
    );
    setValues((prev) => {
      const merged = { ...prev };
      for (const [k, v] of Object.entries(res.values!)) {
        if (!fileStepIds.has(k)) merged[k] = v;
      }
      return merged;
    });
    setFillStatus('done');
    setTimeout(() => setFillStatus('idle'), 2000);
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

  async function handleRun(workflowOverride?: Workflow) {
    const wf = workflowOverride ?? currentWorkflow;
    if (!validate(wf)) return;
    if (!outputDir) {
      setOutputDirError('Please select an output folder');
      return;
    }
    setOutputDirError('');

    onClearLogs();
    setOutputFiles([]);
    setRunStatus('running');
    // Reset error capture buffer for this new run
    errorOutputRef.current = '';
    // Capture command for potential auto-fix request
    setFailedCommand(buildPreview(wf, values));

    const response = await window.electronAPI.exec.schemaRun({
      workflow: wf,
      dockerImage: schema.dockerImage,
      dockerfilePath: schema.dockerfilePath,
      inputs: values,
      outputDir,
      projectId,
    });

    if (!response.ok && runStatus !== 'error') {
      setRunStatus('error');
    }
  }

  async function handleAutofix() {
    setFixStatus('thinking');

    const res = await window.electronAPI.exec.autofix({
      workflow: currentWorkflow,
      failedCommand,
      errorOutput: errorOutputRef.current.slice(-1500),
    });

    if (!res.ok || !res.template || !res.explanation) {
      setFixStatus('idle');
      onLog({
        stream: 'system',
        line: `Auto-fix failed: ${res.error ?? 'No suggestion returned.'}`,
        timestamp: Date.now(),
      });
      return;
    }

    setFixedTemplate(res.template);
    setFixExplanation(res.explanation);
    setFixStatus('ready');
  }

  async function handleAcceptFix() {
    if (!fixedTemplate) return;

    const updatedWorkflow: Workflow = {
      ...currentWorkflow,
      execute: { ...currentWorkflow.execute, command: fixedTemplate },
    };
    setCurrentWorkflow(updatedWorkflow);
    setFixStatus('rerunning');
    await handleRun(updatedWorkflow);
  }

  function handleDismissFix() {
    setFixStatus('idle');
    setFixedTemplate(null);
    setFixExplanation(null);
  }

  async function handleSaveFix() {
    // Build the updated full schema, replacing this workflow's execute.command
    const updatedSchema: UISchema = {
      ...schema,
      workflows: schema.workflows.map((w) =>
        w.id === currentWorkflow.id ? currentWorkflow : w,
      ),
    };

    const res = await window.electronAPI.schema.save({ schema: updatedSchema });

    if (res.ok && res.saved) {
      onLog({ stream: 'system', line: 'Fix saved to schema cache.', timestamp: Date.now() });
    } else if (res.ok && !res.saved) {
      onLog({ stream: 'system', line: 'Fix applied in memory (schema is not cached — no file to update).', timestamp: Date.now() });
    } else {
      onLog({ stream: 'system', line: `Could not save fix: ${res.error ?? 'unknown error'}`, timestamp: Date.now() });
    }

    setFixStatus('idle');
  }

  const busy = runStatus === 'running' || fixStatus === 'thinking' || fixStatus === 'rerunning';
  const commandPreview = buildPreview(currentWorkflow, values);

  const hasAdvancedSteps = currentWorkflow.steps.some((s) => s.advanced);

  const visibleSteps = currentWorkflow.steps.filter((step) => {
    if (!step.showIf) return true;
    const { stepId, equals } = step.showIf;
    return values[stepId] === equals;
  }).filter((step) => {
    // In batch mode, hide the batch file step (we show a custom list UI instead)
    if (batchMode && batchFileStep && step.id === batchFileStep.id) return false;
    return true;
  }).filter((step) => {
    // Hide advanced steps unless the user has expanded them
    if (step.advanced && !showAdvanced) return false;
    return true;
  });

  return (
    <div style={styles.container}>
      {/* Workflow header */}
      <div style={styles.header}>
        <h2 style={styles.name}>{currentWorkflow.name}</h2>
        <p style={styles.description}>{currentWorkflow.description}</p>
      </div>

      {/* Guidance box */}
      {currentWorkflow.guidance && (
        <div style={styles.guidance}>
          <span style={styles.guidanceIcon}>💡</span>
          {currentWorkflow.guidance}
        </div>
      )}

      {/* Natural language form fill */}
      {projectId && (
        <div style={styles.fillRow}>
          <input
            type="text"
            placeholder="Describe what you want… (e.g. convert to 720p MP4)"
            value={fillInput}
            onChange={(e) => setFillInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleFormFill(); }}
            style={styles.fillInput}
            disabled={fillStatus === 'loading'}
          />
          <button
            type="button"
            style={{
              ...styles.fillBtn,
              background: fillStatus === 'done' ? 'var(--green)' : fillStatus === 'error' ? 'var(--red)' : 'var(--surface-2)',
              color: fillStatus === 'done' || fillStatus === 'error' ? '#fff' : 'var(--text)',
            }}
            onClick={handleFormFill}
            disabled={fillStatus === 'loading' || !fillInput.trim()}
          >
            {fillStatus === 'loading' ? '…' : fillStatus === 'done' ? '✓ Filled' : fillStatus === 'error' ? '✗' : 'Auto-fill'}
          </button>
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

      {/* Advanced options toggle */}
      {hasAdvancedSteps && (
        <button
          type="button"
          style={styles.advancedToggle}
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? '▴ Hide advanced options' : '▾ Show advanced options'}
        </button>
      )}

      {/* Batch file list */}
      {batchMode && batchFileStep && (
        <div style={styles.batchSection}>
          <div style={styles.batchHeader}>
            <span style={styles.batchLabel}>{batchFileStep.label} — {batchFiles.length} file{batchFiles.length !== 1 ? 's' : ''}</span>
            <button type="button" style={styles.batchAddBtn} onClick={handleAddBatchFiles}>
              + Add Files
            </button>
          </div>
          {batchFiles.length > 0 && (
            <div style={styles.batchFileList}>
              {batchFiles.map((f) => (
                <div key={f} style={styles.batchFileRow}>
                  <span style={styles.batchFileName}>{f.split('/').pop()}</span>
                  <button
                    type="button"
                    style={styles.batchRemoveBtn}
                    onClick={() => setBatchFiles((prev) => prev.filter((x) => x !== f))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {batchProgress && (
            <div style={styles.batchProgressText}>
              Processing {batchProgress.current}/{batchProgress.total}…
            </div>
          )}
        </div>
      )}

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
        {batchEligible && (
          <button
            type="button"
            style={{
              ...styles.batchToggle,
              background: batchMode ? 'var(--accent-dim)' : 'transparent',
              color: batchMode ? 'var(--accent)' : 'var(--text-muted)',
              borderColor: batchMode ? 'var(--accent)' : 'var(--border)',
            }}
            onClick={() => setBatchMode((m) => !m)}
            disabled={busy}
            title="Process multiple files in sequence"
          >
            Batch
          </button>
        )}
        <button
          type="button"
          style={{
            ...styles.runBtn,
            background: runStatus === 'done' ? 'var(--green)' : 'var(--accent)',
            opacity: busy ? 0.7 : 1,
          }}
          onClick={() => batchMode ? handleBatchRun() : handleRun()}
          disabled={busy || (batchMode && batchFiles.length === 0)}
        >
          {(fixStatus === 'thinking') && '🔍 Analyzing error…'}
          {(fixStatus === 'rerunning') && '⏳ Re-running with fix…'}
          {(fixStatus !== 'thinking' && fixStatus !== 'rerunning') && (
            <>
              {busy && `⏳ Running… ${formatElapsed(elapsed)}`}
              {!busy && runStatus === 'idle' && (batchMode ? `▶ Run Batch (${batchFiles.length} file${batchFiles.length !== 1 ? 's' : ''})` : '▶ Run')}
              {!busy && runStatus === 'done' && `✓ Done (${formatElapsed(elapsed)}) — Run Again`}
              {!busy && runStatus === 'error' && '✗ Error — Retry'}
            </>
          )}
        </button>

        {busy && fixStatus !== 'thinking' && fixStatus !== 'rerunning' && (
          <button
            type="button"
            style={styles.stopBtn}
            onClick={() => window.electronAPI.exec.cancel()}
          >
            ■ Stop
          </button>
        )}
      </div>

      {/* Auto-fix button — shown after an error, when not already fixing */}
      {runStatus === 'error' && fixStatus === 'idle' && (
        <button type="button" style={styles.autofixBtn} onClick={handleAutofix}>
          🔧 Auto-fix with AI
        </button>
      )}

      {/* Fix suggestion card */}
      {fixStatus === 'ready' && fixedTemplate && (
        <div style={styles.fixCard}>
          <div style={styles.fixTitle}>Suggested fix</div>
          {fixExplanation && (
            <div style={styles.fixExplanation}>&ldquo;{fixExplanation}&rdquo;</div>
          )}
          <div style={styles.fixDiff}>
            <div style={styles.fixDiffRow}>
              <span style={styles.fixLabel}>Before</span>
              <code style={{ ...styles.fixCode, color: 'var(--red)' }}>
                {currentWorkflow.execute.command}
              </code>
            </div>
            <div style={styles.fixDiffRow}>
              <span style={styles.fixLabel}>After</span>
              <code style={{ ...styles.fixCode, color: 'var(--green)' }}>
                {fixedTemplate}
              </code>
            </div>
          </div>
          <div style={styles.fixActions}>
            <button type="button" style={styles.acceptBtn} onClick={handleAcceptFix}>
              Accept &amp; Re-run
            </button>
            <button type="button" style={styles.dismissBtn} onClick={handleDismissFix}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Save-fix prompt — shown after a successful re-run with a fix */}
      {fixStatus === 'save-prompt' && (
        <div style={styles.savePrompt}>
          <span>💾 Save this fix so future runs use the corrected command?</span>
          <div style={styles.savePromptActions}>
            <button type="button" style={styles.saveBtn} onClick={handleSaveFix}>
              Save
            </button>
            <button type="button" style={styles.dismissBtn} onClick={() => setFixStatus('idle')}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Command preview */}
      <CommandPreview command={commandPreview} />

      {/* Estimated duration */}
      {currentWorkflow.execute.estimatedDuration && (
        <div style={styles.estimate}>
          Estimated: {currentWorkflow.execute.estimatedDuration}
        </div>
      )}

      {/* Output files */}
      {outputFiles.length > 0 && (
        <div style={styles.outputSection}>
          <div style={styles.outputTitle}>Output files</div>
          {outputFiles.map((f) => (
            <FileCard key={f} filePath={f} />
          ))}
          {outputFiles.length > 1 && (
            <button
              type="button"
              style={styles.openFolderBtn}
              onClick={() => window.electronAPI.files.showInFinder(outputFiles[0])}
            >
              Open Output Folder
            </button>
          )}
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
    color: 'var(--bg)', fontWeight: 700, fontSize: 15,
    padding: '12px 24px', cursor: 'pointer', letterSpacing: '-0.01em',
  },
  stopBtn: {
    border: '1px solid var(--red)', borderRadius: 10,
    background: 'transparent', color: 'var(--red)',
    fontWeight: 700, fontSize: 14, padding: '12px 20px', cursor: 'pointer',
  },
  autofixBtn: {
    border: '1px solid var(--border)',
    borderRadius: 10, background: 'var(--surface-2)',
    color: 'var(--text)', fontWeight: 600, fontSize: 14,
    padding: '10px 20px', cursor: 'pointer', textAlign: 'center',
  },
  // Fix card
  fixCard: {
    display: 'flex', flexDirection: 'column', gap: 12,
    padding: '14px 16px',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
  },
  fixTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text)' },
  fixExplanation: { fontSize: 13, color: 'var(--text)', fontStyle: 'italic' },
  fixDiff: { display: 'flex', flexDirection: 'column', gap: 8 },
  fixDiffRow: { display: 'flex', alignItems: 'baseline', gap: 10 },
  fixLabel: {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
    textTransform: 'uppercase', color: 'var(--text-muted)',
    flexShrink: 0, width: 42,
  },
  fixCode: {
    fontFamily: 'var(--font-mono)', fontSize: 12,
    wordBreak: 'break-all', lineHeight: 1.5,
  },
  fixActions: { display: 'flex', gap: 8 },
  acceptBtn: {
    border: 'none', borderRadius: 8,
    background: 'var(--accent)', color: 'var(--bg)',
    fontWeight: 700, fontSize: 13, padding: '8px 16px', cursor: 'pointer',
  },
  dismissBtn: {
    border: '1px solid var(--border)', borderRadius: 8,
    background: 'transparent', color: 'var(--text-muted)',
    fontWeight: 600, fontSize: 13, padding: '8px 16px', cursor: 'pointer',
  },
  // Save prompt
  savePrompt: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, flexWrap: 'wrap',
    padding: '10px 14px',
    background: 'rgba(52, 211, 153, 0.06)',
    border: '1px solid rgba(52, 211, 153, 0.3)',
    borderRadius: 10, fontSize: 13, color: 'var(--text)',
  },
  savePromptActions: { display: 'flex', gap: 8, flexShrink: 0 },
  saveBtn: {
    border: 'none', borderRadius: 8,
    background: 'var(--green)', color: '#fff',
    fontWeight: 700, fontSize: 13, padding: '6px 14px', cursor: 'pointer',
  },
  estimate: {
    fontSize: 12, color: 'var(--text-muted)',
    fontStyle: 'italic', textAlign: 'center',
  },
  advancedToggle: {
    background: 'transparent', border: 'none',
    color: 'var(--text-muted)', fontSize: 12,
    padding: '2px 0', cursor: 'pointer', textAlign: 'left',
    letterSpacing: '0.01em',
  },
  outputSection: { display: 'flex', flexDirection: 'column', gap: 8 },
  outputTitle: {
    fontSize: 12, fontWeight: 600, letterSpacing: '0.05em',
    textTransform: 'uppercase', color: 'var(--text-muted)',
  },
  openFolderBtn: {
    background: 'transparent', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text-muted)', fontSize: 12,
    padding: '7px 14px', cursor: 'pointer', textAlign: 'center',
  },
  // Form fill
  fillRow: { display: 'flex', gap: 8, alignItems: 'center' },
  fillInput: {
    flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text)', fontSize: 13, padding: '8px 12px',
    outline: 'none',
  },
  fillBtn: {
    border: '1px solid var(--border)', borderRadius: 8,
    fontWeight: 600, fontSize: 13, padding: '8px 14px', cursor: 'pointer',
    flexShrink: 0, transition: 'background 0.2s',
  },
  // Batch mode
  batchToggle: {
    border: '1px solid', borderRadius: 10,
    fontWeight: 600, fontSize: 13, padding: '12px 16px', cursor: 'pointer',
    flexShrink: 0, transition: 'background 0.2s, color 0.2s',
  },
  batchSection: {
    display: 'flex', flexDirection: 'column', gap: 8,
    padding: '12px 14px',
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 10,
  },
  batchHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  batchLabel: { fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  batchAddBtn: {
    border: '1px solid var(--border)', borderRadius: 8,
    background: 'transparent', color: 'var(--text-muted)',
    fontSize: 12, padding: '4px 10px', cursor: 'pointer',
  },
  batchFileList: { display: 'flex', flexDirection: 'column', gap: 4 },
  batchFileRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  batchFileName: {
    fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-mono)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  batchRemoveBtn: {
    background: 'transparent', border: 'none', color: 'var(--text-muted)',
    fontSize: 14, cursor: 'pointer', padding: '0 4px', flexShrink: 0,
  },
  batchProgressText: { fontSize: 12, color: 'var(--accent)', fontStyle: 'italic' },
};
