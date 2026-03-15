import { useState, useEffect } from 'react';
import type { AppConfig } from '@gui-bridge/shared';

interface Props {
  onClose: () => void;
  onSwitchToClassic: () => void;
}

type Provider = 'anthropic' | 'openai';
type KeyState = 'idle' | 'validating' | 'valid' | 'invalid';

export function SimpleSettings({ onClose, onSwitchToClassic }: Props) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [keyState, setKeyState] = useState<KeyState>('idle');
  const [keyError, setKeyError] = useState('');
  const [dockerStatus, setDockerStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadConfig();
    checkDocker();
  }, []);

  async function loadConfig() {
    const res = await window.electronAPI.config.get();
    setConfig(res.config);
    const prov = (res.config.llmProvider as Provider) ?? 'anthropic';
    setProvider(prov);
    // Show masked hint if key exists but don't expose it
    const hasKey = prov === 'anthropic' ? !!res.config.anthropicApiKey : !!res.config.openaiApiKey;
    if (hasKey) {
      setApiKey(''); // keep blank — user only edits if they want to change
      setKeyState('valid');
    }
  }

  async function checkDocker() {
    const res = await window.electronAPI.docker.checkHealth();
    setDockerStatus(res.ok ? 'ok' : 'error');
  }

  async function handleSaveKey() {
    const trimmed = apiKey.trim();
    if (!trimmed) return;

    setKeyState('validating');
    setKeyError('');

    const res = await window.electronAPI.config.validateKey({ apiKey: trimmed, provider });
    if (!res.ok) {
      setKeyState('invalid');
      setKeyError(res.error ?? 'Invalid key');
      return;
    }

    // Save to config
    const update: Partial<AppConfig> = { llmProvider: provider };
    if (provider === 'anthropic') update.anthropicApiKey = trimmed;
    else update.openaiApiKey = trimmed;

    await window.electronAPI.config.set(update as Parameters<typeof window.electronAPI.config.set>[0]);
    setKeyState('valid');
    setApiKey('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    loadConfig();
  }

  function handleProviderChange(p: Provider) {
    setProvider(p);
    setApiKey('');
    setKeyState('idle');
    setKeyError('');
  }

  function openKeyDocs() {
    const url = provider === 'anthropic'
      ? 'https://console.anthropic.com/settings/keys'
      : 'https://platform.openai.com/api-keys';
    window.electronAPI.files.showInFinder(url).catch(() => {
      // fallback: just open as URL via shell
    });
  }

  const existingProvider = (config?.llmProvider as Provider) ?? 'anthropic';
  const hasAnthropicKey = !!config?.anthropicApiKey;
  const hasOpenAIKey = !!config?.openaiApiKey;

  return (
    <>
      {/* Backdrop */}
      <div style={styles.backdrop} onClick={onClose} />

      {/* Modal */}
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.title}>Settings</div>
          <button type="button" style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.body}>
          {/* API Key section */}
          <section style={styles.section}>
            <div style={styles.sectionTitle}>AI Provider</div>

            {/* Provider toggle */}
            <div style={styles.providerRow}>
              <button
                type="button"
                style={{ ...styles.providerBtn, ...(provider === 'anthropic' ? styles.providerBtnActive : {}) }}
                onClick={() => handleProviderChange('anthropic')}
              >
                <span style={styles.providerIcon}>🟣</span>
                Anthropic
                {hasAnthropicKey && provider !== 'anthropic' && <span style={styles.keyIndicator}>●</span>}
              </button>
              <button
                type="button"
                style={{ ...styles.providerBtn, ...(provider === 'openai' ? styles.providerBtnActive : {}) }}
                onClick={() => handleProviderChange('openai')}
              >
                <span style={styles.providerIcon}>🟢</span>
                OpenAI
                {hasOpenAIKey && provider !== 'openai' && <span style={styles.keyIndicator}>●</span>}
              </button>
            </div>

            {/* Current key status */}
            {keyState !== 'validating' && (
              <div style={styles.keyStatus}>
                {keyState === 'valid' ? (
                  <span style={styles.keyStatusOk}>
                    ✓ {provider === existingProvider && (hasAnthropicKey || hasOpenAIKey) ? 'API key configured' : 'Key verified'}
                  </span>
                ) : keyState === 'invalid' ? (
                  <span style={styles.keyStatusErr}>✕ {keyError}</span>
                ) : (
                  <span style={styles.keyStatusNone}>
                    {provider === 'anthropic' && !hasAnthropicKey && 'No Anthropic key set'}
                    {provider === 'openai' && !hasOpenAIKey && 'No OpenAI key set'}
                    {provider === 'anthropic' && hasAnthropicKey && 'Anthropic key configured'}
                    {provider === 'openai' && hasOpenAIKey && 'OpenAI key configured'}
                  </span>
                )}
              </div>
            )}

            {/* Key input */}
            <div style={styles.keyRow}>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setKeyState('idle'); }}
                placeholder={
                  provider === 'anthropic'
                    ? (hasAnthropicKey ? 'Enter new key to replace…' : 'sk-ant-api03-…')
                    : (hasOpenAIKey ? 'Enter new key to replace…' : 'sk-proj-…')
                }
                style={styles.keyInput}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
              />
              <button
                type="button"
                style={{
                  ...styles.saveKeyBtn,
                  opacity: apiKey.trim() ? 1 : 0.5,
                  background: saved ? 'var(--green)' : 'var(--accent)',
                }}
                disabled={!apiKey.trim() || keyState === 'validating'}
                onClick={handleSaveKey}
              >
                {keyState === 'validating' ? '…' : saved ? '✓' : 'Save'}
              </button>
            </div>

            <button type="button" style={styles.getKeyLink} onClick={openKeyDocs}>
              Get a {provider === 'anthropic' ? 'Claude' : 'ChatGPT'} API key →
            </button>
          </section>

          {/* Docker status */}
          <section style={styles.section}>
            <div style={styles.sectionTitle}>Docker</div>
            <div style={styles.dockerRow}>
              <div style={{
                ...styles.dockerDot,
                background: dockerStatus === 'ok' ? 'var(--green)' : dockerStatus === 'error' ? 'var(--red)' : '#888',
              }} />
              <span style={styles.dockerLabel}>
                {dockerStatus === 'checking' ? 'Checking…' : dockerStatus === 'ok' ? 'Docker is running' : 'Docker is not running'}
              </span>
              {dockerStatus === 'error' && (
                <button
                  type="button"
                  style={styles.dockerOpenBtn}
                  onClick={() => window.electronAPI.files.open('/Applications/Docker.app')}
                >
                  Start Docker →
                </button>
              )}
              {dockerStatus !== 'checking' && (
                <button type="button" style={styles.refreshBtn} onClick={checkDocker}>↺</button>
              )}
            </div>
          </section>

          {/* Mode */}
          <section style={styles.section}>
            <div style={styles.sectionTitle}>Interface</div>
            <button
              type="button"
              style={styles.classicBtn}
              onClick={onSwitchToClassic}
            >
              Switch to Classic mode
            </button>
            <div style={styles.classicNote}>Classic mode gives you the full interface with GitHub search, schema editor, and advanced controls.</div>
          </section>
        </div>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed' as const, inset: 0,
    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
    zIndex: 2000,
  },
  modal: {
    position: 'fixed' as const,
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 420, maxHeight: '80vh',
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
    zIndex: 2001,
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 20px', borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  title: { fontSize: 16, fontWeight: 700, color: 'var(--text)' },
  closeBtn: {
    background: 'transparent', border: 'none',
    color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer',
    width: 28, height: 28, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'inherit',
  },
  body: {
    overflowY: 'auto' as const, padding: '20px',
    display: 'flex', flexDirection: 'column', gap: 24,
  },
  section: { display: 'flex', flexDirection: 'column', gap: 10 },
  sectionTitle: {
    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase' as const, letterSpacing: '0.08em',
  },
  providerRow: { display: 'flex', gap: 8 },
  providerBtn: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '8px 12px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
    fontFamily: 'inherit', transition: 'all 0.15s',
    position: 'relative' as const,
  },
  providerBtnActive: {
    borderColor: 'var(--accent)', background: 'rgba(var(--accent-rgb), 0.08)',
    color: 'var(--text)',
  },
  providerIcon: { fontSize: 14 },
  keyIndicator: {
    position: 'absolute' as const, top: 6, right: 8,
    fontSize: 8, color: 'var(--green)',
  },
  keyStatus: { fontSize: 12, minHeight: 18 },
  keyStatusOk: { color: 'var(--green)' },
  keyStatusErr: { color: 'var(--red)' },
  keyStatusNone: { color: 'var(--text-muted)' },
  keyRow: { display: 'flex', gap: 8 },
  keyInput: {
    flex: 1, padding: '9px 12px',
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text)', fontSize: 13,
    outline: 'none', fontFamily: 'monospace',
  },
  saveKeyBtn: {
    padding: '9px 16px', borderRadius: 8, border: 'none',
    color: 'var(--bg)', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
    transition: 'background 0.2s, opacity 0.15s',
  },
  getKeyLink: {
    background: 'transparent', border: 'none',
    color: 'var(--accent)', fontSize: 12, cursor: 'pointer',
    fontFamily: 'inherit', textAlign: 'left' as const,
    padding: 0, textDecoration: 'underline',
  },
  dockerRow: { display: 'flex', alignItems: 'center', gap: 8 },
  dockerDot: {
    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
  },
  dockerLabel: { fontSize: 13, color: 'var(--text)', flex: 1 },
  dockerOpenBtn: {
    padding: '4px 10px', borderRadius: 6, border: 'none',
    background: 'var(--accent)', color: 'var(--bg)',
    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  refreshBtn: {
    background: 'transparent', border: 'none',
    color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  classicBtn: {
    padding: '10px 16px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text)', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
    textAlign: 'left' as const, width: '100%',
  },
  classicNote: {
    fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5,
  },
};
