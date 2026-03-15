import { useState, useEffect } from 'react';

interface Props {
  onClose?: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  uiMode?: 'simple' | 'classic';
  onToggleUiMode?: () => void;
}

export function Settings({ onClose, theme = 'dark', onToggleTheme, uiMode = 'simple', onToggleUiMode }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [maskedKey, setMaskedKey] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [validating, setValidating] = useState(false);
  const [validateMsg, setValidateMsg] = useState('');
  const [dockerVersion, setDockerVersion] = useState<string>('Checking…');

  useEffect(() => {
    window.electronAPI.config.get().then((res) => {
      setMockMode(!!res.config.mockMode);
      if (res.hasApiKey && res.config.anthropicApiKey) {
        const k = res.config.anthropicApiKey;
        setMaskedKey(`sk-ant-…${k.slice(-6)}`);
      }
    });

    window.electronAPI.docker.checkHealth().then((res) => {
      setDockerVersion(res.ok ? `Docker ${res.version ?? ''}` : 'Not running');
    });
  }, []);

  async function handleSaveKey() {
    setSaving(true);
    setSaveMsg('');
    setValidateMsg('');
    await window.electronAPI.config.set({ anthropicApiKey: apiKey.trim(), mockMode });
    const k = apiKey.trim();
    setMaskedKey(k ? `sk-ant-…${k.slice(-6)}` : '');
    setEditingKey(false);
    setApiKey('');
    setSaving(false);
    setSaveMsg('Saved!');
    setTimeout(() => setSaveMsg(''), 2000);
  }

  async function handleValidate() {
    if (!apiKey.trim()) return;
    setValidating(true);
    setValidateMsg('');
    const res = await window.electronAPI.config.validateKey({ apiKey: apiKey.trim() });
    setValidating(false);
    setValidateMsg(res.ok ? '✓ Key is valid' : `✗ ${res.error}`);
  }

  async function handleSaveMockMode(v: boolean) {
    setMockMode(v);
    await window.electronAPI.config.set({ mockMode: v });
  }

  async function openProjectsFolder() {
    const desktop = await window.electronAPI.app.getDesktopPath();
    const projectsDir = desktop.replace(/Desktop$/, '.gui-bridge/projects');
    await window.electronAPI.files.showInFinder(projectsDir);
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Settings</h2>
        {onClose && (
          <button type="button" style={styles.closeBtn} onClick={onClose}>✕</button>
        )}
      </div>

      {/* API Key */}
      <section style={styles.section}>
        <div style={styles.sectionTitle}>Anthropic API Key</div>
        <div style={styles.sectionDesc}>
          Required for AI-powered UI generation. Get yours at console.anthropic.com.
        </div>

        {!editingKey ? (
          <div style={styles.keyRow}>
            <span style={styles.keyMasked}>{maskedKey || 'No key set'}</span>
            <button type="button" style={styles.editBtn} onClick={() => setEditingKey(true)}>
              {maskedKey ? 'Change' : 'Set Key'}
            </button>
          </div>
        ) : (
          <div style={styles.keyEdit}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-api03-…"
              style={styles.keyInput}
              autoFocus
            />
            <div style={styles.keyActions}>
              <button type="button" style={styles.validateBtn} onClick={handleValidate} disabled={validating || !apiKey.trim()}>
                {validating ? 'Checking…' : 'Validate'}
              </button>
              <button type="button" style={styles.saveKeyBtn} onClick={handleSaveKey} disabled={saving || !apiKey.trim()}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" style={styles.cancelBtn} onClick={() => { setEditingKey(false); setApiKey(''); setValidateMsg(''); }}>
                Cancel
              </button>
            </div>
            {validateMsg && (
              <div style={{ ...styles.feedbackMsg, color: validateMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>
                {validateMsg}
              </div>
            )}
          </div>
        )}
        {saveMsg && <div style={{ ...styles.feedbackMsg, color: 'var(--green)' }}>{saveMsg}</div>}

        {/* Mock mode */}
        <div style={styles.mockRow}>
          <label style={styles.mockLabel}>
            <input
              type="checkbox"
              checked={mockMode}
              onChange={(e) => handleSaveMockMode(e.target.checked)}
              style={{ marginRight: 8 }}
            />
            Demo mode (no API key needed — returns a basic generated schema)
          </label>
        </div>
      </section>

      {/* Projects directory */}
      <section style={styles.section}>
        <div style={styles.sectionTitle}>Projects Directory</div>
        <div style={styles.dirRow}>
          <code style={styles.dirPath}>~/.gui-bridge/projects/</code>
          <button type="button" style={styles.editBtn} onClick={openProjectsFolder}>
            Open in Finder
          </button>
        </div>
      </section>

      {/* Docker status */}
      <section style={styles.section}>
        <div style={styles.sectionTitle}>Docker</div>
        <div style={styles.dockerStatus}>
          <span style={{
            ...styles.dockerDot,
            background: dockerVersion.startsWith('Docker') ? 'var(--green)' : 'var(--red)',
          }} />
          {dockerVersion}
        </div>
      </section>

      {/* Interface mode */}
      {onToggleUiMode && (
        <section style={styles.section}>
          <div style={styles.sectionTitle}>Interface</div>
          <div style={styles.themeRow}>
            <div>
              <span style={styles.sectionDesc}>UI style</span>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {uiMode === 'simple' ? 'Guided, step-by-step flow (default)' : 'Full classic interface with all options'}
              </div>
            </div>
            <div style={styles.themeToggle}>
              <button
                type="button"
                style={{ ...styles.themeBtn, ...(uiMode === 'simple' ? styles.themeBtnActive : {}) }}
                onClick={() => uiMode !== 'simple' && onToggleUiMode()}
              >
                Simple
              </button>
              <button
                type="button"
                style={{ ...styles.themeBtn, ...(uiMode === 'classic' ? styles.themeBtnActive : {}) }}
                onClick={() => uiMode !== 'classic' && onToggleUiMode()}
              >
                Classic
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Appearance */}
      {onToggleTheme && (
        <section style={styles.section}>
          <div style={styles.sectionTitle}>Appearance</div>
          <div style={styles.themeRow}>
            <span style={styles.sectionDesc}>Color scheme</span>
            <div style={styles.themeToggle}>
              <button
                type="button"
                style={{ ...styles.themeBtn, ...(theme === 'dark' ? styles.themeBtnActive : {}) }}
                onClick={() => theme !== 'dark' && onToggleTheme()}
              >
                Dark
              </button>
              <button
                type="button"
                style={{ ...styles.themeBtn, ...(theme === 'light' ? styles.themeBtnActive : {}) }}
                onClick={() => theme !== 'light' && onToggleTheme()}
              >
                Light
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', gap: 24,
    padding: 24, maxWidth: 520,
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 },
  closeBtn: {
    border: 'none', background: 'transparent',
    color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', padding: 4,
  },
  section: {
    display: 'flex', flexDirection: 'column', gap: 10,
    padding: '16px 18px',
    background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 10,
  },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text)' },
  sectionDesc: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 },
  keyRow: { display: 'flex', alignItems: 'center', gap: 12 },
  keyMasked: { fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text)', flex: 1 },
  editBtn: {
    border: '1px solid var(--border)', borderRadius: 6,
    background: 'transparent', color: 'var(--text)',
    fontSize: 12, padding: '5px 12px', cursor: 'pointer',
  },
  keyEdit: { display: 'flex', flexDirection: 'column', gap: 8 },
  keyInput: {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text)', fontSize: 13,
    padding: '8px 12px', fontFamily: 'var(--font-mono)',
    outline: 'none', width: '100%', boxSizing: 'border-box' as const,
  },
  keyActions: { display: 'flex', gap: 8 },
  validateBtn: {
    border: '1px solid var(--border)', borderRadius: 6,
    background: 'transparent', color: 'var(--text-muted)',
    fontSize: 12, padding: '5px 12px', cursor: 'pointer',
  },
  saveKeyBtn: {
    border: 'none', borderRadius: 6,
    background: 'var(--accent)', color: 'var(--bg)',
    fontWeight: 700, fontSize: 12, padding: '5px 14px', cursor: 'pointer',
  },
  themeRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  themeToggle: {
    display: 'flex', borderRadius: 8,
    border: '1px solid var(--border)', overflow: 'hidden',
  },
  themeBtn: {
    border: 'none', background: 'transparent',
    color: 'var(--text-muted)', fontSize: 12,
    padding: '5px 14px', cursor: 'pointer',
  },
  themeBtnActive: {
    background: 'var(--surface-2)', color: 'var(--text)', fontWeight: 600,
  },
  cancelBtn: {
    border: 'none', background: 'transparent',
    color: 'var(--text-muted)', fontSize: 12, padding: '5px 8px', cursor: 'pointer',
  },
  feedbackMsg: { fontSize: 12, fontWeight: 600 },
  mockRow: { marginTop: 4 },
  mockLabel: { display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' },
  dirRow: { display: 'flex', alignItems: 'center', gap: 12 },
  dirPath: { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', flex: 1 },
  dockerStatus: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' },
  dockerDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
};
