import type { StepInputProps } from './TextInput.js';

export function FileInput({ step, value, onChange, error }: StepInputProps) {
  // Accept filter: ".mp4,.avi" → extensions without leading dots
  const extensions = step.accept
    ? step.accept.split(',').map((e) => e.trim().replace(/^\./, ''))
    : [];

  async function pick() {
    const result = await window.electronAPI.files.pick({
      title: `Select ${step.label}`,
      filters: extensions.length
        ? [{ name: step.label, extensions }]
        : undefined,
      properties: step.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    });
    if (!result.canceled) {
      onChange(step.id, step.multiple ? result.filePaths : result.filePaths[0] ?? null);
    }
  }

  const displayValue = step.multiple
    ? (Array.isArray(value) ? value : value ? [value] : [])
        .map((p: string) => p.split('/').pop())
        .join(', ')
    : value
    ? String(value).split('/').pop()
    : null;

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
          Browse…
        </button>
        {displayValue ? (
          <span style={styles.fileName}>{displayValue}</span>
        ) : (
          <span style={styles.placeholder}>No file selected</span>
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
  fileName: {
    fontSize: 13, color: 'var(--accent)',
    fontFamily: 'var(--font-mono)', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  placeholder: { fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' },
  error: { fontSize: 12, color: 'var(--red)' },
};
