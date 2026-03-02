import type { StepInputProps } from './TextInput.js';

export function Dropdown({ step, value, onChange, error }: StepInputProps) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>
        {step.label}
        {step.required && <span style={styles.required}> *</span>}
      </label>
      {step.guidance && <div style={styles.guidance}>{step.guidance}</div>}
      {step.description && <div style={styles.description}>{step.description}</div>}
      <select
        style={{ ...styles.select, ...(error ? styles.selectError : {}) }}
        value={value ?? ''}
        onChange={(e) => onChange(step.id, e.target.value)}
      >
        {!step.required && <option value="">— select —</option>}
        {step.options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
            {opt.description ? ` — ${opt.description}` : ''}
          </option>
        ))}
      </select>
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
  select: {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text)', fontSize: 13,
    padding: '8px 12px', outline: 'none', cursor: 'pointer',
  },
  selectError: { borderColor: 'var(--red)' },
  error: { fontSize: 12, color: 'var(--red)' },
};
