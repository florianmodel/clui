import { useState, useCallback } from 'react';

interface Props {
  multiple?: boolean;
  accept?: string;
  value: string[];          // host file paths
  onChange: (paths: string[]) => void;
  label: string;
  description?: string;
}

export function DragDropFile({ multiple, accept, value, onChange, label }: Props) {
  const [dragging, setDragging] = useState(false);
  const [fileNames, setFileNames] = useState<string[]>(value.map((p) => p.split('/').pop() ?? p));

  const handleFiles = useCallback(async (paths: string[]) => {
    if (!multiple) paths = paths.slice(0, 1);
    // Filter by accept extensions if provided
    const filtered = accept
      ? paths.filter((p) => {
          const ext = '.' + p.split('.').pop()?.toLowerCase();
          return accept.split(',').some((a) => a.trim() === ext || a.trim() === '.*');
        })
      : paths;
    const names = filtered.map((p) => p.split('/').pop() ?? p);
    setFileNames(multiple ? [...fileNames, ...names] : names);
    onChange(multiple ? [...value, ...filtered] : filtered);
  }, [multiple, accept, value, fileNames, onChange]);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }
  function handleDragLeave() { setDragging(false); }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    // Paths were resolved by the preload's capture-phase drop listener using
    // webUtils.getPathForFile (Electron 32+ — File.path is gone).
    const paths = window.electronAPI.files.getLastDroppedPaths();
    if (paths.length > 0) void handleFiles(paths);
  }

  async function handleClick() {
    // Fall back to native file picker
    const extensions = accept
      ? [{ name: 'Files', extensions: accept.split(',').map((a) => a.trim().replace(/^\./, '')) }]
      : [];
    const res = await window.electronAPI.files.pick({
      title: `Choose ${label}`,
      filters: extensions.length ? extensions : undefined,
      properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    });
    if (!res.canceled) handleFiles(res.filePaths);
  }

  function removeFile(index: number) {
    const newPaths = value.filter((_, i) => i !== index);
    const newNames = fileNames.filter((_, i) => i !== index);
    onChange(newPaths);
    setFileNames(newNames);
  }

  const hasFiles = fileNames.length > 0;

  return (
    <div style={styles.root}>
      <div
        style={{
          ...styles.dropZone,
          borderColor: dragging ? 'var(--accent)' : hasFiles ? 'var(--green)' : 'var(--border)',
          background: dragging ? 'rgba(var(--accent-rgb),0.06)' : hasFiles ? 'rgba(34,197,94,0.04)' : 'var(--surface)',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        {!hasFiles ? (
          <>
            <div style={styles.dropIcon}>📁</div>
            <div style={styles.dropTitle}>Drag your {multiple ? 'files' : 'file'} here</div>
            <div style={styles.dropSub}>or click to browse</div>
            {accept && <div style={styles.dropAccept}>{accept}</div>}
          </>
        ) : (
          <div style={styles.fileList}>
            {fileNames.map((name, i) => (
              <div key={i} style={styles.fileRow}>
                <span style={styles.fileIcon}>{getFileIcon(name)}</span>
                <span style={styles.fileName}>{name}</span>
                <button
                  type="button"
                  style={styles.removeBtn}
                  onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                >
                  ✕
                </button>
              </div>
            ))}
            {multiple && (
              <div style={styles.addMore}>+ Add more files</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext)) return '🎬';
  if (['mp3', 'wav', 'flac', 'aac', 'm4a'].includes(ext)) return '🎵';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
  if (['pdf'].includes(ext)) return '📄';
  if (['doc', 'docx', 'txt', 'md'].includes(ext)) return '📝';
  return '📎';
}

const styles: Record<string, React.CSSProperties> = {
  root: { width: '100%' },
  dropZone: {
    border: '2px dashed', borderRadius: 16,
    padding: '32px 24px', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 8, minHeight: 140,
    transition: 'border-color 0.2s, background 0.2s',
    userSelect: 'none' as const,
  },
  dropIcon: { fontSize: 36 },
  dropTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text)' },
  dropSub: { fontSize: 13, color: 'var(--text-muted)' },
  dropAccept: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },
  fileList: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  fileRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 10px', borderRadius: 8,
    background: 'var(--surface-2)', border: '1px solid var(--border)',
  },
  fileIcon: { fontSize: 18, flexShrink: 0 },
  fileName: { flex: 1, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  removeBtn: {
    background: 'transparent', border: 'none',
    color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', padding: 2, flexShrink: 0,
  },
  addMore: { fontSize: 12, color: 'var(--accent)', textAlign: 'center' as const, marginTop: 4 },
};
