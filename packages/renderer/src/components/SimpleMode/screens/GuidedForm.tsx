import { useState, useEffect, useRef, useCallback } from 'react';
import type { UISchema, Step, ExecLogEvent, ExecCompleteEvent } from '@gui-bridge/shared';
import { DragDropFile } from '../components/DragDropFile.js';

interface Props {
  schema: UISchema;
  projectId: string;
  schemaSource?: string;
  onResult: (outputFiles: string[], logs: ExecLogEvent[]) => void;
  onBack: () => void;
}

type RunState = 'idle' | 'running' | 'error';

export function GuidedForm({ schema, projectId, schemaSource, onResult, onBack }: Props) {
  const workflow = schema.workflows[0]; // Simple mode always uses the first workflow
  const visibleSteps = workflow.steps.filter((s) => !s.advanced);

  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [animating, setAnimating] = useState(false);
  const [runState, setRunState] = useState<RunState>('idle');
  const [runError, setRunError] = useState('');
  const [logs, setLogs] = useState<ExecLogEvent[]>([]);
  const [showErrorLogs, setShowErrorLogs] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentStep = visibleSteps[stepIndex];
  const isLast = stepIndex === visibleSteps.length - 1;
  const totalSteps = visibleSteps.length;

  // Focus text inputs on step change
  useEffect(() => {
    if (inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [stepIndex]);

  function goNext() {
    if (animating) return;
    if (isLast) { handleRun(); return; }
    setDirection('forward');
    setAnimating(true);
    setTimeout(() => {
      setStepIndex((i) => i + 1);
      setAnimating(false);
    }, 200);
  }

  function goBack() {
    if (animating || stepIndex === 0) return;
    setDirection('back');
    setAnimating(true);
    setTimeout(() => {
      setStepIndex((i) => i - 1);
      setAnimating(false);
    }, 200);
  }

  function setValue(stepId: string, val: unknown) {
    setValues((prev) => ({ ...prev, [stepId]: val }));
  }

  function canAdvance(): boolean {
    if (!currentStep) return false;
    if (!currentStep.required) return true;
    const val = values[currentStep.id];
    if (currentStep.type === 'file_input') {
      return Array.isArray(val) ? val.length > 0 : !!val;
    }
    return val !== undefined && val !== '' && val !== null;
  }

  async function handleRun() {
    setRunState('running');
    setRunError('');
    setLogs([]);
    setElapsed(0);

    const startTime = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 500);

    const logsCollected: ExecLogEvent[] = [];

    const cleanupLog = window.electronAPI.on.log((event) => {
      logsCollected.push(event);
      setLogs((prev) => [...prev, event]);
    });

    const cleanupComplete = window.electronAPI.on.complete((event: ExecCompleteEvent) => {
      if (timerRef.current) clearInterval(timerRef.current);
      cleanupLog();
      cleanupComplete();

      if (event.exitCode === 0) {
        onResult(event.outputFiles, logsCollected);
      } else {
        setRunState('error');
        setRunError(event.error ?? `Process exited with code ${event.exitCode}`);
      }
    });

    try {
      const desktopPath = await window.electronAPI.app.getDesktopPath();
      const res = await window.electronAPI.exec.schemaRun({
        workflow,
        dockerImage: schema.dockerImage,
        dockerfilePath: schema.dockerfilePath,
        inputs: values,
        outputDir: desktopPath,
        projectId,
      });

      if (!res.ok) {
        if (timerRef.current) clearInterval(timerRef.current);
        cleanupLog();
        cleanupComplete();
        setRunState('error');
        setRunError(res.error ?? 'Failed to start');
      }
    } catch (err) {
      if (timerRef.current) clearInterval(timerRef.current);
      cleanupLog();
      cleanupComplete();
      setRunState('error');
      setRunError(err instanceof Error ? err.message : String(err));
    }
  }

  const handleRetry = useCallback(() => {
    setRunState('idle');
    setRunError('');
    setShowErrorLogs(false);
    setLogs([]);
  }, []);

  // Running overlay
  if (runState === 'running') {
    return (
      <div style={styles.root}>
        <div style={styles.runningOverlay}>
          <div style={styles.runningDots}>
            <span style={{ ...styles.runDot, animationDelay: '0ms' }} />
            <span style={{ ...styles.runDot, animationDelay: '200ms' }} />
            <span style={{ ...styles.runDot, animationDelay: '400ms' }} />
          </div>
          <div style={styles.runningTitle}>Running…</div>
          <div style={styles.runningElapsed}>{elapsed}s</div>
          <div style={styles.runningLog}>
            {logs.slice(-3).map((l, i) => (
              <div key={i} style={{ ...styles.logLine, opacity: i === logs.slice(-3).length - 1 ? 1 : 0.4 }}>
                {l.line.slice(0, 80)}
              </div>
            ))}
          </div>
          <button type="button" style={styles.cancelBtn} onClick={() => window.electronAPI.exec.cancel()}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Error state
  if (runState === 'error') {
    return (
      <div style={styles.root}>
        <div style={styles.errorOverlay}>
          <div style={styles.errorIcon}>⚠️</div>
          <div style={styles.errorTitle}>Something went wrong</div>
          <div style={styles.errorMsg}>{runError}</div>
          <div style={styles.btnRow}>
            <button type="button" style={styles.primaryBtn} onClick={handleRetry}>Try again</button>
            <button type="button" style={styles.secondaryBtn} onClick={onBack}>Go home</button>
          </div>
          {logs.length > 0 && (
            <>
              <button
                type="button"
                style={styles.logsToggle}
                onClick={() => setShowErrorLogs((v) => !v)}
              >
                {showErrorLogs ? 'Hide' : 'Show'} logs ({logs.length})
              </button>
              {showErrorLogs && (
                <div style={styles.logsPanel}>
                  {logs.map((l, i) => (
                    <div
                      key={i}
                      style={{
                        ...styles.logLine,
                        color: l.stream === 'stderr' ? 'var(--red)' : 'var(--text)',
                      }}
                    >
                      {l.line}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  if (!currentStep) return null;

  const slideStyle: React.CSSProperties = animating
    ? {
        opacity: 0,
        transform: direction === 'forward' ? 'translateX(-20px)' : 'translateX(20px)',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
      }
    : {
        opacity: 1,
        transform: 'translateX(0)',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
      };

  return (
    <div style={styles.root}>
      <div style={styles.content}>
        {/* Header */}
        <div style={styles.header}>
          <button type="button" style={styles.backBtn} onClick={stepIndex > 0 ? goBack : onBack}>
            ←
          </button>
          <div style={styles.toolName}>{schema.projectName}</div>
          {schemaSource === 'registry' && (
            <span style={styles.communityBadge} title="Schema sourced from the community registry">
              Community template
            </span>
          )}
          <div style={{ flex: 1 }} />
        </div>

        {/* Progress dots */}
        <div style={styles.progressDots}>
          {visibleSteps.map((_, i) => (
            <div
              key={i}
              style={{
                ...styles.dot,
                background: i <= stepIndex ? 'var(--accent)' : 'var(--border)',
                width: i === stepIndex ? 20 : 8,
              }}
            />
          ))}
        </div>

        {/* Step card */}
        <div style={{ ...styles.stepCard, ...slideStyle }}>
          <div style={styles.stepMeta}>
            {stepIndex + 1} / {totalSteps}
          </div>
          <div style={styles.stepLabel}>{currentStep.label}</div>
          {currentStep.description && (
            <div style={styles.stepDesc}>{currentStep.description}</div>
          )}

          <div style={styles.inputArea}>
            <StepInput
              step={currentStep}
              value={values[currentStep.id]}
              onChange={(val) => setValue(currentStep.id, val)}
              onEnter={canAdvance() ? goNext : undefined}
              inputRef={inputRef}
            />
          </div>

          {/* Action row */}
          <div style={styles.actionRow}>
            <button
              type="button"
              style={{ ...styles.nextBtn, opacity: canAdvance() ? 1 : 0.4 }}
              onClick={goNext}
              disabled={!canAdvance()}
            >
              {isLast ? 'Run →' : 'Next →'}
            </button>
            {!currentStep.required && !isLast && (
              <button type="button" style={styles.skipBtn} onClick={goNext}>
                Skip
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Per-step input renderer ────────────────────────────────────────────────────

interface StepInputProps {
  step: Step;
  value: unknown;
  onChange: (val: unknown) => void;
  onEnter?: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

function StepInput({ step, value, onChange, onEnter, inputRef }: StepInputProps) {
  if (step.type === 'file_input') {
    const paths = Array.isArray(value) ? value as string[] : value ? [value as string] : [];
    return (
      <DragDropFile
        multiple={step.multiple}
        accept={step.accept}
        value={paths}
        onChange={(newPaths) => onChange(step.multiple ? newPaths : newPaths[0])}
        label={step.label}
        description={step.description}
      />
    );
  }

  if (step.type === 'dropdown' && step.options) {
    return (
      <div style={styles.optionGrid}>
        {step.options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            style={{
              ...styles.optionBtn,
              borderColor: value === opt.value ? 'var(--accent)' : 'var(--border)',
              background: value === opt.value ? 'rgba(var(--accent-rgb),0.08)' : 'var(--surface)',
            }}
            onClick={() => { onChange(opt.value); }}
          >
            <div style={styles.optionLabel}>{opt.label}</div>
            {opt.description && <div style={styles.optionDesc}>{opt.description}</div>}
          </button>
        ))}
      </div>
    );
  }

  if (step.type === 'radio' && step.options) {
    return (
      <div style={styles.optionGrid}>
        {step.options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            style={{
              ...styles.optionBtn,
              borderColor: value === opt.value ? 'var(--accent)' : 'var(--border)',
              background: value === opt.value ? 'rgba(var(--accent-rgb),0.08)' : 'var(--surface)',
            }}
            onClick={() => { onChange(opt.value); }}
          >
            <div style={styles.optionLabel}>{opt.label}</div>
          </button>
        ))}
      </div>
    );
  }

  if (step.type === 'toggle' || step.type === 'checkbox') {
    const checked = value === true || value === 'true';
    return (
      <div style={styles.toggleRow}>
        <button
          type="button"
          style={{ ...styles.toggleBtn, background: checked ? 'var(--accent)' : 'var(--border)' }}
          onClick={() => onChange(!checked)}
        >
          <div style={{ ...styles.toggleThumb, transform: checked ? 'translateX(22px)' : 'translateX(2px)' }} />
        </button>
        <span style={styles.toggleLabel}>{checked ? 'Yes' : 'No'}</span>
      </div>
    );
  }

  if (step.type === 'textarea') {
    return (
      <textarea
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={step.placeholder ?? ''}
        style={styles.textarea}
        rows={4}
      />
    );
  }

  if (step.type === 'number') {
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="number"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={step.placeholder ?? ''}
        min={step.min}
        max={step.max}
        step={step.step}
        style={styles.textInput}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      />
    );
  }

  // Default: text input
  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type="text"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={step.placeholder ?? ''}
      style={styles.textInput}
      onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
    />
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px' },
  content: { width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 24 },
  header: { display: 'flex', alignItems: 'center', gap: 12 },
  backBtn: {
    background: 'transparent', border: 'none',
    color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', padding: '4px 6px',
    fontFamily: 'inherit',
  },
  toolName: { fontSize: 14, fontWeight: 700, color: 'var(--text)' },
  communityBadge: {
    fontSize: 10, fontWeight: 700, padding: '2px 8px',
    background: 'rgba(139,92,246,0.12)', color: '#8b5cf6',
    borderRadius: 10, border: '1px solid rgba(139,92,246,0.25)',
    whiteSpace: 'nowrap' as const,
  },
  progressDots: { display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'center' },
  dot: { height: 6, borderRadius: 3, background: 'var(--border)', transition: 'all 0.3s ease' },
  stepCard: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 16, padding: '28px 28px 24px',
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  stepMeta: { fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em' },
  stepLabel: { fontSize: 20, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 },
  stepDesc: { fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: -6 },
  inputArea: { marginTop: 4 },
  actionRow: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 },
  nextBtn: {
    padding: '11px 24px', borderRadius: 10, border: 'none',
    background: 'var(--accent)', color: 'var(--bg)',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
    transition: 'opacity 0.2s',
    fontFamily: 'inherit',
  },
  skipBtn: {
    background: 'transparent', border: 'none',
    color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  textInput: {
    width: '100%', padding: '13px 16px',
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 10, color: 'var(--text)', fontSize: 15,
    outline: 'none', boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
  },
  textarea: {
    width: '100%', padding: '13px 16px',
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 10, color: 'var(--text)', fontSize: 14,
    outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
  },
  optionGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: 8 },
  optionBtn: {
    flex: '1 1 auto', minWidth: 100,
    padding: '10px 14px', borderRadius: 10,
    border: '1px solid', background: 'var(--surface)',
    cursor: 'pointer', textAlign: 'left' as const,
    transition: 'border-color 0.15s, background 0.15s',
    fontFamily: 'inherit',
  },
  optionLabel: { fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  optionDesc: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
  toggleRow: { display: 'flex', alignItems: 'center', gap: 12 },
  toggleBtn: {
    width: 48, height: 26, borderRadius: 13, border: 'none',
    cursor: 'pointer', position: 'relative' as const,
    transition: 'background 0.2s',
    flexShrink: 0,
  },
  toggleThumb: {
    position: 'absolute' as const, top: 3, width: 20, height: 20,
    borderRadius: '50%', background: 'white',
    transition: 'transform 0.2s ease',
  },
  toggleLabel: { fontSize: 14, color: 'var(--text)' },
  // Running overlay
  runningOverlay: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
    textAlign: 'center' as const,
  },
  runningDots: { display: 'flex', gap: 8 },
  runDot: {
    width: 12, height: 12, borderRadius: '50%', background: 'var(--accent)',
    animation: 'bounce 1.2s infinite', display: 'inline-block',
  },
  runningTitle: { fontSize: 20, fontWeight: 700, color: 'var(--text)' },
  runningElapsed: { fontSize: 13, color: 'var(--text-muted)' },
  runningLog: {
    width: '100%', maxWidth: 400,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '10px 12px',
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  logLine: { fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const },
  cancelBtn: {
    background: 'transparent', border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: '6px 14px',
    fontFamily: 'inherit',
  },
  // Error overlay
  errorOverlay: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
    textAlign: 'center' as const, width: '100%', maxWidth: 480,
  },
  errorIcon: { fontSize: 40 },
  errorTitle: { fontSize: 20, fontWeight: 700, color: 'var(--text)' },
  errorMsg: {
    fontSize: 12, color: 'var(--text-muted)', maxWidth: 360,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '10px 14px', fontFamily: 'var(--font-mono)',
    lineHeight: 1.6,
  },
  btnRow: { display: 'flex', gap: 10 },
  logsToggle: {
    background: 'transparent', border: 'none',
    color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
    textDecoration: 'underline', fontFamily: 'inherit',
  },
  logsPanel: {
    width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '10px 12px', maxHeight: 220, overflowY: 'auto' as const,
    display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' as const,
  },
  primaryBtn: {
    padding: '10px 20px', borderRadius: 10, border: 'none',
    background: 'var(--accent)', color: 'var(--bg)',
    fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  secondaryBtn: {
    padding: '10px 20px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'transparent',
    color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  },
};
