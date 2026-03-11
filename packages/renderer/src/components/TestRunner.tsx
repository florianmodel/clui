import { useState, useCallback, useEffect } from 'react';
import type { ExecLogEvent, ExecCompleteEvent } from '@gui-bridge/shared';
import { useLogEvents, useCompleteEvent } from '../hooks/useIPC.js';

const FFMPEG_IMAGE = 'gui-bridge-ffmpeg-test';

type DockerStatus = 'checking' | 'ok' | 'error';
type RunStatus = 'idle' | 'building' | 'running' | 'done' | 'error';

const SCALE_OPTIONS = [
  { value: '', label: 'Original resolution' },
  { value: '1920', label: '1920px wide (1080p-ish)' },
  { value: '1280', label: '1280px wide (720p-ish)' },
  { value: '854', label: '854px wide (480p-ish)' },
] as const;

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
  const [scaleWidth, setScaleWidth] = useState('1920');
  const [savePath, setSavePath] = useState<string | null>(null);

  useLogEvents(onLog);
  useCompleteEvent(useCallback((event: ExecCompleteEvent) => {
    if (event.exitCode === 0) {
      // If the user chose a save path, copy the output file there
      const copyAndFinish = async (files: string[]) => {
        if (savePath && files[0]) {
          try {
            await window.electronAPI.files.copy({ src: files[0], dest: savePath });
            const saved = [savePath];
            setOutputFiles(saved);
            onLog({ stream: 'system', line: `✓ Saved to ${savePath}`, timestamp: Date.now() });
          } catch {
            setOutputFiles(files);
            onLog({ stream: 'system', line: '✓ Done! (save failed — showing temp location)', timestamp: Date.now() });
          }
        } else {
          setOutputFiles(files);
          onLog({ stream: 'system', line: '✓ Done! Output files: ' + (files.join(', ') || '(none)'), timestamp: Date.now() });
        }
        setRunStatus('done');
      };
      void copyAndFinish(event.outputFiles);
    } else {
      setRunStatus('error');
      onLog({ stream: 'system', line: `✗ Process exited with code ${event.exitCode}. ${event.error ?? ''}`, timestamp: Date.now() });
    }
  }, [onLog, savePath]));

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
      title: 'Select a video file',
      filters: [{ name: 'Video', extensions: ['mp4', 'avi', 'mkv', 'mov', 'webm'] }],
      properties: ['openFile'],
    });
    if (!result.canceled && result.filePaths[0]) {
      setInputFile(result.filePaths[0]);
      setSavePath(null); // reset save path when input changes
    }
  }

  async function pickSavePath() {
    const stem = inputFile
      ? inputFile.split('/').pop()!.replace(/\.[^.]+$/, '')
      : 'converted';
    const result = await window.electronAPI.files.savePick({
      title: 'Save output as…',
      defaultPath: `${stem}.avi`,
      filters: [{ name: 'Video', extensions: ['avi', 'mp4', 'mkv', 'mov', 'webm'] }],
    });
    if (!result.canceled && result.filePath) {
      setSavePath(result.filePath);
    }
  }

  async function run() {
    onClearLogs();
    setOutputFiles([]);
    setRunStatus('building');

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

    let command: string[];
    if (inputFile) {
      const filename = inputFile.split('/').pop()!;
      // Build filter chain: scale if requested
      const vf = scaleWidth ? `scale=${scaleWidth}:-2` : null;
      command = [
        'ffmpeg',
        '-i', `/input/${filename}`,
        ...(vf ? ['-vf', vf] : []),
        '-vcodec', 'libx264',
        '-preset', 'fast',   // faster encoding, slightly larger file
        '-y',
        '/output/converted.avi',
      ];
    } else {
      command = [
        'ffmpeg',
        '-f', 'lavfi',
        '-i', 'testsrc=duration=2:size=320x240:rate=30',
        '-pix_fmt', 'yuv420p',
        '-y',
        '/output/test.mp4',
      ];
    }

    await window.electronAPI.exec.run({
      image: FFMPEG_IMAGE,
      command,
      inputFiles: inputFile ? [inputFile] : undefined,
    });
  }

  const busy = runStatus === 'building' || runStatus === 'running';

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
        {/* File picker */}
        <div style={styles.fileRow}>
          <button style={styles.secondaryBtn} onClick={pickInputFile} disabled={busy}>
            {inputFile ? '📁 Change file' : '📁 Pick input file (optional)'}
          </button>
          {inputFile
            ? <span style={styles.fileName}>{inputFile.split('/').pop()}</span>
            : <span style={styles.muted}>No file — will use ffmpeg test source</span>
          }
        </div>

        {/* Resolution dropdown — only shown when a file is selected */}
        {inputFile && (
          <div style={styles.fieldRow}>
            <label style={styles.label}>Scale resolution</label>
            <select
              style={styles.select}
              value={scaleWidth}
              onChange={(e) => setScaleWidth(e.target.value)}
              disabled={busy}
            >
              {SCALE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {scaleWidth && (
              <span style={styles.muted}>→ width capped at {scaleWidth}px, height auto</span>
            )}
          </div>
        )}

        {/* Save path */}
        <div style={styles.fieldRow}>
          <button style={styles.secondaryBtn} onClick={pickSavePath} disabled={busy}>
            💾 Save as…
          </button>
          {savePath
            ? <span style={styles.fileName}>{savePath.split('/').pop()}<span style={{ ...styles.muted, marginLeft: 6 }}>{savePath.split('/').slice(0, -1).join('/').replace(/^\/Users\/[^/]+/, '~')}</span></span>
            : <span style={styles.muted}>No location set — output goes to temp folder</span>
          }
        </div>

        {/* Run / Stop */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            style={{
              ...styles.runBtn,
              flex: 1,
              background: runStatus === 'done' ? 'var(--green)' : 'var(--accent)',
            }}
            onClick={run}
            disabled={dockerStatus !== 'ok' || busy}
          >
            {runStatus === 'building' && '⏳ Building image…'}
            {runStatus === 'running' && '▶ Running ffmpeg…'}
            {runStatus === 'idle' && '▶ Run FFmpeg Test'}
            {runStatus === 'done' && '✓ Done — Run Again'}
            {runStatus === 'error' && '✗ Error — Retry'}
          </button>

          {busy && (
            <button
              style={styles.stopBtn}
              onClick={() => window.electronAPI.exec.cancel()}
            >
              ■ Stop
            </button>
          )}
        </div>
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
      background: color, boxShadow: `0 0 6px ${color}`, flexShrink: 0,
    }} />
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', flexDirection: 'column', gap: 20,
    padding: 24, background: 'var(--surface)',
    border: '1px solid var(--border)', borderRadius: 12,
  },
  header: { display: 'flex', flexDirection: 'column', gap: 4 },
  title: {
    fontSize: 22, fontWeight: 700,
    color: 'var(--text)',
  },
  subtitle: { fontSize: 12, color: 'var(--text-muted)' },
  statusRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 12px', background: 'var(--surface-2)',
    borderRadius: 8, border: '1px solid var(--border)',
  },
  statusText: { fontSize: 13, color: 'var(--text)' },
  controls: { display: 'flex', flexDirection: 'column', gap: 12 },
  fileRow: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  fieldRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  label: { fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 },
  select: {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text)', fontSize: 13,
    padding: '6px 10px', cursor: 'pointer',
  },
  muted: { color: 'var(--text-muted)', fontSize: 12 },
  fileName: { fontSize: 13, color: 'var(--accent)', fontFamily: 'var(--font-mono)' },
  secondaryBtn: {
    background: 'transparent', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text)', fontSize: 13, padding: '8px 16px',
  },
  runBtn: {
    border: 'none', borderRadius: 10, color: 'var(--bg)',
    fontWeight: 700, fontSize: 15, padding: '12px 24px', letterSpacing: '-0.01em',
  },
  stopBtn: {
    border: '1px solid var(--red)', borderRadius: 10,
    background: 'transparent', color: 'var(--red)',
    fontWeight: 700, fontSize: 15, padding: '12px 20px',
  },
  outputSection: {
    display: 'flex', flexDirection: 'column', gap: 8,
    padding: '12px 16px', background: 'var(--surface-2)',
    borderRadius: 8, border: '1px solid var(--border)',
  },
  outputTitle: {
    fontSize: 12, fontWeight: 600, letterSpacing: '0.05em',
    textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4,
  },
  outputFile: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  outputFileName: { fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--green)' },
  openBtn: {
    background: 'transparent', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text-muted)', fontSize: 12, padding: '3px 10px',
  },
};
