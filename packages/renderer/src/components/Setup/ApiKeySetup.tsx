import { useState, useCallback } from 'react';

interface ApiKeySetupProps {
  onSaved: () => void;
}

export function ApiKeySetup({ onSaved }: ApiKeySetupProps) {
  const [apiKey, setApiKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useMock, setUseMock] = useState(false);

  const handleSave = useCallback(async () => {
    if (useMock) {
      await window.electronAPI.config.set({ mockMode: true });
      onSaved();
      return;
    }

    if (!apiKey.trim()) return;
    setValidating(true);
    setError(null);

    try {
      const result = await window.electronAPI.config.validateKey({ apiKey: apiKey.trim() });
      if (!result.ok) {
        setError(result.error ?? 'Invalid API key');
        return;
      }
      await window.electronAPI.config.set({ anthropicApiKey: apiKey.trim(), mockMode: false });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setValidating(false);
    }
  }, [apiKey, useMock, onSaved]);

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.title}>Anthropic API Key</div>
          <div style={styles.subtitle}>
            GUI Bridge uses Claude AI to generate a custom UI for each CLI tool.
            Enter your API key to get started.
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>API Key</label>
          <input
            style={styles.input}
            type="password"
            placeholder="sk-ant-..."
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !useMock && handleSave()}
            disabled={useMock}
            spellCheck={false}
          />
        </div>

        <div style={styles.getKeyRow}>
          <a
            href="#"
            style={styles.getKeyLink}
            onClick={e => {
              e.preventDefault();
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as any).open?.('https://console.anthropic.com/');
            }}
          >
            Get a key at console.anthropic.com →
          </a>
        </div>

        {error && (
          <div style={styles.errorBox}>
            <span style={styles.errorText}>{error}</span>
          </div>
        )}

        <div style={styles.mockRow}>
          <label style={styles.mockLabel}>
            <input
              type="checkbox"
              checked={useMock}
              onChange={e => setUseMock(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Use demo mode (no API key needed — returns a basic schema)
          </label>
        </div>

        <button
          type="button"
          style={{
            ...styles.saveBtn,
            ...(!useMock && !apiKey.trim() ? styles.saveBtnDisabled : {}),
          }}
          disabled={validating || (!useMock && !apiKey.trim())}
          onClick={handleSave}
        >
          {validating ? 'Validating…' : useMock ? 'Use Demo Mode' : 'Save & Continue'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100,
  },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: 28,
    width: 400,
    display: 'flex', flexDirection: 'column', gap: 16,
    boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
  },
  header: { display: 'flex', flexDirection: 'column', gap: 6 },
  title: { fontSize: 15, fontWeight: 700, color: 'var(--text)' },
  subtitle: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: {
    fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  input: {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '9px 11px',
    fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-mono)',
    outline: 'none',
  },
  getKeyRow: { display: 'flex' },
  getKeyLink: {
    fontSize: 11, color: 'var(--accent)', textDecoration: 'none',
  },
  errorBox: {
    background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)',
    borderRadius: 8, padding: '8px 12px',
  },
  errorText: { fontSize: 11, color: 'var(--red)' },
  mockRow: { display: 'flex', alignItems: 'center' },
  mockLabel: { fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' },
  saveBtn: {
    background: 'var(--accent)', border: 'none',
    borderRadius: 8, padding: '10px 20px',
    fontSize: 13, fontWeight: 600, color: 'var(--bg)', cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  saveBtnDisabled: {
    background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'not-allowed',
  },
};
