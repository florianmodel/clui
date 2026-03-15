import { useState, useEffect, useCallback } from 'react';
import type { ProjectMeta, UISchema, ExecLogEvent } from '@gui-bridge/shared';

import { SetupScreen } from './screens/SetupScreen.js';
import { WelcomeScreen } from './screens/WelcomeScreen.js';
import { DiscoveryScreen } from './screens/DiscoveryScreen.js';
import { InstallingScreen } from './screens/InstallingScreen.js';
import { GuidedForm } from './screens/GuidedForm.js';
import { ResultScreen } from './screens/ResultScreen.js';
import { MiniSidebar } from './components/MiniSidebar.js';
import { SimpleSettings } from './components/SimpleSettings.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type SetupNeeds = 'runtime' | 'apikey' | null;

type Screen =
  | { type: 'welcome' }
  | { type: 'discovery'; intent: string }
  | { type: 'installing'; owner: string; repo: string; projectName: string }
  | { type: 'guided'; projectId: string; schema: UISchema; schemaSource?: string }
  | { type: 'result'; projectId: string; schema: UISchema; schemaSource?: string; outputFiles: string[]; logs: ExecLogEvent[] }
  | { type: 'settings' };

interface Props {
  theme: 'dark' | 'light';
  onSwitchToClassic: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SimpleApp({ theme, onSwitchToClassic }: Props) {
  const [screen, setScreen] = useState<Screen>({ type: 'welcome' });
  const [setupNeeds, setSetupNeeds] = useState<SetupNeeds>(null);
  const [installedProjects, setInstalledProjects] = useState<ProjectMeta[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showSettings, setShowSettings] = useState(false);

  // ── Init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    checkSetup();
    refreshProjects();

    const cleanupDocker = window.electronAPI.on.dockerStatus((ev) => {
      if (ev.running && setupNeeds === 'runtime') checkSetup();
    });

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      cleanupDocker();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  async function checkSetup() {
    const [dockerRes, configRes, nativeRes] = await Promise.all([
      window.electronAPI.docker.checkHealth(),
      window.electronAPI.config.get(),
      window.electronAPI.native.checkCapabilities(),
    ]);

    // Docker OR any native package manager is enough to run tools
    const canRun = dockerRes.ok || nativeRes.hasHomebrew || nativeRes.hasPip || nativeRes.hasNpm || nativeRes.hasCargo;

    if (!canRun) {
      setSetupNeeds('runtime');
    } else if (!configRes.hasApiKey && !configRes.config.mockMode) {
      setSetupNeeds('apikey');
    } else {
      setSetupNeeds(null);
    }
  }

  function refreshProjects() {
    window.electronAPI.projects.list().then((res) => setInstalledProjects(res.projects));
  }

  // ── Navigation ────────────────────────────────────────────────────────
  const openProject = useCallback(async (projectId: string) => {
    const res = await window.electronAPI.projects.get({ projectId });
    if (!res.ok || !res.schema) {
      // No schema — project needs UI generation. Re-install to trigger generation.
      if (res.meta) {
        setScreen({
          type: 'installing',
          owner: res.meta.owner,
          repo: res.meta.repo,
          projectName: res.meta.repo,
        });
      }
      return;
    }
    const schemaSource = res.meta?.schemaSource;
    setScreen({ type: 'guided', projectId, schema: res.schema, schemaSource });
  }, []);

  const handleInstallComplete = useCallback(async (projectId: string) => {
    refreshProjects();
    const res = await window.electronAPI.projects.get({ projectId });
    if (res.ok && res.schema) {
      setScreen({ type: 'guided', projectId, schema: res.schema, schemaSource: res.meta?.schemaSource });
    } else if (res.ok && res.meta) {
      // Schema was just generated but is invalid — this shouldn't normally happen
      // but if it does, go to welcome so the user isn't stuck
      setScreen({ type: 'welcome' });
    } else {
      setScreen({ type: 'welcome' });
    }
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
          backgroundInstalls={[]}
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
                setScreen({ type: 'installing', owner, repo, projectName: name });
              }}
              onOpenProject={openProject}
              onBack={() => setScreen({ type: 'welcome' })}
            />
          )}

          {screen.type === 'installing' && (
            <InstallingScreen
              owner={screen.owner}
              repo={screen.repo}
              projectName={screen.projectName}
              onComplete={handleInstallComplete}
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
};
