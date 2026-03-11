import { useState, useCallback, useEffect } from 'react';
import type {
  ExecLogEvent,
  UISchema,
  CapabilityDump,
  AnalysisProgressEvent,
  ProjectMeta,
  SearchResult,
  InstallProgressEvent,
} from '@gui-bridge/shared';

import { DynamicGUI } from './components/DynamicGUI/index.js';
import { LogPanel } from './components/LogPanel.js';
import { AnalyzePanel } from './components/AnalyzePanel/AnalyzePanel.js';
import { ApiKeySetup } from './components/Setup/ApiKeySetup.js';
import { AnalysisProgress } from './components/AnalysisProgress/AnalysisProgress.js';
import { SchemaReview } from './components/SchemaReview/SchemaReview.js';
import { ProjectBrowser, InstallProgress } from './components/ProjectBrowser/index.js';
import { ProjectLibrary } from './components/ProjectLibrary/index.js';
import { Settings } from './components/Settings/index.js';
import { Onboarding } from './components/Onboarding/Onboarding.js';

// ── View state machine ────────────────────────────────────────────────────────

type MainView =
  | { type: 'browser' }
  | { type: 'installing'; projectId: string; owner: string; repo: string }
  | { type: 'project'; projectId: string }
  | { type: 'analyze' }
  | { type: 'settings' };

type DockerStatus = 'checking' | 'ok' | 'error';
type AnalyzePhase = 'idle' | 'progress' | 'review' | 'ready';

// ── Component ─────────────────────────────────────────────────────────────────

