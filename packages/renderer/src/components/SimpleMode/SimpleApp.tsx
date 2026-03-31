import { useState, useEffect, useCallback } from 'react';
import type { ProjectMeta, UISchema, ExecLogEvent } from '@gui-bridge/shared';

import { SetupScreen } from './screens/SetupScreen.js';
import { WelcomeScreen } from './screens/WelcomeScreen.js';
import { DiscoveryScreen } from './screens/DiscoveryScreen.js';
import { InstallingScreen } from './screens/InstallingScreen.js';
import { GuidedForm } from './screens/GuidedForm.js';
import { ResultScreen } from './screens/ResultScreen.js';
import { FinderHomeScreen } from './screens/FinderHomeScreen.js';
import { FinderFolderScreen } from './screens/FinderFolderScreen.js';
import { FinderFileScreen } from './screens/FinderFileScreen.js';
import { MiniSidebar } from './components/MiniSidebar.js';
import { SimpleSettings } from './components/SimpleSettings.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type SetupNeeds = 'runtime' | 'apikey' | null;

type BackTarget =
  | { type: 'welcome' }
  | { type: 'finderHome' }
  | { type: 'finderFolder'; folderPath: string }
  | { type: 'finderFile'; filePath: string };

interface OpenProjectOptions {
  sourceFilePath?: string;
  backTo?: BackTarget;
}

type Screen =
  | { type: 'welcome' }
  | { type: 'discovery'; intent: string }
  | { type: 'finderHome' }
  | { type: 'finderFolder'; folderPath: string }
  | { type: 'finderFile'; filePath: string }
  | { type: 'installing'; owner: string; repo: string; projectName: string; backTo?: BackTarget; launchFilePath?: string }
  | { type: 'guided'; projectId: string; schema: UISchema; schemaSource?: string; initialValues?: Record<string, unknown>; contextHint?: { title: string; description: string }; backTo?: BackTarget }
  | { type: 'result'; projectId: string; schema: UISchema; schemaSource?: string; outputFiles: string[]; logs: ExecLogEvent[]; initialValues?: Record<string, unknown>; contextHint?: { title: string; description: string }; backTo?: BackTarget }
  | { type: 'settings' };

interface Props {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onSwitchToClassic: () => void;
}

function getAutoFillStep(schema: UISchema): UISchema['workflows'][number]['steps'][number] | null {
  const workflow = schema.workflows[0];
  if (!workflow) return null;
  const visibleSteps = workflow.steps.filter((step) => !step.advanced || step.required);
  const fileSteps = visibleSteps.filter((step) => step.type === 'file_input');
  return fileSteps.length === 1 ? fileSteps[0] : null;
}

