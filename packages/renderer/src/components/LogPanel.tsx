import { useEffect, useRef, useState } from 'react';
import type { ExecLogEvent } from '@gui-bridge/shared';
import { useToast } from './common/Toast.js';

interface Props {
  logs: ExecLogEvent[];
  onClear: () => void;
}

const streamColor: Record<ExecLogEvent['stream'], string> = {
  stdout: 'var(--text)',
  stderr: '#f87171',
  system: 'var(--accent)',
};

function parseTimecode(h: string, m: string, s: string): number {
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseFloat(s);
}

function detectSimpleProgress(line: string): number | null {
  const pctMatch = line.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) return Math.min(100, parseFloat(pctMatch[1]));
  const fracMatch = line.match(/(\d+)\s*(?:of|\/)\s*(\d+)/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1]);
    const den = parseInt(fracMatch[2]);
    if (den > 0 && den >= num) return Math.min(100, (num / den) * 100);
  }
  return null;
}

export function LogPanel({ logs, onClear }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [progress, setProgress] = useState<number | null>(null);
  const { showToast } = useToast();
  const durationRef = useRef<number | null>(null);

  // Detect progress — ffmpeg-aware, with fallback to simple patterns
  useEffect(() => {
    // Try to extract ffmpeg total duration from early logs
    if (durationRef.current === null) {
      for (const log of logs) {
        const m = log.line.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (m) { durationRef.current = parseTimecode(m[1], m[2], m[3]); break; }
      }
    }
    // If duration known, scan recent logs for ffmpeg time= progress
    if (durationRef.current !== null && durationRef.current > 0) {
      for (let i = logs.length - 1; i >= Math.max(0, logs.length - 10); i--) {
        const m = logs[i].line.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (m) {
          const current = parseTimecode(m[1], m[2], m[3]);
          setProgress(Math.min(100, (current / durationRef.current!) * 100));
          return;
        }
      }
    }
    // Fallback: percentage or fraction patterns
    for (let i = logs.length - 1; i >= Math.max(0, logs.length - 5); i--) {
      const p = detectSimpleProgress(logs[i].line);
      if (p !== null) { setProgress(p); return; }
    }
  }, [logs]);

  // Reset progress and duration ref when logs are cleared
  useEffect(() => {
    if (logs.length === 0) {
      setProgress(null);
      durationRef.current = null;
    }
  }, [logs.length]);

  // Smart auto-scroll: only scroll if user is near the bottom
  useEffect(() => {
    if (isAtBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }

  async function handleCopyAll() {
    if (logs.length === 0) return;
    const text = logs.map((e) => `[${e.stream}] ${e.line}`).join('\n');
    await window.electronAPI.clipboard.write(text);
    showToast('Logs copied to clipboard');
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Output</span>
        <div style={styles.headerRight}>
          {logs.length > 0 && (
            <span style={styles.lineCount}>{logs.length} lines</span>
          )}
          <button
            type="button"
            style={styles.headerBtn}
            onClick={handleCopyAll}
            disabled={logs.length === 0}
            title="Copy all logs"
          >
            Copy
          </button>
          <button
            type="button"
            style={styles.headerBtn}
            onClick={onClear}
            disabled={logs.length === 0}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {progress !== null && (
        <div style={styles.progressTrack}>
          <div style={{ ...styles.progressBar, width: `${progress}%` }} />
          <span style={styles.progressLabel}>{Math.round(progress)}%</span>
        </div>
      )}

      <div
        ref={scrollRef}
        style={styles.body}
        onScroll={handleScroll}
      >
        {logs.length === 0 && (
          <span style={styles.empty}>
            No output yet. Fill in the form and click Run to start.
          </span>
        )}
        {logs.map((entry, i) => (
          <div key={i} style={{ color: streamColor[entry.stream] }}>
            <span style={styles.prefix}>{prefixFor(entry.stream)}</span>
            {entry.line}
          </div>
        ))}
        <div style={{ height: 4 }} />
      </div>
    </div>
  );
}

function prefixFor(stream: ExecLogEvent['stream']): string {
  if (stream === 'stderr') return '[err] ';
  if (stream === 'system') return '[sys] ';
  return '      ';
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', flex: 1,
    background: 'var(--surface)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px', borderBottom: '1px solid var(--border)',
    background: 'var(--surface-2)', flexShrink: 0,
  },
  headerTitle: {
    fontWeight: 700, fontSize: 12,
    letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)',
  },
  headerRight: { display: 'flex', alignItems: 'center', gap: 6 },
  lineCount: { fontSize: 11, color: 'var(--text-muted)' },
  headerBtn: {
    background: 'transparent', border: '1px solid var(--border)',
    borderRadius: 5, color: 'var(--text-muted)', fontSize: 11,
    padding: '2px 8px', cursor: 'pointer',
  },
  progressTrack: {
    position: 'relative', height: 20, background: 'var(--surface-2)',
    borderBottom: '1px solid var(--border)', flexShrink: 0,
    display: 'flex', alignItems: 'center',
  },
  progressBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    background: 'var(--accent-dim)',
    transition: 'width 0.3s ease',
  },
  progressLabel: {
    position: 'relative', fontSize: 11, color: 'var(--accent)',
    fontWeight: 600, paddingLeft: 8,
  },
  body: {
    flex: 1, overflowY: 'auto', padding: '8px 10px',
    fontFamily: 'var(--font-mono)', fontSize: 11,
    lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
  },
  empty: { color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 12 },
  prefix: { color: 'var(--text-muted)', userSelect: 'none' },
};
