import { useEffect, useRef } from 'react';
import type { ExecLogEvent } from '@gui-bridge/shared';

interface Props {
  logs: ExecLogEvent[];
  onClear: () => void;
}

const streamColor: Record<ExecLogEvent['stream'], string> = {
  stdout: 'var(--text)',
  stderr: 'var(--red)',
  system: 'var(--accent)',
};

export function LogPanel({ logs, onClear }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new logs
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Output</span>
        <button style={styles.clearBtn} onClick={onClear} disabled={logs.length === 0}>
          Clear
        </button>
      </div>
      <div style={styles.body}>
        {logs.length === 0 && (
          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            No output yet. Click "Run FFmpeg Test" to start.
          </span>
        )}
        {logs.map((entry, i) => (
          <div key={i} style={{ color: streamColor[entry.stream] }}>
            <span style={styles.prefix}>{prefixFor(entry.stream)}</span>
            {entry.line}
          </div>
        ))}
        <div ref={bottomRef} />
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
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface-2)',
  },
  headerTitle: {
    fontWeight: 600,
    fontSize: 13,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  },
  clearBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text-muted)',
    fontSize: 12,
    padding: '3px 10px',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  prefix: {
    color: 'var(--text-muted)',
    userSelect: 'none',
  },
};
