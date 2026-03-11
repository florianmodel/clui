import { useState, useEffect } from 'react';
import type { SearchResult } from '@gui-bridge/shared';

interface Props {
  onComplete: () => void;
  onInstall?: (result: SearchResult) => void;
}

type Step = 'welcome' | 'docker' | 'apikey' | 'first-project';

const SUGGESTED_TOOLS: SearchResult[] = [
  { owner: 'yt-dlp', repo: 'yt-dlp', fullName: 'yt-dlp/yt-dlp', description: 'A feature-rich command-line audio/video downloader', stars: 90000, language: 'Python', topics: ['youtube', 'downloader'], lastUpdated: '2024-01-01', htmlUrl: 'https://github.com/yt-dlp/yt-dlp' },
  { owner: 'ImageMagick', repo: 'ImageMagick', fullName: 'ImageMagick/ImageMagick', description: 'Create, edit, compose, or convert digital images', stars: 12000, language: 'C', topics: ['image', 'convert'], lastUpdated: '2024-01-01', htmlUrl: 'https://github.com/ImageMagick/ImageMagick' },
  { owner: 'jgm', repo: 'pandoc', fullName: 'jgm/pandoc', description: 'Universal markup converter', stars: 33000, language: 'Haskell', topics: ['document', 'convert'], lastUpdated: '2024-01-01', htmlUrl: 'https://github.com/jgm/pandoc' },
  { owner: 'FFmpeg', repo: 'FFmpeg', fullName: 'FFmpeg/FFmpeg', description: 'Mirror of the FFmpeg main repository', stars: 42000, language: 'C', topics: ['video', 'audio'], lastUpdated: '2024-01-01', htmlUrl: 'https://github.com/FFmpeg/FFmpeg' },
];

const TOOL_META: Record<string, { icon: string; desc: string }> = {
  'yt-dlp': { icon: '🎬', desc: 'Download videos from YouTube and more' },
  'ImageMagick': { icon: '🖼️', desc: 'Edit and convert images' },
  'pandoc': { icon: '📄', desc: 'Convert documents between formats' },
  'FFmpeg': { icon: '🎵', desc: 'Convert and process audio/video' },
};

export function Onboarding({ onComplete, onInstall }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [dockerStatus, setDockerStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.electronAPI.docker.checkHealth().then((res) => {
      setDockerStatus(res.ok ? 'ok' : 'error');
    });
  }, []);

  async function completeOnboarding() {
    await window.electronAPI.config.set({ onboardingComplete: true });
    onComplete();
  }

  async function handleSaveKey() {
    if (!apiKey.trim()) { setStep('first-project'); return; }
    setSaving(true);
    await window.electronAPI.config.set({ anthropicApiKey: apiKey.trim() });
    setSaving(false);
    setStep('first-project');
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {step === 'welcome' && <WelcomeStep onNext={() => setStep('docker')} />}
        {step === 'docker' && (
          <DockerStep
            status={dockerStatus}
            onRecheck={() => {
              setDockerStatus('checking');
              window.electronAPI.docker.checkHealth().then((r) =>
                setDockerStatus(r.ok ? 'ok' : 'error'),
              );
            }}
            onNext={() => setStep('apikey')}
          />
        )}
        {step === 'apikey' && (
          <ApiKeyStep
            apiKey={apiKey}
            onChange={setApiKey}
            saving={saving}
            onNext={handleSaveKey}
            onSkip={() => setStep('first-project')}
          />
        )}
        {step === 'first-project' && (
          <FirstProjectStep
            onDone={completeOnboarding}
            onInstall={onInstall ? async (result) => { await completeOnboarding(); onInstall(result); } : undefined}
          />
        )}
      </div>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div style={styles.step}>
      <div style={styles.bigIcon}>🌉</div>
      <h1 style={styles.heading}>Welcome to GUI Bridge</h1>
      <p style={styles.body}>
        Turn any command-line tool from GitHub into a simple point-and-click app.
        Let&rsquo;s get you set up — it only takes a minute.
      </p>
      <button type="button" style={styles.primaryBtn} onClick={onNext}>
        Get Started →
      </button>
    </div>
  );
}

