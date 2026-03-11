import { useState, useEffect } from 'react';
import type { FileInfo } from '@gui-bridge/shared';
import { useToast } from '../common/Toast.js';

interface Props {
  filePath: string;
}

const typeIcon: Record<string, string> = {
  image: '🖼️',
  video: '🎬',
  audio: '🎵',
  document: '📄',
  data: '📊',
  other: '📁',
};

export function FileCard({ filePath }: Props) {
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    window.electronAPI.files.getInfo({ filePath }).then((res) => {
      if (res.ok && res.info) setInfo(res.info);
    });
  }, [filePath]);

  const name = info?.name ?? filePath.split('/').pop() ?? filePath;
  const icon = typeIcon[info?.type ?? 'other'];

  async function handleOpen() {
    await window.electronAPI.files.open(filePath);
  }

  async function handleShowInFinder() {
    await window.electronAPI.files.showInFinder(filePath);
  }

  async function handleCopyPath() {
    await window.electronAPI.clipboard.write(filePath);
    showToast('Path copied to clipboard');
  }

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.icon}>{icon}</span>
        <div style={styles.meta}>
          <span style={styles.name}>{name}</span>
          {info && <span style={styles.size}>{info.sizeLabel}</span>}
        </div>
      </div>

      {/* Inline image preview */}
      {info?.previewable && info.type === 'image' && (
        <div style={styles.previewContainer}>
          {showPreview ? (
            <img
              src={`file://${filePath}`}
              alt={name}
              style={styles.previewImage}
              onError={() => setShowPreview(false)}
            />
          ) : (
            <button
              type="button"
              style={styles.previewBtn}
              onClick={() => setShowPreview(true)}
            >
              Show preview
            </button>
          )}
        </div>
      )}

      <div style={styles.actions}>
        <button type="button" style={styles.actionBtn} onClick={handleOpen}>
          Open
        </button>
        <button type="button" style={styles.actionBtn} onClick={handleShowInFinder}>
          Show in Finder
        </button>
        <button type="button" style={styles.actionBtnMuted} onClick={handleCopyPath}>
          Copy path
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex', flexDirection: 'column', gap: 10,
    padding: '12px 14px',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
  },
  header: { display: 'flex', alignItems: 'center', gap: 10 },
  icon: { fontSize: 20, flexShrink: 0 },
  meta: { display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 },
  name: {
    fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--green)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  size: { fontSize: 11, color: 'var(--text-muted)' },
  previewContainer: { borderRadius: 6, overflow: 'hidden', background: 'var(--surface)' },
  previewImage: {
    width: '100%', maxHeight: 200,
    objectFit: 'contain', display: 'block',
  },
  previewBtn: {
    width: '100%', padding: '8px', background: 'transparent',
    border: 'none', color: 'var(--text-muted)',
    fontSize: 12, cursor: 'pointer', fontStyle: 'italic',
  },
  actions: { display: 'flex', gap: 6 },
  actionBtn: {
    flex: 1, border: '1px solid var(--border)', borderRadius: 6,
    background: 'transparent', color: 'var(--text)',
    fontSize: 12, padding: '5px 8px', cursor: 'pointer',
  },
  actionBtnMuted: {
    border: '1px solid var(--border)', borderRadius: 6,
    background: 'transparent', color: 'var(--text-muted)',
    fontSize: 12, padding: '5px 8px', cursor: 'pointer',
  },
};
