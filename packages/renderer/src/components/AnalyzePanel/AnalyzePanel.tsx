import { useState, useCallback } from 'react';

interface AnalyzePanelProps {
  /** Called when the user clicks Analyze with valid inputs. */
  onAnalyze: (repoDir: string, dockerImage: string) => void;
  disabled?: boolean;
}

export function AnalyzePanel({ onAnalyze, disabled }: AnalyzePanelProps) {
  const [repoDir, setRepoDir] = useState('');
  const [dockerImage, setDockerImage] = useState('');

  const handleBrowse = useCallback(async () => {
    const res = await window.electronAPI.files.pick({
      title: 'Select Repository Directory',
      properties: ['openDirectory'],
    });
    if (!res.canceled && res.filePaths[0]) {
      setRepoDir(res.filePaths[0]);
    }
  }, []);

  const handleAnalyze = useCallback(() => {
    if (!repoDir.trim() || !dockerImage.trim() || disabled) return;
    onAnalyze(repoDir.trim(), dockerImage.trim());
  }, [repoDir, dockerImage, disabled, onAnalyze]);

  const canAnalyze = repoDir.trim().length > 0 && dockerImage.trim().length > 0 && !disabled;

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div style={styles.title}>Generate UI from CLI</div>
        <div style={styles.subtitle}>
          Point at a local repo and its Docker image. GUI Bridge will analyze the tool
          and use AI to build a custom interface.
        </div>
      </div>

      {/* Repo path */}
      <div style={styles.field}>
        <label style={styles.label}>Repository path</label>
        <div style={styles.row}>
          <input
            style={styles.input}
            type="text"
            placeholder="/path/to/repo"
            value={repoDir}
            onChange={(e) => setRepoDir(e.target.value)}
            spellCheck={false}
            disabled={disabled}
          />
          <button type="button" style={styles.browseBtn} onClick={handleBrowse} disabled={disabled}>
            Browse…
          </button>
        </div>
      </div>

      {/* Docker image */}
      <div style={styles.field}>
        <label style={styles.label}>Docker image tag</label>
        <input
          style={styles.input}
          type="text"
          placeholder="e.g. gui-bridge/yt-dlp"
          value={dockerImage}
          onChange={(e) => setDockerImage(e.target.value)}
          spellCheck={false}
          disabled={disabled}
        />
      </div>

      {/* Analyze button */}
      <button
        type="button"
        style={{ ...styles.analyzeBtn, ...(!canAnalyze ? styles.analyzeBtnDisabled : {}) }}
        onClick={handleAnalyze}
        disabled={!canAnalyze}
      >
        Analyze & Generate UI
      </button>
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
  subtitle: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: {
    fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  row: { display: 'flex', gap: 8 },
  input: {
    flex: 1,
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 10px',
    fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-mono)',
    outline: 'none',
  },
  browseBtn: {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 12px',
    fontSize: 12, color: 'var(--text)', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  analyzeBtn: {
    background: 'var(--accent)', border: 'none',
    borderRadius: 8, padding: '10px 20px',
    fontSize: 13, fontWeight: 600, color: 'var(--bg)', cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  analyzeBtnDisabled: {
    background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'not-allowed',
  },
};
