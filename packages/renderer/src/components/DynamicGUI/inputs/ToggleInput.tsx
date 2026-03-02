import type { StepInputProps } from './TextInput.js';

export function ToggleInput({ step, value, onChange, error }: StepInputProps) {
  const checked = Boolean(value);

  return (
    <div style={styles.field}>
      <div style={styles.row}>
        <span style={styles.labelText}>
          {step.label}
          {step.required && <span style={styles.required}> *</span>}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(step.id, !checked)}
          style={{ ...styles.track, ...(checked ? styles.trackOn : styles.trackOff) }}
        >
          <span style={{ ...styles.thumb, ...(checked ? styles.thumbOn : styles.thumbOff) }} />
        </button>
      </div>
      {step.guidance && <div style={styles.guidance}>{step.guidance}</div>}
      {step.description && <div style={styles.description}>{step.description}</div>}
      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  labelText: { fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  required: { color: 'var(--red)' },
  track: {
    width: 40, height: 22, borderRadius: 11, border: 'none',
    position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
    padding: 0,
  },
  trackOn: { background: 'var(--accent)' },
  trackOff: { background: 'var(--border)' },
  thumb: {
    position: 'absolute', top: 3, width: 16, height: 16,
    borderRadius: '50%', background: 'white', transition: 'left 0.2s',
  },
  thumbOn: { left: 21 },
  thumbOff: { left: 3 },
  guidance: { fontSize: 12, color: 'var(--accent)', fontStyle: 'italic' },
  description: { fontSize: 12, color: 'var(--text-muted)' },
  error: { fontSize: 12, color: 'var(--red)' },
};
