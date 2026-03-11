import type { Workflow } from '@gui-bridge/shared';

interface Props {
  workflows: Workflow[];
  activeId: string;
  onChange: (id: string) => void;
}

export function WorkflowSelector({ workflows, activeId, onChange }: Props) {
  return (
    <div style={styles.tabs}>
      {workflows.map((wf) => (
        <button
          key={wf.id}
          type="button"
          style={{
            ...styles.tab,
            ...(wf.id === activeId ? styles.tabActive : styles.tabInactive),
          }}
          onClick={() => onChange(wf.id)}
        >
          {wf.name}
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  tabs: {
    display: 'flex', gap: 4, flexWrap: 'wrap',
    padding: '4px 0',
  },
  tab: {
    border: 'none', borderRadius: 8, fontSize: 13,
    padding: '7px 16px', cursor: 'pointer', fontWeight: 500,
    transition: 'background 0.15s, color 0.15s',
  },
  tabActive: {
    background: 'var(--accent)', color: 'var(--bg)',
  },
  tabInactive: {
    background: 'transparent', color: 'var(--text-muted)',
    border: '1px solid var(--border)',
  },
};
