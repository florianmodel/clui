import { useState, useEffect } from 'react';
import type { InstallProgressEvent } from '@gui-bridge/shared';

const STAGE_LABELS: Record<string, string> = {
  cloning:    'Downloading tool…',
  detecting:  'Checking compatibility…',
  registry:   'Checking community templates…',
  installing: 'Installing on your Mac…',
  building:   'Setting up environment…',
  analyzing:  'Learning the tool…',
  generating: 'Creating your interface…',
  complete:   'All set!',
  error:      'Setup failed',
};

const STAGE_PROGRESS: Record<string, number> = {
  cloning:    10,
  detecting:  20,
  registry:   28,
  installing: 45,
  building:   55,
  analyzing:  75,
  generating: 90,
  complete:   100,
  error:      0,
};

interface Props {
  owner: string;
  repo: string;
  projectName: string;
  onComplete: (projectId: string) => void;
  onBack: () => void;
}

export function InstallingScreen({ owner, repo, projectName, onComplete, onBack }: Props) {
  const projectId = `${owner}--${repo}`;
  const [stage, setStage] = useState<string>('cloning');
  const [message, setMessage] = useState('Starting…');
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const progress = STAGE_PROGRESS[stage] ?? 50;
  const label = STAGE_LABELS[stage] ?? message;

  useEffect(() => {
    // Kick off install
    void window.electronAPI.projects.install({
      owner,
      repo,
      searchResult: {
        owner, repo,
        fullName: `${owner}/${repo}`,
        description: projectName,
        stars: 0, language: '', topics: [],
        lastUpdated: new Date().toISOString(),
        htmlUrl: `https://github.com/${owner}/${repo}`,
      },
    });

    // Subscribe to progress events
    const cleanup = window.electronAPI.on.installProgress((event: InstallProgressEvent) => {
      if (event.projectId !== projectId) return;
      setStage(event.stage);
      setMessage(event.message);

      if (event.stage === 'complete') {
        // Brief pause so user sees "All set!" before navigating
        setTimeout(() => onComplete(projectId), 800);
      } else if (event.stage === 'error') {
        setIsError(true);
        setErrorMessage(event.message);
      }
    });

    return cleanup;
  }, []);

  return (
    <div style={styles.root}>
      <div style={styles.content}>
        {/* Tool name */}
        <div style={styles.toolName}>{projectName}</div>

        {isError ? (
          <>
            <div style={styles.errorIcon}>⚠️</div>
            <div style={styles.errorTitle}>Setup failed</div>
            <div style={styles.errorDesc}>{errorMessage}</div>
            <button type="button" style={styles.backBtn} onClick={onBack}>
              ← Go back
            </button>
          </>
        ) : (
          <>
            {/* Stage label */}
            <div style={styles.stageLabel}>
              {stage === 'complete' ? '✓ ' : ''}{label}
            </div>

            {/* Progress bar */}
            <div style={styles.progressTrack}>
              <div style={{ ...styles.progressFill, width: `${progress}%` }} />
            </div>

            {/* Detail message — raw progress line */}
            <div style={styles.detailMsg}>{message}</div>

            {/* Steps */}
            <div style={styles.steps}>
              {Object.entries(STAGE_LABELS)
                .filter(([s]) => s !== 'error')
                .map(([s, lbl]) => {
                  const p = STAGE_PROGRESS[s] ?? 0;
                  const done = progress > p;
                  const active = s === stage;
                  return (
                    <div key={s} style={{
                      ...styles.step,
                      color: active ? 'var(--text)' : done ? 'var(--text-muted)' : 'var(--text-muted)',
                      opacity: done ? 0.5 : 1,
                    }}>
                      <span style={{
                        ...styles.stepDot,
                        background: active ? 'var(--accent)' : done ? 'var(--green)' : 'var(--border)',
                      }} />
                      <span style={{ fontWeight: active ? 600 : 400 }}>{lbl}</span>
                      {active && stage !== 'complete' && (
                        <span style={styles.spinner} />
                      )}
                      {done && <span style={styles.checkmark}>✓</span>}
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '40px 24px',
  },
  content: {
    width: '100%', maxWidth: 480,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
  },
  toolName: {
    fontSize: 22, fontWeight: 800, color: 'var(--text)',
    letterSpacing: '-0.02em',
  },
  stageLabel: {
    fontSize: 16, fontWeight: 600, color: 'var(--accent)',
    minHeight: 24,
  },
  progressTrack: {
    width: '100%', height: 6, borderRadius: 4,
    background: 'var(--surface-2)', overflow: 'hidden',
  },
  progressFill: {
    height: '100%', background: 'var(--accent)', borderRadius: 4,
    transition: 'width 0.6s ease',
  },
  detailMsg: {
    fontSize: 11, color: 'var(--text-muted)',
    textAlign: 'center' as const, minHeight: 16, fontFamily: 'monospace',
    maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
  },
  steps: {
    width: '100%', display: 'flex', flexDirection: 'column', gap: 10,
    marginTop: 8,
    padding: '20px 24px', background: 'var(--surface)', borderRadius: 14,
    border: '1px solid var(--border)',
  },
  step: {
    display: 'flex', alignItems: 'center', gap: 10,
    fontSize: 13, transition: 'color 0.2s',
  },
  stepDot: {
    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
    transition: 'background 0.3s',
  },
  spinner: {
    display: 'inline-block',
    width: 12, height: 12, borderRadius: '50%',
    border: '2px solid var(--border)',
    borderTopColor: 'var(--accent)',
    animation: 'spin 0.7s linear infinite',
    marginLeft: 'auto', flexShrink: 0,
  },
  checkmark: {
    marginLeft: 'auto', color: 'var(--green)', fontSize: 12, flexShrink: 0,
  },
  errorIcon: { fontSize: 48, marginTop: 8 },
  errorTitle: { fontSize: 20, fontWeight: 700, color: 'var(--text)' },
  errorDesc: {
    fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6,
    textAlign: 'center' as const, maxWidth: 360,
  },
  backBtn: {
    marginTop: 8, padding: '10px 20px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'transparent',
    color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