function DockerStep({
  status,
  onRecheck,
  onNext,
}: {
  status: 'checking' | 'ok' | 'error';
  onRecheck: () => void;
  onNext: () => void;
}) {
  return (
    <div style={styles.step}>
      <div style={styles.stepLabel}>Step 1 of 3</div>
      <h2 style={styles.heading}>Docker</h2>
      <p style={styles.body}>
        GUI Bridge uses Docker to run tools safely in isolated containers.
      </p>

      <div style={styles.statusBox}>
        {status === 'checking' && <><span>⏳</span> Checking Docker…</>}
        {status === 'ok' && <><span style={{ color: 'var(--green)' }}>✓</span> Docker is running</>}
        {status === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div><span style={{ color: 'var(--red)' }}>✗</span> Docker not detected</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Download it at <strong>docker.com/get-started</strong>, then click Recheck.
            </div>
            <button type="button" style={styles.secondaryBtn} onClick={onRecheck}>
              Recheck
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        style={{ ...styles.primaryBtn, opacity: status === 'checking' ? 0.5 : 1 }}
        onClick={onNext}
        disabled={status === 'checking'}
      >
        Next →
      </button>
    </div>
  );
}

function ApiKeyStep({
  apiKey,
  onChange,
  saving,
  onNext,
  onSkip,
}: {
  apiKey: string;
  onChange: (v: string) => void;
  saving: boolean;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div style={styles.step}>
      <div style={styles.stepLabel}>Step 2 of 3</div>
      <h2 style={styles.heading}>AI Features <span style={{ fontWeight: 400, fontSize: 16 }}>(Optional)</span></h2>
      <p style={styles.body}>
        GUI Bridge can automatically create interfaces for any CLI tool using AI.
        This requires an Anthropic API key.
      </p>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => onChange(e.target.value)}
        placeholder="sk-ant-api03-…"
        style={styles.input}
        autoFocus
      />
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Get one free at <strong>console.anthropic.com</strong>
      </div>
      <div style={styles.rowBtns}>
        <button type="button" style={styles.secondaryBtn} onClick={onSkip}>
          Skip for now
        </button>
        <button type="button" style={styles.primaryBtn} onClick={onNext} disabled={saving}>
          {saving ? 'Saving…' : 'Next →'}
        </button>
      </div>
    </div>
  );
}

function FirstProjectStep({
  onDone,
  onInstall,
}: {
  onDone: () => void;
  onInstall?: (result: SearchResult) => void;
}) {
  return (
    <div style={styles.step}>
      <div style={styles.stepLabel}>Step 3 of 3</div>
      <h2 style={styles.heading}>You&rsquo;re all set!</h2>
      <p style={styles.body}>
        Install one of these popular tools, or browse GitHub yourself.
      </p>
      <div style={styles.toolGrid}>
        {SUGGESTED_TOOLS.map((t) => {
          const meta = TOOL_META[t.repo] ?? { icon: '📦', desc: t.description };
          return (
            <button
              key={t.repo}
              type="button"
              style={styles.toolCard}
              onClick={() => onInstall?.(t)}
              disabled={!onInstall}
              title={onInstall ? `Install ${t.repo}` : undefined}
            >
              <span style={styles.toolIcon}>{meta.icon}</span>
              <div style={{ flex: 1, textAlign: 'left' as const }}>
                <div style={styles.toolName}>{t.repo}</div>
                <div style={styles.toolDesc}>{meta.desc}</div>
              </div>
              {onInstall && <span style={styles.installArrow}>→</span>}
            </button>
          );
        })}
      </div>
      <button type="button" style={styles.primaryBtn} onClick={onDone}>
        Start browsing →
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(15,12,41,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: 40, width: 480, maxWidth: '90vw',
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  },
  step: { display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'flex-start' },
  bigIcon: { fontSize: 48 },
  stepLabel: { fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' },
  heading: { fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 },
  body: { fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 },
  statusBox: {
    width: '100%', padding: '14px 18px',
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 10, fontSize: 14, color: 'var(--text)',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  input: {
    width: '100%', background: 'var(--surface-2)',
    border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--text)', fontSize: 13, padding: '10px 14px',
    fontFamily: 'var(--font-mono)', outline: 'none',
    boxSizing: 'border-box' as const,
  },
  primaryBtn: {
    border: 'none', borderRadius: 10,
    background: 'var(--accent)', color: '#0f0c29',
    fontWeight: 700, fontSize: 14, padding: '11px 24px',
    cursor: 'pointer', alignSelf: 'flex-end',
  },
  secondaryBtn: {
    border: '1px solid var(--border)', borderRadius: 10,
    background: 'transparent', color: 'var(--text-muted)',
    fontWeight: 600, fontSize: 13, padding: '10px 18px', cursor: 'pointer',
  },
  rowBtns: { display: 'flex', gap: 10, width: '100%', justifyContent: 'flex-end' },
  toolGrid: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%' },
  toolCard: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 14px', background: 'var(--surface-2)',
    border: '1px solid var(--border)', borderRadius: 10,
    cursor: 'pointer', width: '100%',
    transition: 'border-color 0.15s, background 0.15s',
  },
  toolIcon: { fontSize: 22, flexShrink: 0 },
  toolName: { fontSize: 13, fontWeight: 700, color: 'var(--text)' },
  toolDesc: { fontSize: 12, color: 'var(--text-muted)' },
  installArrow: { fontSize: 14, color: 'var(--accent)', flexShrink: 0 },
};
