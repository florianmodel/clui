import { useState, useCallback, useEffect } from 'react';
import type { ExecLogEvent, ExecCompleteEvent } from '@gui-bridge/shared';
import { useLogEvents, useCompleteEvent } from '../hooks/useIPC.js';

// The Dockerfile is relative to the project root; the main process resolves
// the absolute path from app.getAppPath().
const FFMPEG_IMAGE = 'gui-bridge-ffmpeg-test';

type DockerStatus = 'checking' | 'ok' | 'error';
type RunStatus = 'idle' | 'building' | 'running' | 'done' | 'error';

interface Props {
  onLog: (event: ExecLogEvent) => void;
  onClearLogs: () => void;
}

export function TestRunner({ onLog, onClearLogs }: Props) {
  const [dockerStatus, setDockerStatus] = useState<DockerStatus>('checking');
  const [dockerVersion, setDockerVersion] = useState('');
  const [runStatus, setRunStatus] = useState<RunStatus>('idle');
  const [outputFiles, setOutputFiles] = useState<string[]>([]);
  const [inputFile, setInputFile] = useState<string | null>(null);

  // Subscribe to streamed log / complete events
  useLogEvents(onLog);
  useCompleteEvent(useCallback((event: ExecCompleteEvent) => {
    if (event.exitCode === 0) {
      setRunStatus('done');
      setOutputFiles(event.outputFiles);
      onLog({ stream: 'system', line: '✓ Done! Output files: ' + (event.outputFiles.join(', ') || '(none)'), timestamp: Date.now() });
    } else {
      setRunStatus('error');
      onLog({ stream: 'system', line: `✗ Process exited with code ${event.exitCode}. ${event.error ?? ''}`, timestamp: Date.now() });
    }
  }, [onLog]));

  // Check Docker health on mount
  useEffect(() => {
    window.electronAPI.docker.checkHealth().then((res) => {
      if (res.ok) {
        setDockerStatus('ok');
        setDockerVersion(res.version ?? '');
      } else {
        setDockerStatus('error');
      }
    });
  }, []);

  async function pickInputFile() {
    const result = await window.electronAPI.files.pick({
      title: 'Select an MP4 file',
      filters: [{ name: 'Video', extensions: ['mp4', 'avi', 'mkv', 'mov', 'webm'] }],
      properties: ['openFile'],
    });
    if (!result.canceled && result.filePaths[0]) {
      setInputFile(result.filePaths[0]);
    }
  }

  async function run() {
    onClearLogs();
    setOutputFiles([]);
    setRunStatus('building');

    // Step 1: build image if needed
    const buildRes = await window.electronAPI.docker.buildImage({
      tag: FFMPEG_IMAGE,
      dockerfilePath: 'docker/ffmpeg-test.Dockerfile',
      contextPath: '.',
    });

    if (!buildRes.ok) {
      setRunStatus('error');
      onLog({ stream: 'system', line: `Build failed: ${buildRes.error ?? 'unknown error'}`, timestamp: Date.now() });
      return;
    }

    setRunStatus('running');

    // Step 2: run ffmpeg in a container.
    // If a file was picked, pass it so main can copy it into /input.
    // If no file, use ffmpeg's built-in lavfi test source to generate output.
    const command = inputFile
      ? ['ffmpeg', '-i', `/input/${inputFile.split('/').pop()}`, '-vcodec', 'libx264', '-y', '/output/converted.avi']
      : ['ffmpeg', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=30', '-pix_fmt', 'yuv420p', '-y', '/output/test.mp4'];

    await window.electronAPI.exec.run({
      image: FFMPEG_IMAGE,
      command,
      inputFiles: inputFile ? [inputFile] : undefined,
    });
    // runStatus is updated via useCompleteEvent
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>GUI Bridge</h1>
        <p style={styles.subtitle}>Electron shell · Docker manager · Chunk 1</p>
      </div>

      <div style={styles.statusRow}>
        <StatusDot state={dockerStatus} />
        <span style={styles.statusText}>
          {dockerStatus === 'checking' && 'Checking Docker…'}
          {dockerStatus === 'ok' && `Docker ${dockerVersion}`}
          {dockerStatus === 'error' && 'Docker not running — please start Docker Desktop'}
        </span>
      </div>

      <div style={styles.controls}>
        <div style={styles.fileRow}>
          <button style={styles.secondaryBtn} onClick={pickInputFile} disabled={runStatus === 'building' || runStatus === 'running'}>
            {inputFile ? '📁 Change file' : '📁 Pick input file (optional)'}
          </button>
          {inputFile && (
            <span style={styles.fileName}>{inputFile.split('/').pop()}</span>
          )}
          {!inputFile && (
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              No file selected — will use ffmpeg test source
            </span>
          )}
        </div>

        <button
          style={{
            ...styles.runBtn,
            background: runStatus === 'done' ? 'var(--green)' : 'var(--accent)',
          }}
          onClick={run}
          disabled={dockerStatus !== 'ok' || runStatus === 'building' || runStatus === 'running'}
        >
          {runStatus === 'building' && '⏳ Building image…'}
          {runStatus === 'running' && '⏳ Running ffmpeg…'}
          {runStatus === 'idle' && '▶ Run FFmpeg Test'}
          {runStatus === 'done' && '✓ Done — Run Again'}
          {runStatus === 'error' && '✗ Error — Retry'}
        </button>
      </div>

      {outputFiles.length > 0 && (
        <div style={styles.outputSection}>
          <div style={styles.outputTitle}>Output files</div>
          {outputFiles.map((f) => (
            <div key={f} style={styles.outputFile}>
              <span style={styles.outputFileName}>{f.split('/').pop()}</span>
              <button
                style={styles.openBtn}
                onClick={() => window.electronAPI.files.showInFinder(f)}
              >
                Show in Finder
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusDot({ state }: { state: DockerStatus }) {
  const color =
    state === 'ok' ? 'var(--green)' :
    state === 'error' ? 'var(--red)' :
    'var(--yellow)';
  return (
    <div style={{
      width: 8, height: 8, borderRadius: '50%',
      background: color,
      boxShadow: `0 0 6px ${color}`,
      flexShrink: 0,
    }} />
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    padding: 24,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    background: 'linear-gradient(90deg, #a78bfa, #60a5fa)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  subtitle: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: 'var(--surface-2)',
    borderRadius: 8,
    border: '1px solid var(--border)',
  },
  statusText: {
    fontSize: 13,
    color: 'var(--text)',
  },
  controls: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  fileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  fileName: {
    fontSize: 13,
    color: 'var(--accent)',
    fontFamily: 'var(--font-mono)',
  },
  secondaryBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    fontSize: 13,
    padding: '8px 16px',
  },
  runBtn: {
    border: 'none',
    borderRadius: 10,
    color: '#0f0c29',
    fontWeight: 700,
    fontSize: 15,
    padding: '12px 24px',
    letterSpacing: '-0.01em',
    transition: 'opacity 0.15s',
  },
  outputSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '12px 16px',
    background: 'var(--surface-2)',
    borderRadius: 8,
    border: '1px solid var(--border)',
  },
  outputTitle: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: 4,
  },
  outputFile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  outputFileName: {
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    color: 'var(--green)',
  },
  openBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text-muted)',
    fontSize: 12,
    padding: '3px 10px',
  },
};
