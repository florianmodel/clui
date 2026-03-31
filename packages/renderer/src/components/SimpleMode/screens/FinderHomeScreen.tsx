import { useEffect, useState } from 'react';
import type { RecentFolder, FolderKind, RecentFile, FileKind } from '@gui-bridge/shared';

interface Props {
  onOpenFolder: (folderPath: string) => void;
  onOpenFile: (filePath: string) => void;
}

function kindIcon(kind: FolderKind): string {
  if (kind === 'node') return '🟢';
  if (kind === 'python') return '🐍';
  if (kind === 'rust') return '🦀';
  if (kind === 'media-heavy') return '🗂';
  if (kind === 'mixed') return '🧩';
  return '📁';
}

function fileKindIcon(kind: FileKind): string {
  if (kind === 'image') return '🖼️';
  if (kind === 'video') return '🎬';
  if (kind === 'audio') return '🎵';
  if (kind === 'document') return '📄';
  if (kind === 'data') return '📊';
  return '📎';
}

export function FinderHomeScreen({ onOpenFolder, onOpenFile }: Props) {
  const [recents, setRecents] = useState<RecentFolder[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);

  useEffect(() => {
    void window.electronAPI.folder.listRecents().then((res) => setRecents(res.recents));
    void window.electronAPI.files.listRecents().then((res) => setRecentFiles(res.recents));
  }, []);

  async function handleBrowse() {
    const result = await window.electronAPI.files.pick({
      title: 'Choose folder',
      properties: ['openDirectory'],
    });
    if (!result.canceled && result.filePaths[0]) {
      onOpenFolder(result.filePaths[0]);
    }
  }

  async function handleBrowseFile() {
    const result = await window.electronAPI.files.pick({
      title: 'Choose file',
      properties: ['openFile'],
    });
    if (!result.canceled && result.filePaths[0]) {
      onOpenFile(result.filePaths[0]);
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.content}>
        <div style={styles.badge}>Finder mode</div>
        <div style={styles.title}>Choose a folder</div>
        <div style={styles.subtitle}>
          CLUI will explain what it sees in the folder and show safe things you can do there.
        </div>

        <div style={styles.primaryActions}>
          <button type="button" style={styles.primaryBtn} onClick={handleBrowse}>
            Choose folder…
          </button>
          <button type="button" style={styles.secondaryBtn} onClick={handleBrowseFile}>
            Choose file…
          </button>
        </div>

        <div style={styles.panel}>
          <div style={styles.panelTitle}>Recent folders</div>
          {recents.length === 0 ? (
            <div style={styles.emptyState}>No recent folders yet. Pick one to get started.</div>
          ) : (
            <div style={styles.recentsList}>
              {recents.map((recent) => (
                <button
                  key={recent.folderPath}
                  type="button"
                  style={styles.recentCard}
                  onClick={() => onOpenFolder(recent.folderPath)}
                >
                  <div style={styles.recentIcon}>{kindIcon(recent.kind)}</div>
                  <div style={styles.recentInfo}>
                    <div style={styles.recentName}>{recent.folderName}</div>
                    <div style={styles.recentPath}>{recent.folderPath}</div>
                    <div style={styles.recentSummary}>{recent.summary}</div>
                  </div>
                  <div style={styles.recentArrow}>→</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={styles.panel}>
          <div style={styles.panelTitle}>Recent files</div>
          {recentFiles.length === 0 ? (
            <div style={styles.emptyState}>No recent files yet. Pick one to inspect it here.</div>
          ) : (
            <div style={styles.recentsList}>
              {recentFiles.map((recent) => (
                <button
                  key={recent.filePath}
                  type="button"
                  style={styles.recentCard}
                  onClick={() => onOpenFile(recent.filePath)}
                >
                  <div style={styles.recentIcon}>{fileKindIcon(recent.kind)}</div>
                  <div style={styles.recentInfo}>
                    <div style={styles.recentName}>{recent.fileName}</div>
                    <div style={styles.recentPath}>{recent.filePath}</div>
                    <div style={styles.recentSummary}>{recent.summary}</div>
                  </div>
                  <div style={styles.recentArrow}>→</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    padding: '32px 24px',
  },
  content: {
    width: '100%',
    maxWidth: 760,
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  badge: {
    alignSelf: 'flex-start',
    padding: '4px 10px',
    borderRadius: 999,
    background: 'var(--accent-dim)',
    color: 'var(--text)',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  title: {
    fontSize: 32,
    fontWeight: 800,
    color: 'var(--text)',
    letterSpacing: '-0.03em',
  },
  subtitle: {
    maxWidth: 560,
    color: 'var(--text-muted)',
    fontSize: 15,
    lineHeight: 1.6,
  },
  primaryBtn: {
    padding: '12px 18px',
    borderRadius: 12,
    border: 'none',
    background: 'var(--accent)',
    color: 'var(--bg)',
    fontSize: 14,
    fontWeight: 700,
    fontFamily: 'inherit',
  },
  secondaryBtn: {
    padding: '12px 18px',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: 14,
    fontWeight: 700,
    fontFamily: 'inherit',
  },
  primaryActions: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap' as const,
    alignSelf: 'flex-start',
  },
  panel: {
    marginTop: 6,
    padding: '18px',
    borderRadius: 18,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  panelTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  },
  emptyState: {
    color: 'var(--text-muted)',
    fontSize: 13,
  },
  recentsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  recentCard: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 16px',
    borderRadius: 14,
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
    color: 'var(--text)',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
  },
  recentIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'var(--surface)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    flexShrink: 0,
  },
  recentInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  recentName: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text)',
  },
  recentPath: {
    fontSize: 11,
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  recentSummary: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  recentArrow: {
    fontSize: 18,
    color: 'var(--text-muted)',
    flexShrink: 0,
  },
};