export function App() {
  // ── Log state ────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<ExecLogEvent[]>([]);

  // ── Global state ─────────────────────────────────────────────────────
  const [view, setView] = useState<MainView>({ type: 'browser' });
  const [dockerStatus, setDockerStatus] = useState<DockerStatus>('checking');
  const [installedProjects, setInstalledProjects] = useState<ProjectMeta[]>([]);

  // ── Project view state ───────────────────────────────────────────────
  const [projectSchema, setProjectSchema] = useState<UISchema | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  // ── Install state ────────────────────────────────────────────────────
  const [installEvents, setInstallEvents] = useState<InstallProgressEvent[]>([]);
  const [installComplete, setInstallComplete] = useState(false);
  const [justInstalledId, setJustInstalledId] = useState<string | null>(null);

  // ── Analyze pipeline state ───────────────────────────────────────────
  const [analyzePhase, setAnalyzePhase] = useState<AnalyzePhase>('idle');
  const [progressEvents, setProgressEvents] = useState<AnalysisProgressEvent[]>([]);
  const [generatedDump, setGeneratedDump] = useState<CapabilityDump | null>(null);
  const [generatedSchema, setGeneratedSchema] = useState<UISchema | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [pendingRepoDir, setPendingRepoDir] = useState('');
  const [pendingDockerImage, setPendingDockerImage] = useState('');

  // ── API key modal ────────────────────────────────────────────────────
  const [showApiKeySetup, setShowApiKeySetup] = useState(false);

  // ── Onboarding + connectivity ─────────────────────────────────────────
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showLogs, setShowLogs] = useState(false);

  // ── Theme ─────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('clui-theme') as 'dark' | 'light') ?? 'dark';
  });

  // ── Apply theme ───────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('clui-theme', theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  // ── Log handlers ──────────────────────────────────────────────────────
  const handleLog = useCallback((event: ExecLogEvent) => {
    setLogs((prev) => [...prev, event]);
  }, []);

  const handleClearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // ── Init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    // Check onboarding status + initial docker health
    window.electronAPI.config.get().then((configRes) => {
      setOnboardingDone(configRes.config.onboardingComplete === true);
    });
    window.electronAPI.docker.checkHealth().then((res) => {
      setDockerStatus(res.ok ? 'ok' : 'error');
    });

    // Load installed projects
    refreshProjects();

    // Live docker status updates from health monitor
    const cleanupDocker = window.electronAPI.on.dockerStatus((event) => {
      setDockerStatus(event.running ? 'ok' : 'error');
    });

    // Install progress events
    const cleanupInstall = window.electronAPI.on.installProgress((event) => {
      setInstallEvents((prev) => [...prev, event]);
      if (event.stage === 'complete' || event.stage === 'error') {
        setInstallComplete(true);
        refreshProjects();
      }
    });

    // Menu bar actions
    const cleanupMenu = window.electronAPI.on.menuAction((action) => {
      if (action === 'menu:openSettings') setView({ type: 'settings' });
      else if (action === 'menu:newProject') setView({ type: 'browser' });
      else if (action === 'menu:toggleLogs') setShowLogs((prev) => !prev);
    });

    return () => {
      cleanupDocker();
      cleanupInstall();
      cleanupMenu();
    };
  }, []);

  // ── Online/offline detection ───────────────────────────────────────────
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.metaKey) return;
      if (e.key === 'k') { e.preventDefault(); setView({ type: 'browser' }); }
      if (e.key === ',') { e.preventDefault(); setView({ type: 'settings' }); }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function refreshProjects() {
    window.electronAPI.projects.list().then((res) => {
      setInstalledProjects(res.projects);
    });
  }

  // ── Navigation ────────────────────────────────────────────────────────
  function navigate(newView: MainView) {
    setView(newView);

    if (newView.type === 'project') {
      loadProject(newView.projectId);
    }
  }

  async function loadProject(projectId: string) {
    setProjectLoading(true);
    setProjectSchema(null);
    setProjectError(null);

    const res = await window.electronAPI.projects.get({ projectId });
    setProjectLoading(false);

    if (!res.ok || !res.meta) {
      setProjectError(res.error ?? 'Failed to load project');
      return;
    }

    if (res.schema) {
      setProjectSchema(res.schema);
    } else {
      setProjectError(res.meta.status === 'no-schema'
        ? 'No UI generated yet. Click "Generate UI" from the sidebar menu.'
        : (res.meta.error ?? 'Project has no schema'));
    }
  }

  // ── Install flow ──────────────────────────────────────────────────────
  async function handleInstall(result: SearchResult) {
    const projectId = `${result.owner}--${result.repo}`;
    setInstallEvents([]);
    setInstallComplete(false);
    setJustInstalledId(projectId);
    navigate({ type: 'installing', projectId, owner: result.owner, repo: result.repo });

    // Fire and forget — progress comes via IPC push events
    window.electronAPI.projects.install({
      owner: result.owner,
      repo: result.repo,
      searchResult: result,
    }).then(() => {
      refreshProjects();
    });
  }

  function handleInstallDone() {
    if (justInstalledId) {
      navigate({ type: 'project', projectId: justInstalledId });
    } else {
      navigate({ type: 'browser' });
    }
  }

  // ── Uninstall ─────────────────────────────────────────────────────────
  async function handleUninstall(projectId: string) {
    await window.electronAPI.projects.remove({ projectId });
    refreshProjects();
    if (view.type === 'project' && view.projectId === projectId) {
      navigate({ type: 'browser' });
    }
  }

  // ── Generate UI for project without schema ────────────────────────────
  async function handleGenerateUi(projectId: string) {
    const configRes = await window.electronAPI.config.get();
    if (!configRes.hasApiKey && !configRes.config.mockMode) {
      setShowApiKeySetup(true);
      return;
    }

    setInstallEvents([{ projectId, stage: 'generating', message: 'Starting UI generation…' }]);
    setInstallComplete(false);
    navigate({ type: 'installing', projectId, owner: '', repo: projectId });

    window.electronAPI.projects.generateUi({ projectId }).then((res) => {
      refreshProjects();
      if (res.ok) {
        setJustInstalledId(projectId);
        setInstallComplete(true);
      }
    });
  }

  // ── Analyze pipeline ──────────────────────────────────────────────────
  const runAnalyzePipeline = useCallback(async (repoDir: string, dockerImage: string) => {
    setAnalyzePhase('progress');
    setProgressEvents([]);
    setAnalyzeError(null);
    setPendingRepoDir(repoDir);
    setPendingDockerImage(dockerImage);

    const cleanup = window.electronAPI.on.analysisProgress((event) => {
      setProgressEvents((prev) => [...prev, event]);
    });

    try {
      setProgressEvents([{ stage: 'detecting', message: 'Detecting language and framework…' }]);

      const analyzeRes = await window.electronAPI.analyzer.run({ repoDir, dockerImage });
      if (!analyzeRes.ok || !analyzeRes.dump) {
        const msg = analyzeRes.error ?? 'Analysis failed';
        setAnalyzeError(msg);
        setProgressEvents((prev) => [...prev, { stage: 'error', message: msg }]);
        return;
      }

      const dump = analyzeRes.dump;
      setGeneratedDump(dump);
      setProgressEvents((prev) => [
        ...prev,
        { stage: 'complete', message: `Found ${dump.arguments.length} args · ${dump.subcommands.length} subcommands` },
        { stage: 'generating-ui', message: 'Generating UI with AI…', detail: `${dump.stack.language} · ${dump.stack.framework}` },
      ]);

      const genRes = await window.electronAPI.schema.generate({ dump, dockerImage });
      if (!genRes.ok || !genRes.schema) {
        const msg = genRes.error ?? 'Schema generation failed';
        setAnalyzeError(msg);
        setProgressEvents((prev) => [...prev, { stage: 'error', message: msg }]);
        return;
      }

      setGeneratedSchema(genRes.schema);
      setProgressEvents((prev) => [...prev, { stage: 'complete', message: 'UI schema generated.' }]);
      setTimeout(() => setAnalyzePhase('review'), 600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAnalyzeError(msg);
      setProgressEvents((prev) => [...prev, { stage: 'error', message: msg }]);
    } finally {
      cleanup();
    }
  }, []);

  const handleAnalyze = useCallback(async (repoDir: string, dockerImage: string) => {
    const configRes = await window.electronAPI.config.get();
    if (!configRes.hasApiKey && !configRes.config.mockMode) {
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

  // ── Main content renderer ─────────────────────────────────────────────
  function renderMain() {
    switch (view.type) {
      case 'browser':
        return (
          <ProjectBrowser
            installedProjects={installedProjects}
            onInstall={handleInstall}
          />
        );

      case 'installing': {
        const isComplete = installComplete;
        return (
          <div style={styles.mainContent}>
            <InstallProgress
              projectName={view.repo || view.projectId}
              events={installEvents}
            />
            {isComplete && (
              <button type="button" style={styles.openProjectBtn} onClick={handleInstallDone}>
                Open Project →
              </button>
            )}
          </div>
        );
      }

      case 'project':
        if (projectLoading) {
          return <div style={styles.loading}>Loading project…</div>;
        }
        if (projectError) {
          return (
            <div style={styles.errorBox}>
              <div style={styles.errorTitle}>Cannot load project</div>
              <div style={styles.errorMsg}>{projectError}</div>
            </div>
          );
        }
        if (projectSchema) {
          return (
            <DynamicGUI
              key={view.projectId}
              schema={projectSchema}
              onLog={handleLog}
              onClearLogs={handleClearLogs}
              dockerStatus={dockerStatus}
              projectId={view.projectId}
              onSchemaImproved={(s) => setProjectSchema(s)}
            />
          );
        }
        return null;

      case 'analyze':
        return renderAnalyzeView();

      case 'settings':
        return <Settings theme={theme} onToggleTheme={toggleTheme} />;

      default:
        return null;
    }
  }

  function renderAnalyzeView() {
    switch (analyzePhase) {
      case 'idle':
        return <AnalyzePanel onAnalyze={handleAnalyze} disabled={false} />;

      case 'progress':
        return (
          <>
            <AnalysisProgress
              events={progressEvents}
              toolName={pendingDockerImage.split('/').pop()?.split(':')[0]}
            />
            {analyzeError && (
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  style={styles.backBtn}
                  onClick={() => { setAnalyzePhase('idle'); setAnalyzeError(null); }}
                >
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
            onApprove={(s) => { setGeneratedSchema(s); setAnalyzePhase('ready'); }}
            onBack={() => { setAnalyzePhase('idle'); setAnalyzeError(null); }}
          />
        );

      case 'ready':
        if (!generatedSchema) return null;
        return (
          <>
            <div style={styles.analyzeReadyBar}>
              <button type="button" style={styles.backBtn} onClick={() => setAnalyzePhase('review')}>
                ← Back to review
              </button>
              <span style={styles.analyzeToolName}>{generatedSchema.projectName}</span>
              <button
                type="button"
                style={styles.editSchemaBtn}
                onClick={() => setAnalyzePhase('review')}
              >
                Edit Schema
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
  }

  // Show nothing until onboarding state is resolved
  if (onboardingDone === null) return null;

  return (
    <div style={styles.root}>
      {/* Onboarding overlay */}
      {!onboardingDone && (
        <Onboarding
          onComplete={() => setOnboardingDone(true)}
          onInstall={(result) => { setOnboardingDone(true); handleInstall(result); }}
        />
      )}

      {/* API Key Setup modal */}
      {showApiKeySetup && <ApiKeySetup onSaved={handleApiKeySaved} />}

      {/* Top bar */}
      <div style={styles.topBar}>
        <span style={styles.appName}>CLUI</span>
        <StatusDot state={dockerStatus} />
        {dockerStatus !== 'ok' && (
          <span style={styles.dockerLabel}>
            {dockerStatus === 'checking' && 'Checking Docker…'}
            {dockerStatus === 'error' && 'Docker not running'}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          style={{ ...styles.topBarBtn, ...(showLogs ? styles.topBarBtnActive : {}) }}
          onClick={() => setShowLogs((v) => !v)}
          title="Toggle Console (⌘L)"
        >
          Console
        </button>
      </div>

      {/* Offline banner */}
      {!isOnline && (
        <div style={styles.offlineBanner}>
          No internet connection — GitHub search and AI features unavailable
        </div>
      )}

      {/* Three-column layout: sidebar | main | logs */}
      <div style={styles.layout}>
        {/* Sidebar */}
        <ProjectLibrary
          projects={installedProjects}
          view={view}
          onNavigate={navigate}
          onUninstall={handleUninstall}
          onOpenFolder={(id) => window.electronAPI.projects.openFolder(id)}
          onGenerateUi={handleGenerateUi}
        />

        {/* Main content */}
        <div style={styles.main}>
          {renderMain()}
        </div>

        {/* Log panel (toggleable) */}
        {showLogs && (
          <div style={styles.logPanel}>
            <LogPanel logs={logs} onClear={handleClearLogs} />
          </div>
        )}
      </div>
    </div>
  );
}

function StatusDot({ state }: { state: DockerStatus }) {
  const color = state === 'ok' ? 'var(--green)' : state === 'error' ? 'var(--red)' : 'var(--yellow)';
  const label = state === 'ok' ? 'Docker ready' : state === 'error' ? 'Docker not running' : 'Checking Docker…';
  return (
    <div title={label} style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0 }} />
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' },
  topBar: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 16px', borderBottom: '1px solid var(--border)',
    background: 'var(--surface)', flexShrink: 0,
  },
  appName: {
    fontSize: 13, fontWeight: 800, letterSpacing: '-0.02em',
    color: 'var(--text)',
    marginRight: 4,
  },
  dockerLabel: { fontSize: 11, color: 'var(--text-muted)' },
  topBarBtn: {
    background: 'transparent', border: '1px solid var(--border)',
    borderRadius: 5, color: 'var(--text-muted)', fontSize: 11,
    padding: '2px 8px', cursor: 'pointer',
  },
  topBarBtnActive: {
    borderColor: 'var(--border)', color: 'var(--text)',
    background: 'var(--surface-2)',
  },
  offlineBanner: {
    background: 'rgba(251,191,36,0.12)', borderBottom: '1px solid rgba(251,191,36,0.3)',
    color: '#fbbf24', fontSize: 11, textAlign: 'center' as const,
    padding: '5px 16px', flexShrink: 0,
  },
  layout: { display: 'flex', flex: 1, overflow: 'hidden' },
  main: {
    flex: 1, overflowY: 'auto', padding: 16,
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  logPanel: {
    width: 260, flexShrink: 0,
    display: 'flex', flexDirection: 'column',
    borderLeft: '1px solid var(--border)',
  },
  mainContent: { display: 'flex', flexDirection: 'column', gap: 16 },
  openProjectBtn: {
    border: 'none', borderRadius: 10,
    background: 'var(--green)', color: '#fff',
    fontWeight: 700, fontSize: 15, padding: '12px 24px', cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  loading: { padding: 24, color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' },
  errorBox: {
    padding: 20, background: 'var(--surface)',
    border: '1px solid var(--red)', borderRadius: 12,
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  errorTitle: { fontSize: 14, fontWeight: 700, color: 'var(--red)' },
  errorMsg: { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.5 },
  backBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-muted)', fontSize: 12, padding: 0,
  },
  analyzeReadyBar: {
    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4,
  },
  analyzeToolName: { fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 },
  editSchemaBtn: {
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '4px 10px',
    fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer',
  },
};
