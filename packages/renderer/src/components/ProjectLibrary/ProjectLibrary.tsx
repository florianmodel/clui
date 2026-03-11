import type { ProjectMeta } from '@gui-bridge/shared';

type MainView =
  | { type: 'browser' }
  | { type: 'installing'; projectId: string; owner: string; repo: string }
  | { type: 'project'; projectId: string }
  | { type: 'analyze' }
  | { type: 'settings' };

interface Props {
  projects: ProjectMeta[];
  view: MainView;
  onNavigate: (view: MainView) => void;
  onUninstall: (projectId: string) => void;
  onOpenFolder: (projectId: string) => void;
  onGenerateUi: (projectId: string) => void;
}

export function ProjectLibrary({
  projects,
  view,
  onNavigate,
  onUninstall,
  onOpenFolder,
  onGenerateUi,
}: Props) {
  const activeProjectId = view.type === 'project' ? view.projectId : null;
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const [menuFor, setMenuFor] = React.useState<string | null>(null);

  async function handleUninstall(projectId: string, repoName: string) {
    setMenuFor(null);
    const res = await window.electronAPI.dialog.confirm({
      title: 'Uninstall Tool',
      message: `Remove ${repoName}? This will delete the Docker image and all project files.`,
      confirmLabel: 'Uninstall',
    });
    if (res.confirmed) onUninstall(projectId);
  }

  async function handleRegenerateUi(projectId: string, repoName: string) {
    setMenuFor(null);
    const res = await window.electronAPI.dialog.confirm({
      title: 'Regenerate UI',
      message: `Regenerate the UI for ${repoName}? This will overwrite the current schema.`,
      confirmLabel: 'Regenerate',
    });
    if (res.confirmed) onGenerateUi(projectId);
  }

  const isActive = (type: MainView['type']) => view.type === type;

  return (
    <div style={styles.sidebar}>
      {/* App name */}
      <div style={styles.brand}>GUI Bridge</div>

      {/* Add New */}
      <button
        type="button"
        style={{
          ...styles.addBtn,
          ...(isActive('browser') ? styles.addBtnActive : {}),
        }}
        onClick={() => onNavigate({ type: 'browser' })}
      >
        <span style={styles.addIcon}>⊕</span>
        Add New Tool
      </button>

      {/* Installed projects */}
      <div style={styles.sectionLabel}>INSTALLED</div>

      <div style={styles.projectList}>
        {projects.length === 0 && (
          <div style={styles.emptyLib}>No tools installed yet</div>
        )}

        {projects.map((p) => {
          const active = p.projectId === activeProjectId;
          const hovered = p.projectId === hoveredId;
          const showMenu = p.projectId === menuFor;

          return (
            <div
              key={p.projectId}
              style={{ position: 'relative' }}
              onMouseEnter={() => setHoveredId(p.projectId)}
              onMouseLeave={() => { setHoveredId(null); if (!showMenu) setMenuFor(null); }}
            >
              <button
                type="button"
                style={{
                  ...styles.projectItem,
                  ...(active ? styles.projectItemActive : {}),
                  ...(hovered && !active ? styles.projectItemHovered : {}),
                }}
                onClick={() => { onNavigate({ type: 'project', projectId: p.projectId }); setMenuFor(null); }}
              >
                <span style={styles.projectName}>{p.repo}</span>
                {p.status === 'no-schema' && <span style={styles.noSchemaDot} title="No UI generated">!</span>}
                {p.status === 'error' && <span style={styles.errorDot} title={p.error}>✗</span>}

                {/* Context menu trigger */}
                {(hovered || active) && (
                  <button
                    type="button"
                    style={styles.menuTrigger}
                    onClick={(e) => { e.stopPropagation(); setMenuFor(showMenu ? null : p.projectId); }}
                    title="Options"
                  >
                    ···
                  </button>
                )}
              </button>

              {/* Context menu */}
              {showMenu && (
                <div style={styles.menu} onMouseLeave={() => setMenuFor(null)}>
                  {p.status === 'no-schema' && (
                    <button type="button" style={styles.menuItem} onClick={() => { onGenerateUi(p.projectId); setMenuFor(null); }}>
                      ✨ Generate UI
                    </button>
                  )}
                  {p.status === 'ready' && (
                    <button type="button" style={styles.menuItem} onClick={() => handleRegenerateUi(p.projectId, p.repo)}>
                      ✨ Regenerate UI
                    </button>
                  )}
                  <button type="button" style={styles.menuItem} onClick={() => { onOpenFolder(p.projectId); setMenuFor(null); }}>
                    📁 Open Folder
                  </button>
                  <button type="button" style={{ ...styles.menuItem, color: 'var(--red)' }} onClick={() => handleUninstall(p.projectId, p.repo)}>
                    🗑 Uninstall
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom nav */}
      <div style={styles.bottomNav}>
        <button
          type="button"
          style={{ ...styles.navItem, ...(isActive('analyze') ? styles.navItemActive : {}) }}
          onClick={() => onNavigate({ type: 'analyze' })}
        >
          🧪 Generate UI
        </button>
        <button
          type="button"
          style={{ ...styles.navItem, ...(isActive('settings') ? styles.navItemActive : {}) }}
          onClick={() => onNavigate({ type: 'settings' })}
        >
          ⚙ Settings
        </button>
      </div>
    </div>
  );
}

// Need React for useState
import React from 'react';

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 180, flexShrink: 0,
    display: 'flex', flexDirection: 'column',
    borderRight: '1px solid var(--border)',
    background: 'var(--surface)',
    padding: '12px 8px',
    gap: 4,
    overflowY: 'auto',
  },
  brand: {
    fontSize: 13, fontWeight: 800, letterSpacing: '-0.02em',
    padding: '4px 8px 10px',
    background: 'linear-gradient(90deg, #a78bfa, #60a5fa)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
  },
  addBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 10px', borderRadius: 8, width: '100%',
    border: '1px dashed var(--border)',
    background: 'transparent', color: 'var(--text-muted)',
    fontSize: 13, cursor: 'pointer', textAlign: 'left' as const,
    marginBottom: 8,
  },
  addBtnActive: {
    background: 'rgba(167, 139, 250, 0.1)',
    borderColor: 'rgba(167, 139, 250, 0.4)',
    color: '#a78bfa',
  },
  addIcon: { fontSize: 15 },
  sectionLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
    color: 'var(--text-muted)', padding: '4px 10px',
  },
  projectList: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1 },
  emptyLib: { fontSize: 11, color: 'var(--text-muted)', padding: '6px 10px', fontStyle: 'italic' },
  projectItem: {
    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
    padding: '7px 10px', borderRadius: 8, border: 'none',
    background: 'transparent', color: 'var(--text-muted)',
    fontSize: 13, cursor: 'pointer', textAlign: 'left' as const,
    position: 'relative',
  },
  projectItemActive: { background: 'rgba(167, 139, 250, 0.12)', color: '#a78bfa' },
  projectItemHovered: { background: 'var(--surface-2)', color: 'var(--text)' },
  projectName: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  noSchemaDot: {
    fontSize: 11, fontWeight: 700, color: '#fbbf24',
    background: 'rgba(251, 191, 36, 0.12)',
    borderRadius: '50%', width: 16, height: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  errorDot: {
    fontSize: 11, fontWeight: 700, color: 'var(--red)',
    flexShrink: 0,
  },
  menuTrigger: {
    border: 'none', background: 'transparent', color: 'var(--text-muted)',
    cursor: 'pointer', fontSize: 14, padding: '0 2px',
    letterSpacing: 1, lineHeight: 1, flexShrink: 0,
  },
  menu: {
    position: 'absolute', left: 0, top: '100%', zIndex: 100,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 8, minWidth: 160, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    display: 'flex', flexDirection: 'column',
  },
  menuItem: {
    border: 'none', background: 'transparent', color: 'var(--text)',
    fontSize: 13, padding: '8px 14px', cursor: 'pointer', textAlign: 'left' as const,
  },
  bottomNav: {
    display: 'flex', flexDirection: 'column', gap: 2,
    borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4,
  },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 10px', borderRadius: 8, border: 'none',
    background: 'transparent', color: 'var(--text-muted)',
    fontSize: 13, cursor: 'pointer', textAlign: 'left' as const, width: '100%',
  },
  navItemActive: { background: 'var(--surface-2)', color: 'var(--text)' },
};
