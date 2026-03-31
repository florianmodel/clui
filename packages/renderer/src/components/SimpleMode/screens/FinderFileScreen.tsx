import { useEffect, useMemo, useState } from 'react';
import type {
  FileAction,
  FileContext,
  FileEditableField,
  FileMetadataEntry,
} from '@gui-bridge/shared';
import { friendlyProjectName } from '@gui-bridge/shared';

interface Props {
  filePath: string;
  onBack: () => void;
  onOpenProject: (projectId: string, filePath: string) => void;
  onInstall: (owner: string, repo: string, name: string, filePath: string) => void;
}

function kindIcon(kind: FileContext['kind']): string {
  if (kind === 'image') return '🖼️';
  if (kind === 'video') return '🎬';
  if (kind === 'audio') return '🎵';
  if (kind === 'document') return '📄';
  if (kind === 'data') return '📊';
  return '📎';
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function fieldValue<T>(fields: FileEditableField[], id: FileEditableField['id'], fallback: T): T {
  const field = fields.find((item) => item.id === id);
  return (field?.value as T | undefined) ?? fallback;
}

function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)));
}

export function FinderFileScreen({ filePath, onBack, onOpenProject, onInstall }: Props) {
  const [context, setContext] = useState<FileContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftLocked, setDraftLocked] = useState(false);
  const [draftHideExtension, setDraftHideExtension] = useState(false);

  async function loadContext() {
    setLoading(true);
    setError(null);
    setSaveError(null);
    const result = await window.electronAPI.files.scan({ filePath });
    if (!result.ok || !result.context) {
      setContext(null);
      setError(result.error ?? 'Failed to scan file');
      setLoading(false);
      return;
    }
    setContext(result.context);
    setLoading(false);
  }

  useEffect(() => {
    void loadContext();
  }, [filePath]);

  useEffect(() => {
    if (!context) return;
    setDraftTags(fieldValue(context.editableFields, 'tags', []));
    setDraftLocked(fieldValue(context.editableFields, 'locked', false));
    setDraftHideExtension(fieldValue(context.editableFields, 'hideExtension', false));
    setTagInput('');
    setSaveError(null);
  }, [context]);

  const primaryAction = useMemo(
    () => context?.actions.find((action) => action.id === context.primaryActionId) ?? context?.actions[0] ?? null,
    [context],
  );
  const moreActions = useMemo(
    () => context?.actions.filter((action) => action.id !== primaryAction?.id) ?? [],
    [context, primaryAction],
  );

  const hasTagField = context?.editableFields.some((field) => field.id === 'tags') ?? false;
  const hasLockedField = context?.editableFields.some((field) => field.id === 'locked') ?? false;
  const hasHideExtensionField = context?.editableFields.some((field) => field.id === 'hideExtension') ?? false;

  const isDirty = useMemo(() => {
    if (!context) return false;
    return JSON.stringify(normalizeTags(draftTags)) !== JSON.stringify(normalizeTags(fieldValue(context.editableFields, 'tags', [])))
      || draftLocked !== fieldValue(context.editableFields, 'locked', false)
      || draftHideExtension !== fieldValue(context.editableFields, 'hideExtension', false);
  }, [context, draftHideExtension, draftLocked, draftTags]);

  function addTag(rawValue: string) {
    const next = normalizeTags([...draftTags, ...rawValue.split(',')]);
    setDraftTags(next);
    setTagInput('');
  }

  function removeTag(tag: string) {
    setDraftTags((prev) => prev.filter((item) => item !== tag));
  }

  function discardChanges() {
    if (!context) return;
    setDraftTags(fieldValue(context.editableFields, 'tags', []));
    setDraftLocked(fieldValue(context.editableFields, 'locked', false));
    setDraftHideExtension(fieldValue(context.editableFields, 'hideExtension', false));
    setTagInput('');
    setSaveError(null);
  }

  async function saveChanges() {
    if (!context || !isDirty) return;
    setSaving(true);
    setSaveError(null);
    const response = await window.electronAPI.files.applyChanges({
      filePath: context.filePath,
      changes: {
        tags: hasTagField ? normalizeTags(draftTags) : undefined,
        locked: hasLockedField ? draftLocked : undefined,
        hideExtension: hasHideExtensionField ? draftHideExtension : undefined,
      },
    });
    setSaving(false);
    if (!response.ok || !response.context) {
      setSaveError(response.error ?? 'Could not save these file details.');
      return;
    }
    setContext(response.context);
  }

  function handleAction(action: FileAction) {
    if (action.type === 'open-project' && action.projectId) {
      onOpenProject(action.projectId, filePath);
      return;
    }
    if (action.type === 'install-project' && action.owner && action.repo) {
      onInstall(action.owner, action.repo, friendlyProjectName(action.repo), filePath);
    }
  }

  async function openFile() {
    await window.electronAPI.files.open(filePath);
  }

  async function showInFinder() {
    await window.electronAPI.files.showInFinder(filePath);
  }

  if (loading) {
    return (
      <div style={styles.root}>
        <div style={styles.loadingCard}>Looking at this file…</div>
      </div>
    );
  }

  if (error || !context) {
    return (
      <div style={styles.root}>
        <div style={styles.errorCard}>
          <div style={styles.errorTitle}>Couldn&apos;t read this file</div>
          <div style={styles.errorText}>{error ?? 'Unknown error'}</div>
          <button type="button" style={styles.secondaryBtn} onClick={onBack}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <div style={styles.content}>
        <div style={styles.topRow}>
          <button type="button" style={styles.secondaryBtn} onClick={onBack}>
            ← Change file
          </button>
          <button type="button" style={styles.ghostBtn} onClick={() => void loadContext()}>
            Refresh
          </button>
        </div>

        <div style={styles.pathCard}>
          <div style={styles.pathMeta}>
            <div style={styles.pathBadge}>{kindIcon(context.kind)} {context.kind}</div>
            <div style={styles.fileName}>{context.fileName}</div>
            <div style={styles.filePath}>{context.filePath}</div>
          </div>
          <div style={styles.pathActions}>
            <button type="button" style={styles.secondaryBtn} onClick={() => void openFile()}>
              Open file
            </button>
            <button type="button" style={styles.secondaryBtn} onClick={() => void showInFinder()}>
              Show in Finder
            </button>
          </div>
        </div>

        <div style={styles.infoGrid}>
          <div style={styles.infoCard}>
            <div style={styles.infoLabel}>Size</div>
            <div style={styles.infoValue}>{context.sizeLabel}</div>
          </div>
          <div style={styles.infoCard}>
            <div style={styles.infoLabel}>Created</div>
            <div style={styles.infoValue}>{formatDate(context.createdAt)}</div>
          </div>
          <div style={styles.infoCard}>
            <div style={styles.infoLabel}>Modified</div>
            <div style={styles.infoValue}>{formatDate(context.modifiedAt)}</div>
          </div>
        </div>

        <div style={styles.summaryCard}>
          <div style={styles.summaryTitle}>What CLUI sees</div>
          <div style={styles.summaryText}>{context.summary}</div>
          {context.details && <div style={styles.summaryDetail}>{context.details}</div>}
        </div>

        <div style={styles.editorCard}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.cardTitle}>File details</div>
              <div style={styles.cardSub}>Friendly Finder-style fields only. Lower-level metadata stays read-only below.</div>
            </div>
          </div>

          {context.editableFields.length === 0 ? (
            <div style={styles.emptyState}>This file can be described here, but editable Finder details are only available on macOS right now.</div>
          ) : (
            <div style={styles.fieldList}>
              {hasTagField && (
                <div style={styles.fieldCard}>
                  <div style={styles.fieldHeader}>
                    <div style={styles.fieldLabel}>Tags</div>
                    <div style={styles.fieldDesc}>Add simple labels that make the file easier to find later.</div>
                  </div>
                  <div style={styles.tagWrap}>
                    {draftTags.map((tag) => (
                      <span key={tag} style={styles.tagChip}>
                        {tag}
                        <button type="button" style={styles.tagRemove} onClick={() => removeTag(tag)}>✕</button>
                      </span>
                    ))}
                    {draftTags.length === 0 && <span style={styles.tagHint}>No tags yet.</span>}
                  </div>
                  <div style={styles.tagInputRow}>
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(event) => setTagInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ',') {
                          event.preventDefault();
                          if (tagInput.trim()) addTag(tagInput);
                        }
                      }}
                      placeholder="Add a tag"
                      style={styles.textInput}
                    />
                    <button
                      type="button"
                      style={styles.secondaryBtn}
                      onClick={() => addTag(tagInput)}
                      disabled={!tagInput.trim()}
                    >
                      Add tag
                    </button>
                  </div>
                </div>
              )}

              {hasLockedField && (
                <div style={styles.toggleCard}>
                  <div>
                    <div style={styles.fieldLabel}>Locked</div>
                    <div style={styles.fieldDesc}>Reduce accidental edits by marking the file as locked in Finder.</div>
                  </div>
                  <button
                    type="button"
                    style={{
                      ...styles.toggleBtn,
                      background: draftLocked ? 'var(--accent)' : 'var(--surface-2)',
                    }}
                    onClick={() => setDraftLocked((value) => !value)}
                  >
                    <span
                      style={{
                        ...styles.toggleThumb,
                        transform: draftLocked ? 'translateX(22px)' : 'translateX(0)',
                      }}
                    />
                  </button>
                </div>
              )}

              {hasHideExtensionField && (
                <div style={styles.toggleCard}>
                  <div>
                    <div style={styles.fieldLabel}>Hide file extension</div>
                    <div style={styles.fieldDesc}>Control whether Finder shows the file ending directly in the name.</div>
                  </div>
                  <button
                    type="button"
                    style={{
                      ...styles.toggleBtn,
                      background: draftHideExtension ? 'var(--accent)' : 'var(--surface-2)',
                    }}
                    onClick={() => setDraftHideExtension((value) => !value)}
                  >
                    <span
                      style={{
                        ...styles.toggleThumb,
                        transform: draftHideExtension ? 'translateX(22px)' : 'translateX(0)',
                      }}
                    />
                  </button>
                </div>
              )}
            </div>
          )}

          {saveError && <div style={styles.errorInline}>{saveError}</div>}

          <div style={styles.editorActions}>
            <button type="button" style={styles.secondaryBtn} onClick={discardChanges} disabled={!isDirty || saving}>
              Discard
            </button>
            <button type="button" style={styles.primaryBtn} onClick={() => void saveChanges()} disabled={!isDirty || saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>

        <div style={styles.actionCard}>
          <div style={styles.sectionHeader}>
            <div>
              <div style={styles.cardTitle}>Suggested tools</div>
              <div style={styles.cardSub}>CLUI matches tools based on the file type, extension, and name.</div>
            </div>
          </div>

          {primaryAction ? (
            <>
              <div style={styles.primaryActionCard}>
                <div>
                  <div style={styles.actionLabel}>Main suggestion</div>
                  <div style={styles.actionTitle}>{primaryAction.label}</div>
                  <div style={styles.actionDescription}>{primaryAction.description}</div>
                </div>
                <div style={styles.actionButtons}>
                  <button type="button" style={styles.primaryBtn} onClick={() => handleAction(primaryAction)}>
                    {primaryAction.label}
                  </button>
                  {moreActions.length > 0 && (
                    <div style={styles.moreWrap}>
                      <button type="button" style={styles.secondaryBtn} onClick={() => setShowMore((value) => !value)}>
                        More actions ▾
                      </button>
                      {showMore && (
                        <div style={styles.menu}>
                          {moreActions.map((action) => (
                            <button
                              key={action.id}
                              type="button"
                              style={styles.menuItem}
                              onClick={() => {
                                setShowMore(false);
                                handleAction(action);
                              }}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div style={styles.emptyState}>No strong tool match yet. CLUI is only describing this file for now.</div>
          )}
        </div>

        <div style={styles.technicalCard}>
          <button type="button" style={styles.technicalBtn} onClick={() => setShowTechnical((value) => !value)}>
            {showTechnical ? 'Hide' : 'Show'} technical details
          </button>
          {showTechnical && (
            <div style={styles.technicalBody}>
              {context.metadataSections.length === 0 ? (
                <div style={styles.emptyState}>No technical metadata was available for this file.</div>
              ) : (
                context.metadataSections.map((section) => (
                  <div key={section.id} style={styles.metadataSection}>
                    <div style={styles.metadataTitle}>{section.label}</div>
                    {section.description && <div style={styles.metadataDesc}>{section.description}</div>}
                    <div style={styles.metadataList}>
                      {section.entries.map((entry) => (
                        <MetadataRow key={`${section.id}:${entry.key}`} entry={entry} />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetadataRow({ entry }: { entry: FileMetadataEntry }) {
  return (
    <div style={styles.metadataRow}>
      <div style={styles.metadataKey}>{entry.label}</div>
      {entry.kind === 'text' ? (
        <div style={styles.metadataValue}>{entry.value ?? '(empty)'}</div>
      ) : (
        <div style={styles.metadataValue}>
          {(entry.value ?? 'Binary data')}
          {typeof entry.byteLength === 'number' && ` • ${entry.byteLength} bytes`}
          {entry.hexPreview ? ` • ${entry.hexPreview}${entry.hexPreview.length >= 64 ? '…' : ''}` : ''}
        </div>
      )}
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
    maxWidth: 920,
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pathCard: {
    padding: '18px',
    borderRadius: 18,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between',
    gap: 16,
  },
  pathMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 0,
    flex: 1,
  },
  pathBadge: {
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
  fileName: {
    fontSize: 26,
    fontWeight: 800,
    color: 'var(--text)',
    letterSpacing: '-0.03em',
    overflowWrap: 'anywhere' as const,
  },
  filePath: {
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    overflowWrap: 'anywhere' as const,
  },
  pathActions: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
    flexWrap: 'wrap' as const,
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
  },
  infoCard: {
    padding: '14px 16px',
    borderRadius: 16,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  infoValue: {
    fontSize: 14,
    color: 'var(--text)',
    lineHeight: 1.5,
  },
  summaryCard: {
    padding: '18px',
    borderRadius: 18,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  },
  summaryText: {
    fontSize: 15,
    lineHeight: 1.6,
    color: 'var(--text)',
  },
  summaryDetail: {
    fontSize: 13,
    lineHeight: 1.6,
    color: 'var(--text-muted)',
  },
  editorCard: {
    padding: '18px',
    borderRadius: 18,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  actionCard: {
    padding: '18px',
    borderRadius: 18,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  technicalCard: {
    padding: '18px',
    borderRadius: 18,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text)',
  },
  cardSub: {
    marginTop: 4,
    fontSize: 13,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
  },
  fieldList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  fieldCard: {
    padding: '14px',
    borderRadius: 14,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  fieldHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text)',
  },
  fieldDesc: {
    fontSize: 12,
    lineHeight: 1.5,
    color: 'var(--text-muted)',
  },
  tagWrap: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  tagChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    borderRadius: 999,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    fontSize: 12,
    fontWeight: 600,
  },
  tagRemove: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: 0,
    fontSize: 11,
    fontFamily: 'inherit',
  },
  tagHint: {
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  tagInputRow: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap' as const,
  },
  textInput: {
    flex: 1,
    minWidth: 220,
    padding: '11px 14px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: 13,
    fontFamily: 'inherit',
  },
  toggleCard: {
    padding: '14px',
    borderRadius: 14,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  toggleBtn: {
    width: 48,
    height: 26,
    borderRadius: 13,
    border: 'none',
    cursor: 'pointer',
    position: 'relative' as const,
    transition: 'background 0.2s',
    flexShrink: 0,
  },
  toggleThumb: {
    position: 'absolute' as const,
    top: 3,
    left: 3,
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: 'white',
    transition: 'transform 0.2s ease',
  },
  editorActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    flexWrap: 'wrap' as const,
  },
  primaryActionCard: {
    padding: '16px',
    borderRadius: 16,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap' as const,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  actionTitle: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text)',
  },
  actionDescription: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 1.5,
    color: 'var(--text-muted)',
    maxWidth: 460,
  },
  actionButtons: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
    flexWrap: 'wrap' as const,
  },
  moreWrap: {
    position: 'relative' as const,
  },
  menu: {
    position: 'absolute' as const,
    top: 'calc(100% + 8px)',
    right: 0,
    minWidth: 220,
    borderRadius: 14,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    zIndex: 10,
  },
  menuItem: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: 'none',
    background: 'transparent',
    color: 'var(--text)',
    textAlign: 'left' as const,
    fontSize: 13,
    fontFamily: 'inherit',
  },
  technicalBtn: {
    alignSelf: 'flex-start',
    border: 'none',
    background: 'transparent',
    color: 'var(--accent)',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'inherit',
  },
  technicalBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  metadataSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  metadataTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text)',
  },
  metadataDesc: {
    fontSize: 12,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
  },
  metadataList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  metadataRow: {
    padding: '12px 14px',
    borderRadius: 12,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  metadataKey: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--text)',
  },
  metadataValue: {
    fontSize: 12,
    lineHeight: 1.6,
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    whiteSpace: 'pre-wrap' as const,
    overflowWrap: 'anywhere' as const,
  },
  loadingCard: {
    alignSelf: 'center',
    marginTop: 120,
    padding: '18px 22px',
    borderRadius: 16,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    fontSize: 15,
  },
  errorCard: {
    alignSelf: 'center',
    marginTop: 80,
    maxWidth: 420,
    padding: '22px',
    borderRadius: 18,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text)',
  },
  errorText: {
    fontSize: 13,
    lineHeight: 1.6,
    color: 'var(--text-muted)',
  },
  errorInline: {
    fontSize: 12,
    color: '#ef4444',
  },
  emptyState: {
    fontSize: 13,
    color: 'var(--text-muted)',
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
    padding: '11px 16px',
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'inherit',
  },
  ghostBtn: {
    padding: '10px 14px',
    borderRadius: 12,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted)',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'inherit',
  },
};
