import { spawn, type ChildProcess } from 'child_process';

export interface FolderActionRunnerCallbacks {
  onLog: (stream: 'stdout' | 'stderr' | 'system', line: string) => void;
  onUrl: (url: string) => void;
  onComplete: (result: { exitCode: number; error?: string; canceled?: boolean }) => void;
}

const LOCAL_URL_RE = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[^\s"'`)]*)?/gi;

export class FolderActionRunner {
  private activeProcess: ChildProcess | null = null;
  private canceled = false;

  run(command: string, cwd: string, callbacks: FolderActionRunnerCallbacks): void {
    if (this.activeProcess) {
      throw new Error('A folder action is already running.');
    }

    this.canceled = false;

    const proc = spawn('sh', ['-lc', command], {
      cwd,
      env: process.env,
      detached: process.platform !== 'win32',
    });
    this.activeProcess = proc;
    let finished = false;

    callbacks.onLog('system', `Running in ${cwd}`);
    callbacks.onLog('system', `Command: ${command}`);

    this.attachStream(proc.stdout, 'stdout', callbacks);
    this.attachStream(proc.stderr, 'stderr', callbacks);

    proc.on('close', (code) => {
      if (finished) return;
      finished = true;
      this.activeProcess = null;
      callbacks.onComplete({
        exitCode: code ?? (this.canceled ? 0 : -1),
        canceled: this.canceled,
      });
    });

    proc.on('error', (err) => {
      if (finished) return;
      finished = true;
      this.activeProcess = null;
      callbacks.onComplete({
        exitCode: -1,
        error: err.message,
        canceled: this.canceled,
      });
    });
  }

  async cancel(): Promise<void> {
    if (!this.activeProcess) return;

    this.canceled = true;
    const proc = this.activeProcess;

    try {
      if (process.platform !== 'win32' && proc.pid) {
        process.kill(-proc.pid, 'SIGTERM');
      } else {
        proc.kill('SIGTERM');
      }
    } catch {
      proc.kill('SIGTERM');
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          if (process.platform !== 'win32' && proc.pid) {
            process.kill(-proc.pid, 'SIGKILL');
          } else {
            proc.kill('SIGKILL');
          }
        } catch {
          proc.kill('SIGKILL');
        }
        resolve();
      }, 1_500);

      proc.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private attachStream(
    stream: NodeJS.ReadableStream | null,
    streamName: 'stdout' | 'stderr',
    callbacks: FolderActionRunnerCallbacks,
  ): void {
    if (!stream) return;

    const seenUrls = new Set<string>();
    let pending = '';

    stream.on('data', (chunk: Buffer | string) => {
      pending += chunk.toString();
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        callbacks.onLog(streamName, line);
        for (const match of line.matchAll(LOCAL_URL_RE)) {
          const url = match[0];
          if (seenUrls.has(url)) continue;
          seenUrls.add(url);
          callbacks.onUrl(url);
        }
      }
    });

    stream.on('end', () => {
      if (!pending.trim()) return;
      callbacks.onLog(streamName, pending);
      for (const match of pending.matchAll(LOCAL_URL_RE)) {
        callbacks.onUrl(match[0]);
      }
      pending = '';
    });
  }
}
