import { useState } from 'react';

interface Props {
  command: string;
}

export function CommandPreview({ command }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div style={styles.container}>
      <button
        type="button"
        style={styles.toggle}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={styles.arrow}>{open ? '▾' : '▸'}</span>
        Command Preview
      </button>
      {open && (
        <pre style={styles.code}>{command || '(fill in required fields to see command)'}</pre>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    borderRadius: 8,
    border: '1px solid var(--border)',
    overflow: 'hidden',
  },
  toggle: {
    display: 'flex', alignItems: 'center', gap: 6,
    width: '100%', background: 'var(--surface-2)',
    border: 'none', color: 'var(--text-muted)', fontSize: 12,
    padding: '8px 12px', cursor: 'pointer', textAlign: 'left',
    fontWeight: 600, letterSpacing: '0.03em',
  },
  arrow: { fontSize: 10 },
  code: {
    margin: 0, padding: '10px 14px',
    background: 'var(--bg)', color: 'var(--accent)',
    fontFamily: 'var(--font-mono)', fontSize: 12,
    whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6,
  },
};
