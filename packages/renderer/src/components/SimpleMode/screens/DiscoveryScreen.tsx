import { useState, useEffect } from 'react';
import type { ProjectMeta } from '@gui-bridge/shared';

// ── Curated tool list ─────────────────────────────────────────────────────────
// A hand-picked set of popular, high-quality CLI tools. Keyword arrays are used
// for local scoring — no network call needed for common searches.

interface CuratedTool {
  owner: string;
  repo: string;
  icon: string;
  description: string;
  why: string;
  keywords: string[];
}

const CURATED_TOOLS: CuratedTool[] = [
  {
    owner: 'FFmpeg', repo: 'FFmpeg',
    icon: '🎬',
    description: 'The leading multimedia framework for decoding, encoding, transcoding, muxing, streaming and filtering audio and video.',
    why: 'Industry-standard video and audio processing — handles virtually every format.',
    keywords: ['video', 'ffmpeg', 'compress', 'transcode', 'convert', 'mp4', 'mkv', 'avi', 'mov', 'h264', 'h265', 'hevc', 'encode', 'decode', 'stream', 'clip', 'trim', 'cut', 'merge', 'audio', 'mp3', 'aac', 'gif', 'webm'],
  },
  {
    owner: 'yt-dlp', repo: 'yt-dlp',
    icon: '📺',
    description: 'A youtube-dl fork with additional features and fixes for downloading videos from YouTube and thousands of sites.',
    why: 'Reliable video downloader supporting 1000+ sites including YouTube, Vimeo, Twitter.',
    keywords: ['download', 'youtube', 'video', 'yt', 'yt-dlp', 'ytdl', 'vimeo', 'twitter', 'instagram', 'tiktok', 'twitch', 'stream', 'url', 'web'],
  },
  {
    owner: 'ImageMagick', repo: 'ImageMagick',
    icon: '🖼️',
    description: 'Create, edit, compose, or convert digital images. Resize, flip, mirror, rotate, distort, shear and transform images.',
    why: 'Swiss-army knife for image processing — batch resize, convert formats, add effects.',
    keywords: ['image', 'photo', 'resize', 'convert', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'tiff', 'bmp', 'svg', 'thumbnail', 'crop', 'rotate', 'compress', 'magick', 'batch'],
  },
  {
    owner: 'openai', repo: 'whisper',
    icon: '🎤',
    description: 'Automatic speech recognition (ASR) system trained on 680,000 hours of multilingual and multitask supervised data.',
    why: 'Best-in-class transcription — turn audio/video files into accurate text or subtitles.',
    keywords: ['transcribe', 'transcription', 'speech', 'audio', 'voice', 'subtitle', 'caption', 'srt', 'whisper', 'recognize', 'recognition', 'text', 'mp3', 'wav', 'translate'],
  },
  {
    owner: 'jgm', repo: 'pandoc',
    icon: '📝',
    description: 'Universal document converter — converts between Markdown, HTML, LaTeX, Word, PDF, and many more formats.',
    why: 'The go-to tool for converting documents between any text format.',
    keywords: ['document', 'convert', 'markdown', 'html', 'pdf', 'word', 'docx', 'latex', 'epub', 'pandoc', 'text', 'rst', 'asciidoc', 'format'],
  },
  {
    owner: 'tesseract-ocr', repo: 'tesseract',
    icon: '🔍',
    description: 'An OCR engine with support for 100+ languages. Extracts text from images and scanned documents.',
    why: 'Extract readable text from images, scanned PDFs, or screenshots.',
    keywords: ['ocr', 'text', 'extract', 'scan', 'image', 'pdf', 'tesseract', 'recognize', 'recognition', 'handwriting', 'document', 'read'],
  },
  {
    owner: 'Stirling-Tools', repo: 'Stirling-PDF',
    icon: '📄',
    description: 'A powerful locally hosted web-based PDF manipulation tool. Split, merge, convert, and edit PDFs.',
    why: 'All-in-one PDF toolkit — merge, split, compress, rotate, and convert PDF files.',
    keywords: ['pdf', 'merge', 'split', 'compress', 'rotate', 'convert', 'extract', 'pages', 'watermark', 'encrypt', 'decrypt', 'password', 'document'],
  },
  {
    owner: 'py-pdf', repo: 'pypdf',
    icon: '📑',
    description: 'A pure-python PDF library capable of splitting, merging, cropping, and transforming PDF pages.',
    why: 'Simple, reliable PDF manipulation — split, merge, and extract pages easily.',
    keywords: ['pdf', 'merge', 'split', 'extract', 'pages', 'crop', 'rotate', 'python', 'pypdf'],
  },
  {
    owner: 'HandBrake', repo: 'HandBrake',
    icon: '📦',
    description: 'An open-source video transcoder. Convert videos from nearly any format to modern, widely supported codecs.',
    why: 'Excellent for compressing large video files while maintaining quality.',
    keywords: ['video', 'compress', 'transcode', 'encode', 'h264', 'h265', 'mp4', 'mkv', 'handbrake', 'reduce', 'size', 'quality', 'bluray', 'dvd'],
  },
  {
    owner: 'lovell', repo: 'sharp',
    icon: '⚡',
    description: 'High-performance Node.js image processing. Resize, convert and manipulate images — very fast.',
    why: 'Blazing-fast image resizing and format conversion — ideal for batch workflows.',
    keywords: ['image', 'resize', 'convert', 'png', 'jpg', 'jpeg', 'webp', 'avif', 'sharp', 'thumbnail', 'batch', 'optimize', 'compress'],
  },
  {
    owner: 'svg', repo: 'svgo',
    icon: '🎨',
    description: 'SVG Optimizer — a Node.js tool for optimizing SVG files by removing redundant metadata and markup.',
    why: 'Reduces SVG file sizes by up to 80% without quality loss.',
    keywords: ['svg', 'optimize', 'compress', 'minify', 'vector', 'image', 'clean', 'reduce', 'size'],
  },
  {
    owner: 'mozilla', repo: 'mozjpeg',
    icon: '🖼️',
    description: 'Mozilla JPEG encoder improvements — produces smaller JPEG files at the same visual quality.',
    why: 'Significantly reduces JPEG file sizes — great for web image optimization.',
    keywords: ['jpeg', 'jpg', 'compress', 'optimize', 'image', 'web', 'size', 'reduce', 'quality', 'mozjpeg'],
  },
  {
    owner: 'kornelski', repo: 'gifski',
    icon: '🎞️',
    description: 'GIF encoder based on pngquant — produces highest-quality GIFs from video frames.',
    why: 'Creates smooth, high-quality GIFs from video clips with small file sizes.',
    keywords: ['gif', 'animate', 'animation', 'convert', 'video', 'frames', 'gifski', 'create'],
  },
  {
    owner: 'bbc', repo: 'audiowaveform',
    icon: '🔊',
    description: 'Generate waveform data and images from audio files. Supports MP3, WAV, FLAC, OGG, OPUS.',
    why: 'Generate visual waveform images or peak data from audio files.',
    keywords: ['audio', 'waveform', 'visualize', 'mp3', 'wav', 'flac', 'ogg', 'image', 'peaks', 'sound'],
  },
  {
    owner: 'saulpw', repo: 'visidata',
    icon: '📊',
    description: 'An interactive multitool for tabular data — explore, clean, and convert CSV, JSON, Excel, and more.',
    why: 'Instantly explore and convert tabular data — CSV, JSON, Excel and 30+ formats.',
    keywords: ['data', 'csv', 'json', 'excel', 'table', 'explore', 'convert', 'clean', 'tsv', 'spreadsheet', 'filter', 'sort'],
  },
  {
    owner: 'aristocratos', repo: 'btop',
    icon: '📈',
    description: 'Resource monitor showing usage and stats for processor, memory, disks, network and processes.',
    why: 'Beautiful terminal system monitor — CPU, memory, disk and network at a glance.',
    keywords: ['monitor', 'system', 'cpu', 'memory', 'disk', 'network', 'process', 'resource', 'performance', 'stats'],
  },
  {
    owner: 'nicowillis', repo: 'croc',
    icon: '🐊',
    description: 'Easily and securely send things from one computer to another.',
    why: 'Simple, fast, and encrypted file transfer between any two computers.',
    keywords: ['transfer', 'send', 'file', 'share', 'network', 'receive', 'copy', 'croc', 'peer'],
  },
  {
    owner: 'BurntSushi', repo: 'ripgrep',
    icon: '🔎',
    description: 'A line-oriented search tool that recursively searches directories for a regex pattern. Very fast.',
    why: 'Extremely fast search across files — find text in any file, instantly.',
    keywords: ['search', 'grep', 'find', 'text', 'regex', 'files', 'directory', 'ripgrep', 'rg', 'pattern'],
  },
];