function buildFileLaunchOptions(schema: UISchema, filePath: string): Pick<Extract<Screen, { type: 'guided' }>, 'initialValues' | 'contextHint'> {
  const fileStep = getAutoFillStep(schema);
  if (!fileStep) {
    return {
      contextHint: {
        title: 'Selected file',
        description: `${filePath.split('/').pop() ?? filePath} is the file you came from. This tool does not have one obvious single-file input, so CLUI left the form untouched.`,
      },
    };
  }

  return {
    initialValues: {
      [fileStep.id]: fileStep.multiple ? [filePath] : filePath,
    },
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SimpleApp({ theme, onToggleTheme, onSwitchToClassic }: Props) {
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

  async function handleUninstall(projectId: string) {
    await window.electronAPI.projects.remove({ projectId });
    refreshProjects();
    // If the removed project is currently open, go back to welcome
    if ((screen.type === 'guided' || screen.type === 'result') && screen.projectId === projectId) {
      setScreen({ type: 'welcome' });
    }
  }

  function navigateTo(target?: BackTarget) {
    if (!target || target.type === 'welcome') {
      setScreen({ type: 'welcome' });
      return;
    }
    if (target.type === 'finderHome') {
      setScreen({ type: 'finderHome' });
      return;
    }
    if (target.type === 'finderFolder') {
      setScreen({ type: 'finderFolder', folderPath: target.folderPath });
      return;
    }
    setScreen({ type: 'finderFile', filePath: target.filePath });
  }

  // ── Navigation ────────────────────────────────────────────────────────
  const openProject = useCallback(async (projectId: string, options?: OpenProjectOptions) => {
    const res = await window.electronAPI.projects.get({ projectId });
    if (!res.ok || !res.schema) {
      // No schema — project needs UI generation. Re-install to trigger generation.
      if (res.meta) {
        setScreen({
          type: 'installing',
          owner: res.meta.owner,
          repo: res.meta.repo,
          projectName: res.meta.repo,
          backTo: options?.backTo ?? { type: 'welcome' },
          launchFilePath: options?.sourceFilePath,
        });
      }
      return;
    }
    const schemaSource = res.meta?.schemaSource;
    const fileLaunch = options?.sourceFilePath
      ? buildFileLaunchOptions(res.schema, options.sourceFilePath)
      : {};
    setScreen({
      type: 'guided',
      projectId,
      schema: res.schema,
      schemaSource,
      backTo: options?.backTo ?? { type: 'welcome' },
      ...fileLaunch,
    });
  }, []);

  const handleInstallComplete = useCallback(async (projectId: string, options?: OpenProjectOptions) => {
    refreshProjects();
    await openProject(projectId, options);
  }, [openProject]);

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
          isFinderActive={screen.type === 'finderHome' || screen.type === 'finderFolder' || screen.type === 'finderFile'}
          onSelectProject={openProject}
          onUninstall={handleUninstall}
          onNewTool={() => setScreen({ type: 'welcome' })}
          onOpenFinder={() => setScreen({ type: 'finderHome' })}
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
                setScreen({ type: 'installing', owner, repo, projectName: name, backTo: { type: 'welcome' } });
              }}
              onOpenProject={openProject}
              onBack={() => setScreen({ type: 'welcome' })}
            />
          )}

          {screen.type === 'finderHome' && (
            <FinderHomeScreen
              onOpenFolder={(folderPath) => setScreen({ type: 'finderFolder', folderPath })}
              onOpenFile={(filePath) => setScreen({ type: 'finderFile', filePath })}
            />
          )}

          {screen.type === 'finderFolder' && (
            <FinderFolderScreen
              folderPath={screen.folderPath}
              onBack={() => setScreen({ type: 'finderHome' })}
              onOpenProject={openProject}
              onInstall={(owner, repo, name) => {
                setScreen({
                  type: 'installing',
                  owner,
                  repo,
                  projectName: name,
                  backTo: { type: 'finderFolder', folderPath: screen.folderPath },
                });
              }}
            />
          )}

          {screen.type === 'finderFile' && (
            <FinderFileScreen
              filePath={screen.filePath}
              onBack={() => setScreen({ type: 'finderHome' })}
              onOpenProject={(projectId, filePath) => {
                void openProject(projectId, {
                  sourceFilePath: filePath,
                  backTo: { type: 'finderFile', filePath },
                });
              }}
              onInstall={(owner, repo, name, filePath) => {
                setScreen({
                  type: 'installing',
                  owner,
                  repo,
                  projectName: name,
                  backTo: { type: 'finderFile', filePath },
                  launchFilePath: filePath,
                });
              }}
            />
          )}

          {screen.type === 'installing' && (
            <InstallingScreen
              owner={screen.owner}
              repo={screen.repo}
              projectName={screen.projectName}
              onComplete={(projectId) => {
                void handleInstallComplete(projectId, {
                  sourceFilePath: screen.launchFilePath,
                  backTo: screen.backTo,
                });
              }}
              onBack={() => navigateTo(screen.backTo)}
            />
          )}

          {screen.type === 'guided' && (
            <GuidedForm
              key={screen.projectId}
              schema={screen.schema}
              projectId={screen.projectId}
              schemaSource={screen.schemaSource}
              initialValues={screen.initialValues}
              contextHint={screen.contextHint}
              onResult={(outputFiles, logs) =>
                setScreen({
                  type: 'result',
                  projectId: screen.projectId,
                  schema: screen.schema,
                  schemaSource: screen.schemaSource,
                  outputFiles,
                  logs,
                  initialValues: screen.initialValues,
                  contextHint: screen.contextHint,
                  backTo: screen.backTo,
                })
              }
              onBack={() => navigateTo(screen.backTo)}
            />
          )}

          {screen.type === 'result' && (
            <ResultScreen
              outputFiles={screen.outputFiles}
              logs={screen.logs}
              onRunAgain={() =>
                setScreen({
                  type: 'guided',
                  projectId: screen.projectId,
                  schema: screen.schema,
                  schemaSource: screen.schemaSource,
                  initialValues: screen.initialValues,
                  contextHint: screen.contextHint,
                  backTo: screen.backTo,
                })
              }
              onNewTask={() => setScreen({ type: 'welcome' })}
            />
          )}
        </div>
      </div>

      {/* Settings modal */}
      {showSettings && (
        <SimpleSettings
          theme={theme}
          onClose={() => setShowSettings(false)}
          onToggleTheme={onToggleTheme}
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
