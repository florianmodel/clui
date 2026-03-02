import { useState, useCallback, useEffect } from 'react';
import type { ExecLogEvent, UISchema, CapabilityDump, AnalysisProgressEvent } from '@gui-bridge/shared';
import { DynamicGUI } from './components/DynamicGUI/index.js';
import { LogPanel } from './components/LogPanel.js';
import { AnalyzePanel } from './components/AnalyzePanel/AnalyzePanel.js';
import { ApiKeySetup } from './components/Setup/ApiKeySetup.js';
import { AnalysisProgress } from './components/AnalysisProgress/AnalysisProgress.js';
import { SchemaReview } from './components/SchemaReview/SchemaReview.js';

const SCHEMA_OPTIONS = [
  { id: 'ffmpeg', label: 'FFmpeg', path: 'schemas/examples/ffmpeg.json' },
  { id: 'imagemagick', label: 'ImageMagick', path: 'schemas/examples/imagemagick.json' },
];

type DockerStatus = 'checking' | 'ok' | 'error';
type AppView = 'run' | 'analyze';
type AnalyzePhase = 'idle' | 'progress' | 'review' | 'ready';

export function App() {
  // ── Run view state ───────────────────────────────────────────────────
  const [logs, setLogs] = useState<ExecLogEvent[]>([]);
  const [schemaPath, setSchemaPath] = useState(SCHEMA_OPTIONS[0].path);
  const [schema, setSchema] = useState<UISchema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [dockerStatus, setDockerStatus] = useState<DockerStatus>('checking');
  const [dockerVersion, setDockerVersion] = useState('');

  // ── Global view ──────────────────────────────────────────────────────
  const [view, setView] = useState<AppView>('run');

  // ── Analyze pipeline state ───────────────────────────────────────────
  const [analyzePhase, setAnalyzePhase] = useState<AnalyzePhase>('idle');
  const [progressEvents, setProgressEvents] = useState<AnalysisProgressEvent[]>([]);
  const [generatedDump, setGeneratedDump] = useState<CapabilityDump | null>(null);
  const [generatedSchema, setGeneratedSchema] = useState<UISchema | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [pendingRepoDir, setPendingRepoDir] = useState('');
  const [pendingDockerImage, setPendingDockerImage] = useState('');

  // ── API key state ────────────────────────────────────────────────────
  const [showApiKeySetup, setShowApiKeySetup] = useState(false);

  const handleLog = useCallback((event: ExecLogEvent) => {
    setLogs((prev) => [...prev, event]);
  }, []);

  const handleClearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Check Docker on mount
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

  // Load schema when path changes
  useEffect(() => {
    setSchema(null);
    setSchemaError(null);
    window.electronAPI.schema.load({ filePath: schemaPath }).then((res) => {
      if (res.ok && res.schema) {
        setSchema(res.schema);
      } else {
        setSchemaError(res.error ?? 'Failed to load schema');
      }
    });
  }, [schemaPath]);

  // ── Analyze pipeline ─────────────────────────────────────────────────

  const runAnalyzePipeline = useCallback(async (repoDir: string, dockerImage: string) => {
    setAnalyzePhase('progress');
    setProgressEvents([]);
    setAnalyzeError(null);
    setPendingRepoDir(repoDir);
    setPendingDockerImage(dockerImage);

    // Subscribe to progress events
    const cleanup = window.electronAPI.on.analysisProgress(event => {
      setProgressEvents(prev => [...prev, event]);
    });

    try {
      // Step 1: Static analysis
      setProgressEvents([{ stage: 'detecting', message: 'Detecting language and framework…' }]);

      const analyzeRes = await window.electronAPI.analyzer.run({ repoDir, dockerImage });
      if (!analyzeRes.ok || !analyzeRes.dump) {
        setAnalyzeError(analyzeRes.error ?? 'Analysis failed');
        setProgressEvents(prev => [...prev, { stage: 'error', message: analyzeRes.error ?? 'Analysis failed' }]);
        return;
      }

      const dump = analyzeRes.dump;
      setGeneratedDump(dump);

      setProgressEvents(prev => [
        ...prev,
        { stage: 'complete', message: `Found ${dump.arguments.length} args · ${dump.subcommands.length} subcommands` },
        { stage: 'generating-ui', message: 'Generating UI with AI…', detail: `${dump.stack.language} · ${dump.stack.framework}` },
      ]);

      // Step 2: LLM schema generation
      const genRes = await window.electronAPI.schema.generate({ dump, dockerImage });

      if (!genRes.ok || !genRes.schema) {
        setAnalyzeError(genRes.error ?? 'Schema generation failed');
        setProgressEvents(prev => [...prev, { stage: 'error', message: genRes.error ?? 'Schema generation failed' }]);
        return;
      }

      setGeneratedSchema(genRes.schema);
      setProgressEvents(prev => [...prev, { stage: 'complete', message: 'UI schema generated.' }]);

      // Transition to review after a short delay
      setTimeout(() => setAnalyzePhase('review'), 600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAnalyzeError(msg);
      setProgressEvents(prev => [...prev, { stage: 'error', message: msg }]);
    } finally {
      cleanup();
    }
  }, []);

  const handleAnalyze = useCallback(async (repoDir: string, dockerImage: string) => {
    // Check if API key is configured
    const configRes = await window.electronAPI.config.get();
    if (!configRes.hasApiKey && !configRes.config.mockMode) {
      // Show API key setup modal
      setPendingRepoDir(repoDir);
      setPendingDockerImage(dockerImage);
      setShowApiKeySetup(true);
      return;
    }

    runAnalyzePipeline(repoDir, dockerImage);
  }, [runAnalyzePipeline]);

  const handleApiKeySaved = useCallback(() => {
    setShowApiKeySetup(false);
    if (pendingRepoDir && pendingDockerImage) {
      runAnalyzePipeline(pendingRepoDir, pendingDockerImage);
    }
  }, [pendingRepoDir, pendingDockerImage, runAnalyzePipeline]);

  const handleSchemaApproved = useCallback((approvedSchema: UISchema) => {
    setGeneratedSchema(approvedSchema);
    setAnalyzePhase('ready');
  }, []);

  const handleBackToSetup = useCallback(() => {
    setAnalyzePhase('idle');
    setAnalyzeError(null);
  }, []);

  // Determine what to render in the left panel
  const renderLeftPanel = () => {
    if (view === 'run') {
      if (schemaError) {
        return (
          <div style={styles.errorBox}>
            <div style={styles.errorTitle}>Failed to load schema</div>
            <div style={styles.errorMsg}>{schemaError}</div>
          </div>
        );
      }
      if (schema) {
        return (
          <DynamicGUI
            key={schema.projectId}
            schema={schema}
            onLog={handleLog}
            onClearLogs={handleClearLogs}
            dockerStatus={dockerStatus}
          />
        );
      }
      return <div style={styles.loading}>Loading schema…</div>;
    }

    // Analyze view
    switch (analyzePhase) {
      case 'idle':
        return (
          <AnalyzePanel
            onAnalyze={handleAnalyze}
            disabled={false}
          />
        );

      case 'progress':
        return (
          <>
            <AnalysisProgress
              events={progressEvents}
              toolName={pendingDockerImage.split('/').pop()?.split(':')[0]}
            />
            {analyzeError && (
              <div style={{ marginTop: 12 }}>
                <button type="button" style={styles.backBtn} onClick={handleBackToSetup}>
                  ← Try again
                </button>
              </div>
            )}
          </>
        );

      case 'review':
        if (!generatedSchema || !generatedDump) return null;
        return (
          <SchemaReview
            schema={generatedSchema}
            dump={generatedDump}
            onApprove={handleSchemaApproved}
            onBack={handleBackToSetup}
          />
        );

      case 'ready':
        if (!generatedSchema) return null;
        return (
          <>
            <div style={styles.readyHeader}>
              <button type="button" style={styles.backBtnSmall} onClick={() => setAnalyzePhase('review')}>
                ← Back to review
              </button>
            </div>
            <DynamicGUI
              key={generatedSchema.projectId}
              schema={generatedSchema}
              onLog={handleLog}
              onClearLogs={handleClearLogs}
              dockerStatus={dockerStatus}
            />
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div style={styles.root}>
      {/* API Key Setup modal */}
      {showApiKeySetup && <ApiKeySetup onSaved={handleApiKeySaved} />}

      {/* Top bar */}
      <div style={styles.topBar}>
        <span style={styles.appName}>GUI Bridge</span>

        {/* View toggle: Run | Analyze */}
        <div style={styles.viewToggle}>
          {(['run', 'analyze'] as AppView[]).map((v) => (
            <button
              key={v}
              type="button"
              style={{
                ...styles.viewTab,
                ...(view === v ? styles.viewTabActive : styles.viewTabInactive),
              }}
              onClick={() => setView(v)}
            >
              {v === 'run' ? 'Run' : 'Generate'}
            </button>
          ))}
        </div>

        {/* Schema picker — only shown in Run view */}
        {view === 'run' && (
          <div style={styles.schemaPicker}>
            <span style={styles.schemaLabel}>Tool:</span>
            <div style={styles.schemaTabs}>
              {SCHEMA_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  style={{
                    ...styles.schemaTab,
                    ...(schemaPath === opt.path ? styles.schemaTabActive : styles.schemaTabInactive),
                  }}
                  onClick={() => setSchemaPath(opt.path)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* In Analyze/ready view: show tool name + "Edit Schema" */}
        {view === 'analyze' && analyzePhase === 'ready' && generatedSchema && (
          <div style={styles.readyToolBar}>
            <span style={styles.readyToolName}>{generatedSchema.projectName}</span>
            <button
              type="button"
              style={styles.editSchemaBtn}
              onClick={() => setAnalyzePhase('review')}
            >
              Edit Schema
            </button>
          </div>
        )}

        {dockerVersion && (
          <span style={styles.dockerVersion}>Docker {dockerVersion}</span>
        )}
      </div>

      {/* Main two-panel layout */}
      <div style={styles.layout}>
        <div style={styles.left}>
          {renderLeftPanel()}
        </div>
        <div style={styles.right}>
          <LogPanel logs={logs} onClear={handleClearLogs} />
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column',
    height: '100vh', background: 'var(--bg)',
  },
  topBar: {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '10px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
    flexShrink: 0,
  },
  appName: {
    fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em',
    background: 'linear-gradient(90deg, #a78bfa, #60a5fa)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
  },
  viewToggle: { display: 'flex', gap: 2, background: 'var(--bg)', borderRadius: 8, padding: 2 },
  viewTab: {
    border: 'none', borderRadius: 6, fontSize: 12,
    padding: '4px 12px', cursor: 'pointer', fontWeight: 500,
  },
  viewTabActive: { background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' },
  viewTabInactive: { background: 'transparent', color: 'var(--text-muted)' },
  schemaPicker: { display: 'flex', alignItems: 'center', gap: 8, flex: 1 },
  schemaLabel: { fontSize: 12, color: 'var(--text-muted)' },
  schemaTabs: { display: 'flex', gap: 4 },
  schemaTab: {
    border: 'none', borderRadius: 6, fontSize: 12,
    padding: '5px 12px', cursor: 'pointer', fontWeight: 500,
  },
  schemaTabActive: { background: 'var(--accent)', color: '#0f0c29' },
  schemaTabInactive: {
    background: 'var(--surface-2)', color: 'var(--text-muted)',
    border: '1px solid var(--border)',
  },
  dockerVersion: { fontSize: 11, color: 'var(--text-muted)' },
  layout: {
    display: 'flex', gap: 0, flex: 1, overflow: 'hidden',
  },
  left: {
    width: 460, flexShrink: 0,
    overflowY: 'auto', padding: 16,
  },
  right: {
    flex: 1, display: 'flex', flexDirection: 'column',
    borderLeft: '1px solid var(--border)', minHeight: 0,
  },
  errorBox: {
    padding: 20, background: 'var(--surface)',
    border: '1px solid var(--red)', borderRadius: 12,
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  errorTitle: { fontSize: 14, fontWeight: 700, color: 'var(--red)' },
  errorMsg: { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' },
  loading: {
    padding: 24, color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic',
  },
  readyHeader: { marginBottom: 12 },
  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-muted)', fontSize: 12, padding: 0,
  },
  backBtnSmall: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-muted)', fontSize: 11, padding: 0,
  },
  readyToolBar: { display: 'flex', alignItems: 'center', gap: 10, flex: 1 },
  readyToolName: { fontSize: 13, fontWeight: 600, color: 'var(--text)' },
  editSchemaBtn: {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '4px 10px',
    fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer',
  },
};
