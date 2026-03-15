import { useState, useEffect, useRef } from 'react';
import type { ProjectMeta } from '@gui-bridge/shared';

const EXAMPLE_PROMPTS = [
  'Compress a video for the web',
  'Convert PDF pages to images',
  'Resize a batch of photos',
  'Extract audio from a video',
  'Convert between image formats',
];

// Short labels for the chips (must fit on one line)
const CHIP_PROMPTS: Array<{ label: string; intent: string }> = [
  { label: '🎬 Compress video',  intent: 'Compress a video for the web' },
  { label: '📄 PDF to images',   intent: 'Convert PDF pages to images' },
  { label: '🖼️ Resize photos',   intent: 'Resize a batch of photos' },
];

interface Props {
  installedProjects: ProjectMeta[];
  onIntent: (intent: string) => void;
  onOpenProject: (projectId: string) => void;
}

export function WelcomeScreen({ installedProjects, onIntent, onOpenProject }: Props) {
  const [input, setInput] = useState('');
  const [promptIndex, setPromptIndex] = useState(0);
  const [promptVisible, setPromptVisible] = useState(true);
  const [hoveredChip, setHoveredChip] = useState<string | null>(null);
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Rotate example prompts in placeholder
  useEffect(() => {
    const interval = setInterval(() => {
      setPromptVisible(false);
      setTimeout(() => {
        setPromptIndex((i) => (i + 1) % EXAMPLE_PROMPTS.length);
        setPromptVisible(true);
      }, 300);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit() {
    const val = input.trim();
    if (!val) return;
    onIntent(val);
  }

  function handlePromptClick(prompt: string) {
    setInput(prompt);
    inputRef.current?.focus();
  }

  const readyProjects = installedProjects.filter((p) => p.status === 'ready');

  return (
    <div style={styles.root}>
      <div style={styles.content}>
        {/* Brand */}
        <div style={styles.brand}>
          <span style={styles.brandIcon}>✦</span>
          <span style={styles.brandName}>CLUI</span>
        </div>

        {/* Headline — privacy baked into sub */}
        <div style={styles.headline}>What would you like to do?</div>

        {/* Search bar */}
        <div style={styles.searchRow}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder={`e.g. "${EXAMPLE_PROMPTS[promptIndex]}"`}
            style={{
              ...styles.searchInput,
              opacity: promptVisible ? 1 : 0.7,
            } as React.CSSProperties}
          />
          <button
            type="button"
            style={{ ...styles.searchBtn, opacity: input.trim() ? 1 : 0.4 }}
            onClick={handleSubmit}
            disabled={!input.trim()}
          >
            →
          </button>
        </div>

        {/* Privacy note — subtle, below search */}
        <div style={styles.privacyNote}>
          🔒 Runs locally · your files never leave your computer
        </div>

        {/* Example chips — 3, single row, no wrap */}
        <div style={styles.chips}>
          {CHIP_PROMPTS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              style={{
                ...styles.chip,
                ...(hoveredChip === chip.label ? styles.chipHovered : {}),
              }}
              onClick={() => handlePromptClick(chip.intent)}
              onMouseEnter={() => setHoveredChip(chip.label)}
              onMouseLeave={() => setHoveredChip(null)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Installed tools */}
        {readyProjects.length > 0 && (
          <div style={styles.toolsSection}>
            <div style={styles.toolsSectionTitle}>Your tools</div>
            <div style={styles.toolsGrid}>
              {readyProjects.slice(0, 6).map((p) => (
                <button
                  key={p.projectId}
                  type="button"
                  style={{
                    ...styles.toolCard,
                    ...(hoveredTool === p.projectId ? styles.toolCardHovered : {}),
                  }}
                  onClick={() => onOpenProject(p.projectId)}
                  onMouseEnter={() => setHoveredTool(p.projectId)}
                  onMouseLeave={() => setHoveredTool(null)}
                >
                  <span style={styles.toolIcon}>{getToolIcon(p.repo)}</span>
                  <div style={styles.toolInfo}>
                    <div style={styles.toolName}>{friendlyName(p.repo)}</div>
                    <div style={styles.toolDesc}>{truncate(p.description, 40)}</div>
                  </div>
                  <span style={{
                    ...styles.toolArrow,
                    ...(hoveredTool === p.projectId ? styles.toolArrowHovered : {}),
                  }}>→</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function friendlyName(repo: string): string {
  return repo.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(str: string, n: number): string {
  return str.length <= n ? str : str.slice(0, n).trimEnd() + '…';
}

function getToolIcon(repo: string): string {
  const r = repo.toLowerCase();
  if (r.includes('ffmpeg') || r.includes('video')) return '🎬';
  if (r.includes('image') || r.includes('magick')) return '🖼️';
  if (r.includes('pdf')) return '📄';
  if (r.includes('audio') || r.includes('mp3')) return '🎵';
  if (r.includes('yt') || r.includes('youtube')) return '📺';
  if (r.includes('pandoc') || r.includes('doc')) return '📝';
  if (r.includes('zip') || r.includes('compress')) return '📦';
  return '⚙️';
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '40px 24px',
  },
  content: {
    width: '100%', maxWidth: 540,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
  },
  brand: {
    display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4,
  },
  brandIcon: { fontSize: 22, color: 'var(--accent)' },
  brandName: { fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em' },
  headline: {
    fontSize: 28, fontWeight: 700, color: 'var(--text)',
    textAlign: 'center' as const, lineHeight: 1.2, marginBottom: 2,
  },
  searchRow: {
    display: 'flex', gap: 8, width: '100%',
  },
  searchInput: {
    flex: 1, padding: '14px 18px',
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 14, color: 'var(--text)', fontSize: 15,
    outline: 'none', transition: 'border-color 0.15s',
    fontFamily: 'inherit',
  },
  searchBtn: {
    width: 48, height: 48, borderRadius: 14, border: 'none',
    background: 'var(--accent)', color: 'var(--bg)',
    fontSize: 20, fontWeight: 700, cursor: 'pointer',
    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'opacity 0.15s',
  },
  privacyNote: {
    fontSize: 11, color: 'var(--text-muted)',
    textAlign: 'center' as const, marginTop: -4,
  },
  chips: {
    display: 'flex', gap: 8, justifyContent: 'center',
    flexWrap: 'nowrap' as const, width: '100%',
    marginTop: 4,
  },
  chip: {
    padding: '6px 14px', borderRadius: 20,
    border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
    transition: 'color 0.15s, border-color 0.15s, background 0.15s',
    fontFamily: 'inherit', whiteSpace: 'nowrap' as const,
    flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
  },
  chipHovered: {
    border: '1px solid var(--accent)',
    color: 'var(--accent)',
    background: 'rgba(var(--accent-rgb), 0.06)',
  },
  toolsSection: { width: '100%', marginTop: 8 },
  toolsSectionTitle: {
    fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase' as const, letterSpacing: '0.08em',
    marginBottom: 8, paddingLeft: 2,
  },
  toolsGrid: { display: 'flex', flexDirection: 'column', gap: 6 },
  toolCard: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 14px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--surface)',
    cursor: 'pointer', width: '100%', textAlign: 'left' as const,
    transition: 'border-color 0.15s, background 0.15s',
    fontFamily: 'inherit',
  },
  toolCardHovered: {
    border: '1px solid var(--accent)',
    background: 'var(--surface-2)',
  },
  toolIcon: { fontSize: 18, flexShrink: 0 },
  toolInfo: { flex: 1, minWidth: 0 },
  toolName: { fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  toolDesc: { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  toolArrow: {
    color: 'var(--text-muted)', fontSize: 14, flexShrink: 0,
    transition: 'color 0.15s, transform 0.15s',
  },
  toolArrowHovered: {
    color: 'var(--accent)',
    transform: 'translateX(2px)',
  },
};