// ── Local scoring ─────────────────────────────────────────────────────────────

function findLocalMatches(intent: string): CuratedTool[] {
  const tokens = intent
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);

  if (tokens.length === 0) return [];

  const scored = CURATED_TOOLS.map((tool) => {
    let score = 0;
    const haystack = [
      tool.repo.toLowerCase(),
      tool.owner.toLowerCase(),
      tool.description.toLowerCase(),
      tool.why.toLowerCase(),
    ].join(' ');

    for (const token of tokens) {
      if (tool.keywords.includes(token)) {
        score += 4; // exact keyword match
      } else if (tool.keywords.some((k) => k.startsWith(token) || token.startsWith(k))) {
        score += 2; // partial keyword match
      }
      if (tool.repo.toLowerCase().includes(token)) {
        score += 3; // repo name match
      } else if (haystack.includes(token)) {
        score += 1; // description/why match
      }
    }
    return { tool, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.tool);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  intent: string;
  installedProjects: ProjectMeta[];
  onInstall: (owner: string, repo: string, name: string) => void;
  onOpenProject: (projectId: string) => void;
  onBack: () => void;
}

type State = 'loading' | 'results' | 'empty' | 'error';

function friendlyName(repo: string): string {
  return repo.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Unified result card data — local and LLM results share the same shape
interface ResultCard {
  owner: string;
  repo: string;
  icon: string;
  description: string;
  why: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DiscoveryScreen({ intent, installedProjects, onInstall, onOpenProject, onBack }: Props) {
  const [state, setState] = useState<State>('loading');
  const [results, setResults] = useState<ResultCard[]>([]);
  const [source, setSource] = useState<'local' | 'llm'>('local');
  const [error, setError] = useState('');
  const [installingId, setInstallingId] = useState<string | null>(null);

  useEffect(() => {
    void search();
  }, [intent]);

  async function search() {
    setState('loading');
    setResults([]);
    setError('');

    // 1. Try local curated list first — instant, no network
    const localMatches = findLocalMatches(intent);
    if (localMatches.length > 0) {
      setResults(localMatches.map((t) => ({
        owner: t.owner,
        repo: t.repo,
        icon: t.icon,
        description: t.description,
        why: t.why,
      })));
      setSource('local');
      setState('results');
      return;
    }

    // 2. Fall back to LLM-powered GitHub recommendation
    try {
      const res = await window.electronAPI.github.recommend({ description: intent });
      if (!res.ok || !res.repos || res.repos.length === 0) {
        setState('empty');
        return;
      }
      setResults(res.repos.slice(0, 3).map((s) => ({
        owner: s.owner,
        repo: s.repo,
        icon: getIconForRepo(s.repo),
        description: s.description,
        why: s.why,
      })));
      setSource('llm');
      setState('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setState('error');
    }
  }

  function handleUse(card: ResultCard) {
    const projectId = `${card.owner}--${card.repo}`;
    const existing = installedProjects.find((p) => p.projectId === projectId);

    if (existing?.status === 'ready') {
      onOpenProject(projectId);
      return;
    }

    setInstallingId(projectId);
    onInstall(card.owner, card.repo, friendlyName(card.repo));
  }

  return (
    <div style={styles.root}>
      <div style={styles.content}>
        {/* Back + intent display */}
        <div style={styles.topRow}>
          <button type="button" style={styles.backBtn} onClick={onBack}>← Back</button>
          <div style={styles.intentBubble}>"{intent}"</div>
        </div>

        {state === 'loading' && (
          <div style={styles.loadingBlock}>
            <div style={styles.loadingDots}>
              <span style={{ ...styles.dot, animationDelay: '0ms' }} />
              <span style={{ ...styles.dot, animationDelay: '200ms' }} />
              <span style={{ ...styles.dot, animationDelay: '400ms' }} />
            </div>
            <div style={styles.loadingText}>Finding the right tool for you…</div>
          </div>
        )}

        {state === 'results' && (
          <>
            <div style={styles.sectionTitle}>
              {source === 'llm' ? 'AI suggestion' : 'Best matches'}
            </div>
            <div style={styles.cards}>
              {results.map((card) => {
                const projectId = `${card.owner}--${card.repo}`;
                const existing = installedProjects.find((p) => p.projectId === projectId);
                const isInstalled = existing?.status === 'ready';
                const isInstalling = installingId === projectId;

                return (
                  <div key={projectId} style={styles.card}>
                    <div style={styles.cardHeader}>
                      <span style={styles.cardIcon}>{card.icon}</span>
                      <div style={styles.cardMeta}>
                        <div style={styles.cardName}>{friendlyName(card.repo)}</div>
                        <div style={styles.cardSlug}>{card.owner}/{card.repo}</div>
                      </div>
                      {isInstalled && <span style={styles.installedBadge}>Installed</span>}
                    </div>
                    <div style={styles.cardDesc}>{card.description}</div>
                    {card.why && (
                      <div style={styles.cardWhy}>
                        <span style={styles.cardWhyIcon}>✓</span> {card.why}
                      </div>
                    )}
                    <button
                      type="button"
                      style={{ ...styles.useBtn, opacity: isInstalling ? 0.6 : 1 }}
                      onClick={() => handleUse(card)}
                      disabled={isInstalling}
                    >
                      {isInstalled ? 'Open →' : isInstalling ? 'Setting up…' : 'Use this tool →'}
                    </button>
                  </div>
                );
              })}
            </div>
            <button type="button" style={styles.tryAgainBtn} onClick={onBack}>
              Try different words
            </button>
          </>
        )}

        {state === 'empty' && (
          <div style={styles.emptyBlock}>
            <div style={styles.emptyIcon}>🔍</div>
            <div style={styles.emptyTitle}>No tools found for that</div>
            <div style={styles.emptyDesc}>
              Try describing what file type you're working with, like "compress MP4 video" or "resize PNG images".
            </div>
            <button type="button" style={styles.primaryBtn} onClick={onBack}>
              Try again
            </button>
          </div>
        )}

        {state === 'error' && (
          <div style={styles.emptyBlock}>
            <div style={styles.emptyIcon}>⚠️</div>
            <div style={styles.emptyTitle}>Something went wrong</div>
            <div style={styles.emptyDesc}>{error}</div>
            <div style={styles.btnRow}>
              <button type="button" style={styles.primaryBtn} onClick={() => void search()}>Retry</button>
              <button type="button" style={styles.secondaryBtn} onClick={onBack}>Go back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getIconForRepo(repo: string): string {
  const r = repo.toLowerCase();
  if (r.includes('ffmpeg') || r.includes('video') || r.includes('handbrake')) return '🎬';
  if (r.includes('image') || r.includes('magick') || r.includes('sharp') || r.includes('jpeg')) return '🖼️';
  if (r.includes('pdf') || r.includes('stirling')) return '📄';
  if (r.includes('audio') || r.includes('mp3') || r.includes('whisper') || r.includes('wave')) return '🎵';
  if (r.includes('yt') || r.includes('youtube') || r.includes('download')) return '📺';
  if (r.includes('pandoc') || r.includes('doc')) return '📝';
  if (r.includes('gif') || r.includes('gifski')) return '🎞️';
  if (r.includes('svg') || r.includes('svgo')) return '🎨';
  if (r.includes('data') || r.includes('csv')) return '📊';
  if (r.includes('zip') || r.includes('compress')) return '📦';
  if (r.includes('search') || r.includes('grep')) return '🔎';
  return '⚙️';
}

const styles: Record<string, React.CSSProperties> = {
  root: { flex: 1, display: 'flex', justifyContent: 'center', padding: '32px 24px' },
  content: { width: '100%', maxWidth: 540, display: 'flex', flexDirection: 'column', gap: 20 },
  topRow: { display: 'flex', alignItems: 'center', gap: 12 },
  backBtn: {
    background: 'transparent', border: 'none',
    color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', padding: '4px 0',
    fontFamily: 'inherit',
  },
  intentBubble: {
    flex: 1, padding: '6px 14px',
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20,
    fontSize: 13, color: 'var(--text)', fontStyle: 'italic',
  },
  loadingBlock: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginTop: 60 },
  loadingDots: { display: 'flex', gap: 8 },
  dot: {
    width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)',
    animation: 'bounce 1.2s infinite',
    display: 'inline-block',
  },
  loadingText: { fontSize: 14, color: 'var(--text-muted)' },
  sectionTitle: {
    fontSize: 13, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase' as const, letterSpacing: '0.06em',
  },
  cards: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    padding: '16px 18px', borderRadius: 12,
    border: '1px solid var(--border)', background: 'var(--surface)',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 10 },
  cardIcon: { fontSize: 24, flexShrink: 0 },
  cardMeta: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: 700, color: 'var(--text)' },
  cardSlug: { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  installedBadge: {
    fontSize: 10, fontWeight: 700, padding: '2px 8px',
    background: 'rgba(34,197,94,0.15)', color: 'var(--green)',
    borderRadius: 10, border: '1px solid rgba(34,197,94,0.2)',
  },
  cardDesc: { fontSize: 12, color: 'var(--text)', lineHeight: 1.5 },
  cardWhy: {
    display: 'flex', alignItems: 'flex-start', gap: 6,
    fontSize: 12, color: 'var(--text-muted)',
    background: 'var(--surface-2)', borderRadius: 8, padding: '8px 10px',
  },
  cardWhyIcon: { color: 'var(--green)', flexShrink: 0 },
  useBtn: {
    padding: '10px 16px', borderRadius: 8, border: 'none',
    background: 'var(--accent)', color: 'var(--bg)',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
    alignSelf: 'flex-start' as const,
    transition: 'opacity 0.15s',
    fontFamily: 'inherit',
  },
  tryAgainBtn: {
    background: 'transparent', border: 'none',
    color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
    textAlign: 'center' as const, textDecoration: 'underline',
    fontFamily: 'inherit',
  },
  emptyBlock: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
    marginTop: 60, textAlign: 'center' as const,
  },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: 'var(--text)' },
  emptyDesc: { fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 360 },
  primaryBtn: {
    padding: '10px 20px', borderRadius: 10, border: 'none',
    background: 'var(--accent)', color: 'var(--bg)',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  secondaryBtn: {
    padding: '10px 20px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'transparent',
    color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnRow: { display: 'flex', gap: 10 },
};
