import { useState, useEffect, useCallback } from 'react';
import type { ProjectMeta, UISchema, InstallProgressEvent, ExecLogEvent } from '@gui-bridge/shared';

import { SetupScreen } from './screens/SetupScreen.js';
import { WelcomeScreen } from './screens/WelcomeScreen.js';
import { DiscoveryScreen } from './screens/DiscoveryScreen.js';
import { GuidedForm } from './screens/GuidedForm.js';
import { ResultScreen } from './screens/ResultScreen.js';
import { MiniSidebar } from './components/MiniSidebar.js';
import { InstallingToast } from './components/InstallingToast.js';
import { SimpleSettings } from './components/SimpleSettings.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type SetupNeeds = 'docker' | 'apikey' | null;

type Screen =
  | { type: 'welcome' }
  | { type: 'discovery'; intent: string }
  | { type: 'guided'; projectId: string; schema: UISchema; schemaSource?: string }
  | { type: 'result'; projectId: string; schema: UISchema; schemaSource?: string; outputFiles: string[]; logs: ExecLogEvent[] }
  | { type: 'settings' };

interface BackgroundInstall {
  projectId: string;
  projectName: string;
  stage: InstallProgressEvent['stage'];
  message: string;
}

interface Props {
  theme: 'dark' | 'light';
  onSwitchToClassic: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SimpleApp({ theme, onSwitchToClassic }: Props) {
  const [screen, setScreen] = useState<Screen>({ type: 'welcome' });
  const [setupNeeds, setSetupNeeds] = useState<SetupNeeds>(null);
  const [installedProjects, setInstalledProjects] = useState<ProjectMeta[]>([]);
  const [backgroundInstalls, setBackgroundInstalls] = useState<BackgroundInstall[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showSettings, setShowSettings] = useState(false);

  // ── Init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    checkSetup();
    refreshProjects();

    const cleanupInstall = window.electronAPI.on.installProgress((event) => {
      setBackgroundInstalls((prev) =>
        prev.map((bi) =>
          bi.projectId === event.projectId
            ? { ...bi, stage: event.stage, message: event.message }
            : bi,
        ),
      );
      if (event.stage === 'complete' || event.stage === 'error') {
        refreshProjects();
        // Auto-remove toast after 4s on complete
        if (event.stage === 'complete') {
          setTimeout(() => {
            setBackgroundInstalls((prev) => prev.filter((bi) => bi.projectId !== event.projectId));
          }, 4000);
        }
      }
    });

    const cleanupDocker = window.electronAPI.on.dockerStatus((ev) => {
      if (ev.running && setupNeeds === 'docker') {
        // Docker just came online — recheck setup
        checkSetup();
      }
    });

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      cleanupInstall();
      cleanupDocker();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  async function checkSetup() {
    const [dockerRes, configRes] = await Promise.all([
      window.electronAPI.docker.checkHealth(),
      window.electronAPI.config.get(),
    ]);
    if (!dockerRes.ok) {
      setSetupNeeds('docker');
    } else if (!configRes.hasApiKey && !configRes.config.mockMode) {
      setSetupNeeds('apikey');
    } else {
      setSetupNeeds(null);
    }
  }

  function refreshProjects() {
    window.electronAPI.projects.list().then((res) => setInstalledProjects(res.projects));
  }

  // ── Install flow ──────────────────────────────────────────────────────
  const startInstall = useCallback((owner: string, repo: string, projectName: string) => {
    const projectId = `${owner}--${repo}`;

    // Add to background installs immediately
    setBackgroundInstalls((prev) => {
      if (prev.find((bi) => bi.projectId === projectId)) return prev;
      return [...prev, { projectId, projectName, stage: 'cloning', message: 'Starting…' }];
    });

    // Fire install in background
    window.electronAPI.projects.install({
      owner,
      repo,
      searchResult: {
        owner, repo,
        fullName: `${owner}/${repo}`,
        description: projectName,
        stars: 0, language: '', topics: [],
        lastUpdated: new Date().toISOString(),
        htmlUrl: `https://github.com/${owner}/${repo}`,
      },
    }).then(() => refreshProjects());
  }, []);

  const openProject = useCallback(async (projectId: string) => {
    const res = await window.electronAPI.projects.get({ projectId });
    if (!res.ok || !res.schema) return;
    const schemaSource = res.meta?.schemaSource;
    setScreen({ type: 'guided', projectId, schema: res.schema, schemaSource });
  }, []);

  const dismissInstall = useCallback((projectId: string) => {
    setBackgroundInstalls((prev) => prev.filter((bi) => bi.projectId !== projectId));
  }, []);

  // ── Render ────────────────────────────────────────────────────────────
  if (setupNeeds !== null) {
    return (
      <SetupScreen
        needs={setupNeeds}
        theme={theme}
        onComplete={() => checkSetup()}
      />
    );
  }

  return (
    <div style={styles.root} data-theme={theme}>
      {/* Subtle offline banner */}
      {!isOnline && (
        <div style={styles.offlineBanner}>
          No internet — search unavailable
        </div>
      )}

      <div style={styles.layout}>
        {/* Mini sidebar */}
        <MiniSidebar
          projects={installedProjects}
          backgroundInstalls={backgroundInstalls}
          activeProjectId={screen.type === 'guided' || screen.type === 'result' ? screen.projectId : undefined}
          onSelectProject={openProject}
          onNewTool={() => setScreen({ type: 'welcome' })}
          onOpenSettings={() => setShowSettings(true)}
        />

        {/* Main content */}
        <div style={styles.main}>
          {screen.type === 'welcome' && (
            <WelcomeScreen
              installedProjects={installedProjects}
              onIntent={(intent) => setScreen({ type: 'discovery', intent })}
              onOpenProject={openProject}
            />
          )}

          {screen.type === 'discovery' && (
            <DiscoveryScreen
              intent={screen.intent}
              installedProjects={installedProjects}
              onInstall={(owner, repo, name) => {
                startInstall(owner, repo, name);
                setScreen({ type: 'welcome' });
              }}
              onOpenProject={openProject}
              onBack={() => setScreen({ type: 'welcome' })}
            />
          )}

          {screen.type === 'guided' && (
            <GuidedForm
              key={screen.projectId}
              schema={screen.schema}
              projectId={screen.projectId}
              schemaSource={screen.schemaSource}
              onResult={(outputFiles, logs) =>
                setScreen({ type: 'result', projectId: screen.projectId, schema: screen.schema, schemaSource: screen.schemaSource, outputFiles, logs })
              }
              onBack={() => setScreen({ type: 'welcome' })}
            />
          )}

          {screen.type === 'result' && (
            <ResultScreen
              outputFiles={screen.outputFiles}
              logs={screen.logs}
              onRunAgain={() =>
                setScreen({ type: 'guided', projectId: screen.projectId, schema: screen.schema, schemaSource: screen.schemaSource })
              }
              onNewTask={() => setScreen({ type: 'welcome' })}
            />
          )}
        </div>
      </div>

      {/* Settings modal */}
      {showSettings && (
        <SimpleSettings
          onClose={() => setShowSettings(false)}
          onSwitchToClassic={() => { setShowSettings(false); onSwitchToClassic(); }}
        />
      )}

      {/* Background install toasts */}
      <div style={styles.toastStack}>
        {backgroundInstalls.map((bi) => (
          <InstallingToast
            key={bi.projectId}
            projectName={bi.projectName}
            stage={bi.stage}
            message={bi.message}
            onOpen={bi.stage === 'complete' ? () => openProject(bi.projectId) : undefined}
            onDismiss={() => dismissInstall(bi.projectId)}
          />
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    background: 'var(--bg)', overflow: 'hidden',
  },
  offlineBanner: {
    background: 'rgba(251,191,36,0.1)', borderBottom: '1px solid rgba(251,191,36,0.2)',
    color: '#fbbf24', fontSize: 11, textAlign: 'center' as const,
    padding: '4px 16px', flexShrink: 0,
  },
  layout: { display: 'flex', flex: 1, overflow: 'hidden' },
  main: { flex: 1, overflowY: 'auto' as const, display: 'flex', flexDirection: 'column' },
  toastStack: {
    position: 'fixed' as const, bottom: 16, right: 16,
    display: 'flex', flexDirection: 'column', gap: 8,
    zIndex: 1000,
  },
};
