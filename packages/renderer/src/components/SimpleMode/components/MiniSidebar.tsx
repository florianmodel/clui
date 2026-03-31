import { useState } from 'react';
import type { ProjectMeta } from '@gui-bridge/shared';
import type { InstallProgressEvent } from '@gui-bridge/shared';

interface BackgroundInstall {
  projectId: string;
  projectName: string;
  stage: InstallProgressEvent['stage'];
}

interface Props {
  projects: ProjectMeta[];
  backgroundInstalls: BackgroundInstall[];
  activeProjectId?: string;
  isFinderActive?: boolean;
  onSelectProject: (projectId: string) => void;
  onUninstall: (projectId: string) => void;
  onNewTool: () => void;
  onOpenFinder: () => void;
  onOpenSettings: () => void;
}

function getToolIcon(repo: string): string {
  const r = repo.toLowerCase();
  if (r.includes('ffmpeg') || r.includes('video')) return '🎬';
  if (r.includes('image') || r.includes('magick')) return '🖼️';
  if (r.includes('pdf')) return '📄';
  if (r.includes('audio') || r.includes('mp3')) return '🎵';
  if (r.includes('yt') || r.includes('youtube')) return '📺';
  if (r.includes('pandoc') || r.includes('doc')) return '📝';
  if (r.includes('zip') || r.includes('compress')) return '📦';
  return '⚙️';
}

