import { useState, useEffect } from 'react';

type Tab = 'docker' | 'apikey';

// macOS paths to check for Docker installation
const DOCKER_APP_PATH = '/Applications/Docker.app';

interface Props {
  needs: 'docker' | 'apikey';
  theme: 'dark' | 'light';
  onComplete: () => void;
}

export function SetupScreen({ needs, theme, onComplete }: Props) {
  const [tab, setTab] = useState<Tab>(needs);
  const [dockerStatus, setDockerStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [dockerInstalled, setDockerInstalled] = useState<boolean | null>(null); // null = unknown

  // API key state
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [validateMsg, setValidateMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    checkDocker();
    const cleanup = window.electronAPI.on.dockerStatus((ev) => {
      setDockerStatus(ev.running ? 'ok' : 'error');
      if (ev.running && tab === 'docker') setTab('apikey');
    });
    return cleanup;
  }, []);

  async function checkDocker() {
    setDockerStatus('checking');

    // Check if Docker is running
    const healthRes = await window.electronAPI.docker.checkHealth();

    if (healthRes.ok) {
      setDockerStatus('ok');
      setDockerInstalled(true);
      if (tab === 'docker') setTab('apikey');
      return;
    }

    setDockerStatus('error');

    // Detect whether Docker is installed but not running, vs not installed at all
    // Check by looking for Docker.app on macOS
    const fileRes = await window.electronAPI.files.getInfo({ filePath: DOCKER_APP_PATH });
    setDockerInstalled(fileRes.ok); // ok=true means the app exists
  }

  async function handleStartDocker() {
    // Open Docker.app — works on macOS to launch Docker Desktop
    await window.electronAPI.files.open(DOCKER_APP_PATH);
    // Start polling
    const poll = setInterval(async () => {
      const res = await window.electronAPI.docker.checkHealth();
      if (res.ok) {
        clearInterval(poll);
        setDockerStatus('ok');
        setDockerInstalled(true);
        setTab('apikey');
      }
    }, 2000);
    // Give up polling after 60s
    setTimeout(() => clearInterval(poll), 60000);
  }

  function handleDownloadDocker() {
    window.open('https://www.docker.com/products/docker-desktop/', '_blank');
  }

  async function handleValidateAndSave() {
    const key = apiKey.trim();
    if (!key) return;
    setValidating(true);
    setValidateMsg('');
    const res = await window.electronAPI.config.validateKey({ apiKey: key, provider });
    setValidating(false);
    if (!res.ok) {
      setValidateMsg(res.error ?? 'Invalid key');
      return;
    }
    setSaving(true);
    if (provider === 'anthropic') {
      await window.electronAPI.config.set({ anthropicApiKey: key, llmProvider: 'anthropic', mockMode: false });
    } else {
      await window.electronAPI.config.set({ openaiApiKey: key, llmProvider: 'openai', mockMode: false });
    }
    setSaving(false);
    onComplete();
  }

  const providerInfo = {
    anthropic: {
      name: 'Claude (Anthropic)',
      placeholder: 'sk-ant-api03-…',
      url: 'https://console.anthropic.com/settings/keys',
      steps: ['Go to console.anthropic.com', 'Create an account or sign in', 'Go to API Keys', 'Click "Create Key" and copy it'],
    },
    openai: {
      name: 'ChatGPT (OpenAI)',
      placeholder: 'sk-proj-…',
      url: 'https://platform.openai.com/api-keys',
      steps: ['Go to platform.openai.com', 'Create an account or sign in', 'Go to API Keys', 'Click "Create new secret key" and copy it'],
    },
  };

  const info = providerInfo[provider];

  // Decide docker CTA based on installed status
  function renderDockerCTA() {
    if (dockerStatus === 'checking') {
      return (
        <div style={styles.waitingMsg}>
          <span style={styles.spinner}>⟳</span> Checking Docker…
        </div>
      );
    }

    if (dockerStatus === 'ok') {
      return (
        <div style={styles.successBox}>
          <span style={styles.successIcon}>✓</span>
          <div>
            <div style={styles.successTitle}>Docker is running</div>
            <div style={styles.successSub}>You're all set</div>
          </div>
        </div>
      );
    }

    // Docker not running — show appropriate CTA
    if (dockerInstalled === true) {
      // Installed but not running
      return (
        <div style={styles.notRunningBlock}>
          <div style={styles.notRunningIcon}>🐳</div>
          <div style={styles.notRunningText}>
            <div style={styles.notRunningTitle}>Docker is installed but not running</div>
            <div style={styles.notRunningDesc}>Click below to start it — takes about 10 seconds.</div>
          </div>
          <button type="button" style={styles.primaryBtn} onClick={handleStartDocker}>
            Start Docker Desktop →
          </button>
          <div style={styles.waitingMsg}>
            <span style={styles.spinner}>⟳</span> Waiting for Docker to start…
            <button type="button" style={styles.recheckBtn} onClick={checkDocker}>
              Check again
            </button>
          </div>
        </div>
      );
    }

    if (dockerInstalled === false) {
      // Not installed
      return (
        <div style={styles.notInstalledBlock}>
          <div style={styles.tabDesc}>
            Docker lets us run tools safely on your computer. It's free and takes about 2 minutes to install.
          </div>
          <button type="button" style={styles.primaryBtn} onClick={handleDownloadDocker}>
            Download Docker Desktop →
          </button>
          <div style={styles.alreadyInstalled}>
            Already installed?{' '}
            <button type="button" style={styles.linkBtn} onClick={checkDocker}>
              Check again
            </button>
          </div>
        </div>
      );
    }

    // Still detecting — show both options
    return (
      <div style={styles.notInstalledBlock}>
        <button type="button" style={styles.primaryBtn} onClick={handleStartDocker}>
          Start Docker Desktop →
        </button>
        <button type="button" style={styles.secondaryBtn} onClick={handleDownloadDocker}>
          Download Docker Desktop
        </button>
        <button type="button" style={styles.recheckBtn} onClick={checkDocker}>
          Check again
        </button>
      </div>
    );
  }

  return (
    <div style={styles.root} data-theme={theme}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.logoRow}>
          <div style={styles.logo}>✦</div>
          <div style={styles.logoText}>CLUI</div>
        </div>
        <div style={styles.headline}>Let's get you set up</div>
        <div style={styles.sub}>Takes about 2 minutes</div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            type="button"
            style={{ ...styles.tab, ...(tab === 'docker' ? styles.tabActive : {}) }}
            onClick={() => setTab('docker')}
          >
            <span style={styles.tabNum}>{dockerStatus === 'ok' ? '✓' : '1'}</span>
            <span>Set up Docker</span>
          </button>
          <div style={styles.tabConnector} />
          <button
            type="button"
            style={{ ...styles.tab, ...(tab === 'apikey' ? styles.tabActive : {}) }}
            onClick={() => setTab('apikey')}
          >
            <span style={styles.tabNum}>2</span>
            <span>Connect AI</span>
          </button>
        </div>

        {/* Docker tab */}
        {tab === 'docker' && (
          <div style={styles.tabContent}>
            <div style={styles.tabTitle}>
              {dockerInstalled === true && dockerStatus !== 'ok'
                ? 'Start Docker'
                : dockerInstalled === false
                  ? 'Install Docker'
                  : 'Docker setup'}
            </div>

            {renderDockerCTA()}

            <button
              type="button"
              style={styles.nextBtn}
              onClick={() => setTab('apikey')}
              disabled={dockerStatus !== 'ok'}
            >
              Next →
            </button>
          </div>
        )}

        {/* API Key tab */}
        {tab === 'apikey' && (
          <div style={styles.tabContent}>
            <div style={styles.tabTitle}>Connect your AI</div>
            <div style={styles.tabDesc}>
              Choose your AI provider. Both work great.
            </div>

            {/* Provider toggle */}
            <div style={styles.providerToggle}>
              <button
                type="button"
                style={{ ...styles.providerBtn, ...(provider === 'anthropic' ? styles.providerBtnActive : {}) }}
                onClick={() => { setProvider('anthropic'); setApiKey(''); setValidateMsg(''); }}
              >
                <span style={styles.providerEmoji}>⚡</span>
                <div>
                  <div style={styles.providerName}>Claude</div>
                  <div style={styles.providerSub}>by Anthropic</div>
                </div>
              </button>
              <button
                type="button"
                style={{ ...styles.providerBtn, ...(provider === 'openai' ? styles.providerBtnActive : {}) }}
                onClick={() => { setProvider('openai'); setApiKey(''); setValidateMsg(''); }}
              >
                <span style={styles.providerEmoji}>🤖</span>
                <div>
                  <div style={styles.providerName}>ChatGPT</div>
                  <div style={styles.providerSub}>by OpenAI</div>
                </div>
              </button>
            </div>

            {/* Mini guide */}
            <div style={styles.guide}>
              <div style={styles.guideTitle}>How to get your key</div>
              {info.steps.map((step, i) => (
                <div key={i} style={styles.guideStep}>
                  <span style={styles.guideNum}>{i + 1}</span>
                  <span>{step}</span>
                </div>
              ))}
              <button
                type="button"
                style={styles.guideLink}
                onClick={() => window.open(info.url, '_blank')}
              >
                Open {info.name} →
              </button>
            </div>

            {/* Key input */}
            <input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setValidateMsg(''); }}
              placeholder={info.placeholder}
              style={styles.keyInput}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleValidateAndSave()}
            />

            {validateMsg && (
              <div style={{ ...styles.validateMsg, color: 'var(--red)' }}>
                {validateMsg}
              </div>
            )}

            <button
              type="button"
              style={styles.primaryBtn}
              onClick={handleValidateAndSave}
              disabled={!apiKey.trim() || validating || saving}
            >
              {validating ? 'Checking key…' : saving ? 'Saving…' : 'Connect & Continue →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100vh', background: 'var(--bg)',
  },
  card: {
    width: 420, display: 'flex', flexDirection: 'column', gap: 20,
    padding: '40px 36px',
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 16,
  },
  logoRow: { display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' },
  logo: { fontSize: 24, color: 'var(--accent)' },
  logoText: { fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' },
  headline: { fontSize: 22, fontWeight: 700, color: 'var(--text)', textAlign: 'center' as const, marginTop: 4 },
  sub: { fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' as const, marginTop: -12 },
  tabs: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 },
  tab: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'transparent', border: 'none',
    color: 'var(--text-muted)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
    padding: '6px 10px', borderRadius: 6, transition: 'color 0.15s',
  },
  tabActive: { color: 'var(--text)', fontWeight: 700 },
  tabConnector: { width: 20, height: 1, background: 'var(--border)', margin: '0 2px' },
  tabNum: {
    width: 18, height: 18, borderRadius: '50%',
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  tabContent: { display: 'flex', flexDirection: 'column', gap: 14 },
  tabTitle: { fontSize: 15, fontWeight: 700, color: 'var(--text)' },
  tabDesc: { fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 },
  notRunningBlock: { display: 'flex', flexDirection: 'column', gap: 12 },
  notRunningIcon: { fontSize: 32, textAlign: 'center' as const },
  notRunningText: { textAlign: 'center' as const },
  notRunningTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text)' },
  notRunningDesc: { fontSize: 12, color: 'var(--text-muted)', marginTop: 3 },
  notInstalledBlock: { display: 'flex', flexDirection: 'column', gap: 10 },
  alreadyInstalled: { fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' as const },
  linkBtn: { background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  successBox: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 14px', background: 'rgba(34,197,94,0.1)',
    border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8,
  },
  successIcon: { fontSize: 18, color: 'var(--green)' },
  successTitle: { fontSize: 13, fontWeight: 700, color: 'var(--green)' },
  successSub: { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  primaryBtn: {
    padding: '11px 20px', borderRadius: 10, border: 'none',
    background: 'var(--accent)', color: 'var(--bg)',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  secondaryBtn: {
    padding: '10px 20px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'transparent',
    color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  nextBtn: {
    padding: '11px 20px', borderRadius: 10, border: 'none',
    background: 'var(--accent)', color: 'var(--bg)',
    fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4,
  },
  waitingMsg: {
    display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 12, color: 'var(--text-muted)',
  },
  spinner: { display: 'inline-block', animation: 'spin 1s linear infinite' },
  recheckBtn: {
    background: 'transparent', border: '1px solid var(--border)',
    borderRadius: 5, color: 'var(--text-muted)', fontSize: 11,
    padding: '2px 8px', cursor: 'pointer',
  },
  providerToggle: { display: 'flex', gap: 10 },
  providerBtn: {
    flex: 1, display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--surface-2)',
    cursor: 'pointer', color: 'var(--text)', textAlign: 'left' as const,
    transition: 'border-color 0.15s',
  },
  providerBtnActive: {
    borderColor: 'var(--accent)', background: 'rgba(var(--accent-rgb),0.06)',
  },
  providerEmoji: { fontSize: 20 },
  providerName: { fontSize: 13, fontWeight: 700, color: 'var(--text)' },
  providerSub: { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  guide: {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 10, padding: '12px 14px',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  guideTitle: { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  guideStep: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text)' },
  guideNum: {
    width: 18, height: 18, borderRadius: '50%', background: 'var(--border)',
    fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  guideLink: {
    alignSelf: 'flex-start' as const, marginTop: 4,
    background: 'transparent', border: 'none',
    color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  keyInput: {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text)', fontSize: 13,
    padding: '10px 12px', fontFamily: 'var(--font-mono)',
    outline: 'none', width: '100%', boxSizing: 'border-box' as const,
  },
  validateMsg: { fontSize: 12, fontWeight: 600, marginTop: -6 },
};
