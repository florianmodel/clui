import { useEffect, useRef } from 'react';
import type { ExecCompleteEvent, ExecLogEvent } from '@gui-bridge/shared';

/** Subscribe to streamed log events. Cleans up on unmount. */
export function useLogEvents(onLog: (event: ExecLogEvent) => void): void {
  const onLogRef = useRef(onLog);
  onLogRef.current = onLog;

  useEffect(() => {
    const cleanup = window.electronAPI.on.log((event) => onLogRef.current(event));
    return cleanup;
  }, []);
}

/** Subscribe to execution-complete events. Cleans up on unmount. */
export function useCompleteEvent(onComplete: (event: ExecCompleteEvent) => void): void {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const cleanup = window.electronAPI.on.complete((event) => onCompleteRef.current(event));
    return cleanup;
  }, []);
}
