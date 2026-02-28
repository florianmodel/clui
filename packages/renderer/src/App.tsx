import { useState, useCallback } from 'react';
import type { ExecLogEvent } from '@gui-bridge/shared';
import { TestRunner } from './components/TestRunner.js';
import { LogPanel } from './components/LogPanel.js';

export function App() {
  const [logs, setLogs] = useState<ExecLogEvent[]>([]);

  const handleLog = useCallback((event: ExecLogEvent) => {
    setLogs((prev) => [...prev, event]);
  }, []);

  const handleClearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <div style={styles.layout}>
      <div style={styles.left}>
        <TestRunner onLog={handleLog} onClearLogs={handleClearLogs} />
      </div>
      <div style={styles.right}>
        <LogPanel logs={logs} onClear={handleClearLogs} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: 'flex',
    gap: 16,
    height: '100vh',
    padding: 16,
    background: 'var(--bg)',
  },
  left: {
    width: 380,
    flexShrink: 0,
    overflowY: 'auto',
  },
  right: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
};
