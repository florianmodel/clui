import type { StepInputProps } from './TextInput.js';

export function DirectoryInput({ step, value, onChange, error }: StepInputProps) {
  async function pick() {
    const result = await window.electronAPI.files.pick({
      title: `Select ${step.label}`,
      properties: ['openDirectory'],
    });
    if (!result.canceled && result.filePaths[0]) {
      onChange(step.id, result.filePaths[0]);
    }
  }

  const displayValue = value ? String(value).replace(/^\/Users\/[^/]+/, '~') : null;

  return (
    <div style={styles.field}>
      <label style={styles.label}>
        {step.label}
        {step.required && <span style={styles.required}> *</span>}
      </label>
      {step.guidance && <div style={styles.guidance}>{step.guidance}</div>}
      {step.description && <div style={styles.description}>{step.description}</div>}
      <div style={styles.row}>
        <button
          type="button"
          style={{ ...styles.btn, ...(error ? styles.btnError : {}) }}
          onClick={pick}
        >
          Choose folder…
        </button>
        {displayValue ? (
          <span style={styles.dirPath}>{displayValue}</span>
        ) : (
          <span style={styles.placeholder}>No folder selected</span>
        )}
      </div>
      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  required: { color: 'var(--red)' },
  guidance: { fontSize: 12, color: 'var(--accent)', fontStyle: 'italic' },
  description: { fontSize: 12, color: 'var(--text-muted)' },
  row: { display: 'flex', alignItems: 'center', gap: 10 },
  btn: {
    background: 'transparent', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text)', fontSize: 13,
    padding: '7px 14px', cursor: 'pointer', flexShrink: 0,
  },
  btnError: { borderColor: 'var(--red)' },
  dirPath: {
    fontSize: 12, color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  placeholder: { fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' },
  error: { fontSize: 12, color: 'var(--red)' },
};