function friendlyName(repo: string): string {
  return repo.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function MiniSidebar({ projects, backgroundInstalls, activeProjectId, isFinderActive, onSelectProject, onUninstall, onNewTool, onOpenFinder, onOpenSettings }: Props) {
  const [hovered, setHovered] = useState(false);
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);

  const visibleProjects = projects.filter((p) => p.status === 'ready' || p.status === 'no-schema');

  async function handleDelete(projectId: string, repo: string, e: React.MouseEvent) {
    e.stopPropagation(); // don't select the project
    const res = await window.electronAPI.dialog.confirm({
      title: 'Remove Tool',
      message: `Remove ${friendlyName(repo)}? This will delete the project files and Docker image.`,
      confirmLabel: 'Remove',
    });
    if (res.confirmed) onUninstall(projectId);
  }

  return (
    <div
      style={{ ...styles.sidebar, width: hovered ? 200 : 52 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setHoveredProjectId(null); }}
    >
      {/* Logo */}
      <div style={styles.logo}>
        <span style={styles.logoIcon}>✦</span>
        {hovered && <span style={styles.logoText}>CLUI</span>}
      </div>

      <div style={styles.divider} />

      {/* New tool button */}
      <button
        type="button"
        style={{ ...styles.sidebarBtn, ...(hovered ? styles.sidebarBtnExpanded : {}) }}
        onClick={onNewTool}
        title="Add a tool"
      >
        <span style={styles.btnIcon}>+</span>
        {hovered && <span style={styles.btnLabel}>Add a tool</span>}
      </button>

      <button
        type="button"
        style={{
          ...styles.sidebarBtn,
          ...(hovered ? styles.sidebarBtnExpanded : {}),
          ...(isFinderActive ? styles.sidebarBtnActive : {}),
        }}
        onClick={onOpenFinder}
        title="Finder mode"
      >
        <span style={styles.btnIcon}>🗂</span>
        {hovered && <span style={styles.btnLabel}>Finder mode</span>}
      </button>

      <div style={styles.divider} />

      {/* Your tools section */}
      {hovered && visibleProjects.length > 0 && (
        <div style={styles.sectionLabel}>Your tools</div>
      )}

      {visibleProjects.map((p) => (
        <div
          key={p.projectId}
          style={{ position: 'relative' }}
          onMouseEnter={() => setHoveredProjectId(p.projectId)}
          onMouseLeave={() => setHoveredProjectId(null)}
        >
          <button
            type="button"
            style={{
              ...styles.sidebarBtn,
              ...(hovered ? styles.sidebarBtnExpanded : {}),
              ...(activeProjectId === p.projectId ? styles.sidebarBtnActive : {}),
              // Make room for the delete button when expanded + hovered
              paddingRight: hovered && hoveredProjectId === p.projectId ? 28 : undefined,
            }}
            onClick={() => onSelectProject(p.projectId)}
            title={friendlyName(p.repo)}
          >
            <span style={styles.btnIcon}>{getToolIcon(p.repo)}</span>
            {hovered && (
              <span style={styles.btnLabel}>
                {friendlyName(p.repo)}
                {p.status === 'no-schema' ? ' · needs UI' : ''}
              </span>
            )}
          </button>

          {/* Delete button — only visible when sidebar is expanded AND this row is hovered */}
          {hovered && hoveredProjectId === p.projectId && (
            <button
              type="button"
              style={styles.deleteBtn}
              onClick={(e) => handleDelete(p.projectId, p.repo, e)}
              title={`Remove ${friendlyName(p.repo)}`}
            >
              ×
            </button>
          )}
        </div>
      ))}

      {/* Installing tools */}
      {backgroundInstalls.map((bi) => (
        <button
          key={bi.projectId}
          type="button"
          style={{ ...styles.sidebarBtn, ...(hovered ? styles.sidebarBtnExpanded : {}), opacity: 0.6 }}
          title={`Setting up ${bi.projectName}…`}
          disabled
        >
          <span style={{ ...styles.btnIcon, animation: 'spin 1s linear infinite' }}>⟳</span>
          {hovered && <span style={styles.btnLabel}>{bi.projectName}</span>}
        </button>
      ))}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      <div style={styles.divider} />

      {/* Settings */}
      <button
        type="button"
        style={{ ...styles.sidebarBtn, ...(hovered ? styles.sidebarBtnExpanded : {}) }}
        onClick={onOpenSettings}
        title="Settings"
      >
        <span style={styles.btnIcon}>⚙</span>
        {hovered && <span style={styles.btnLabel}>Settings</span>}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    display: 'flex', flexDirection: 'column', gap: 2,
    padding: '12px 6px', background: 'var(--surface)',
    borderRight: '1px solid var(--border)',
    overflowX: 'hidden', flexShrink: 0,
    transition: 'width 0.2s ease',
  },
  logo: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 6px', marginBottom: 4,
    overflow: 'hidden', whiteSpace: 'nowrap' as const,
  },
  logoIcon: { fontSize: 16, color: 'var(--accent)', flexShrink: 0 },
  logoText: { fontSize: 14, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' },
  divider: { height: 1, background: 'var(--border)', margin: '4px 0' },
  sectionLabel: {
    fontSize: 9, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase' as const, letterSpacing: '0.08em',
    padding: '4px 10px', whiteSpace: 'nowrap' as const,
  },
  sidebarBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none',
    borderRadius: 8, cursor: 'pointer',
    width: 40, height: 36, padding: 0,
    transition: 'background 0.15s',
    overflow: 'hidden', flexShrink: 0,
  },
  sidebarBtnExpanded: {
    width: '100%', justifyContent: 'flex-start', gap: 10,
    padding: '0 10px',
  },
  sidebarBtnActive: {
    background: 'var(--surface-2)',
  },
  btnIcon: { fontSize: 16, flexShrink: 0, color: 'var(--text)' },
  btnLabel: {
    fontSize: 12, fontWeight: 500, color: 'var(--text)',
    whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
    flex: 1,
  },
  deleteBtn: {
    position: 'absolute' as const,
    right: 6, top: '50%',
    transform: 'translateY(-50%)',
    width: 20, height: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none',
    color: 'var(--text-muted)', fontSize: 16, lineHeight: 1,
    cursor: 'pointer', borderRadius: 4,
    padding: 0, fontFamily: 'inherit',
    transition: 'color 0.15s, background 0.15s',
  },
};
