import type { StepInputProps } from './TextInput.js';

export function CheckboxInput({ step, value, onChange, error }: StepInputProps) {
  return (
    <div style={styles.field}>
      <label style={styles.checkLabel}>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(step.id, e.target.checked)}
          style={styles.checkbox}
        />
        <span style={styles.labelText}>
          {step.label}
          {step.required && <span style={styles.required}> *</span>}
        </span>
      </label>
      {step.guidance && <div style={styles.guidance}>{step.guidance}</div>}
      {step.description && <div style={styles.description}>{step.description}</div>}
      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  checkLabel: {
    display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
  },
  checkbox: { accentColor: 'var(--accent)', width: 16, height: 16 },
  labelText: { fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  required: { color: 'var(--red)' },
  guidance: { fontSize: 12, color: 'var(--accent)', fontStyle: 'italic' },
  description: { fontSize: 12, color: 'var(--text-muted)' },
  error: { fontSize: 12, color: 'var(--red)' },
};
