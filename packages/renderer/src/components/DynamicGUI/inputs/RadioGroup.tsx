import type { StepInputProps } from './TextInput.js';

export function RadioGroup({ step, value, onChange, error }: StepInputProps) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>
        {step.label}
        {step.required && <span style={styles.required}> *</span>}
      </label>
      {step.guidance && <div style={styles.guidance}>{step.guidance}</div>}
      {step.description && <div style={styles.description}>{step.description}</div>}
      <div style={styles.options}>
        {step.options?.map((opt) => (
          <label key={opt.value} style={styles.option}>
            <input
              type="radio"
              name={step.id}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(step.id, opt.value)}
              style={styles.radio}
            />
            <span>
              <span style={styles.optLabel}>{opt.label}</span>
              {opt.description && (
                <span style={styles.optDesc}> — {opt.description}</span>
              )}
            </span>
          </label>
        ))}
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
  options: { display: 'flex', flexDirection: 'column', gap: 6 },
  option: {
    display: 'flex', alignItems: 'center', gap: 8,
    cursor: 'pointer', fontSize: 13, color: 'var(--text)',
  },
  radio: { accentColor: 'var(--accent)' },
  optLabel: { color: 'var(--text)' },
  optDesc: { color: 'var(--text-muted)', fontSize: 12 },
  error: { fontSize: 12, color: 'var(--red)' },
};
