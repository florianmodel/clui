import Dockerode from 'dockerode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface RunOptions {
  inputDir?: string;   // host path → mounted read-only at /input
  outputDir?: string;  // host path → mounted read-write at /output
  env?: Record<string, string>;
  timeout?: number;    // ms, default 5 minutes
}

export interface ExecutionResult {
  exitCode: number;
  outputFiles: string[];
  error?: string;
}

export type LogCallback = (stream: 'stdout' | 'stderr' | 'system', line: string) => void;

export class DockerManager {
  private docker: Dockerode;

  constructor() {
    // On macOS with Docker Desktop, the socket lives at the default path.
    this.docker = new Dockerode();
  }

  // ── Health ─────────────────────────────────────────────────────────────

  async checkHealth(): Promise<{ ok: boolean; version?: string; error?: string }> {
    try {
      const info = await this.docker.version();
      return { ok: true, version: info.Version };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  // ── Image management ───────────────────────────────────────────────────

  async imageExists(tag: string): Promise<boolean> {
    try {
      await this.docker.getImage(tag).inspect();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build a Docker image from a Dockerfile.
   * Streams build output line-by-line to onLog.
   */
  async buildImage(
    tag: string,
    dockerfilePath: string,
    contextPath: string,
    onLog: LogCallback,
  ): Promise<{ ok: boolean; error?: string }> {
    onLog('system', `Building image "${tag}" from ${dockerfilePath}…`);

    return new Promise((resolve) => {
      // dockerode expects a tar stream; pass the context dir and dockerfile name
      const dockerfileRelative = path.relative(contextPath, dockerfilePath);

      this.docker.buildImage(
        { context: contextPath, src: [dockerfileRelative] },
        { t: tag, dockerfile: dockerfileRelative },
        (err, stream) => {
          if (err || !stream) {
            const msg = err?.message ?? 'No build stream returned';
            onLog('system', `Build error: ${msg}`);
            resolve({ ok: false, error: msg });
            return;
          }

          this.docker.modem.followProgress(
            stream,
            // onFinished
            (finishErr) => {
              if (finishErr) {
                onLog('system', `Build failed: ${finishErr.message}`);
                resolve({ ok: false, error: finishErr.message });
              } else {
                onLog('system', `Image "${tag}" built successfully.`);
                resolve({ ok: true });
              }
            },
            // onProgress
            (event: { stream?: string; error?: string; status?: string; id?: string }) => {
              if (event.error) {
                onLog('stderr', event.error.trim());
              } else if (event.stream) {
                const line = event.stream.trimEnd();
                if (line) onLog('stdout', line);
              } else if (event.status) {
                const suffix = event.id ? ` (${event.id})` : '';
                onLog('system', `${event.status}${suffix}`);
              }
            },
          );
        },
      );
    });
  }

  async removeImage(tag: string): Promise<void> {
    try {
      await this.docker.getImage(tag).remove({ force: true });
    } catch {
      // ignore if it doesn't exist
    }
  }

  // ── Container execution ────────────────────────────────────────────────

  /**
   * Run a command in a container, stream stdout/stderr via onLog,
   * and return the exit code + output files when done.
   */
  async runCommand(
    image: string,
    command: string[],
    opts: RunOptions,
    onLog: LogCallback,
  ): Promise<ExecutionResult> {
    const { inputDir, outputDir, env = {}, timeout = 5 * 60 * 1000 } = opts;

    const binds: string[] = [];
    if (inputDir) binds.push(`${inputDir}:/input:ro`);
    if (outputDir) binds.push(`${outputDir}:/output:rw`);

    const envList = Object.entries(env).map(([k, v]) => `${k}=${v}`);

    onLog('system', `Starting container: ${[image, ...command].join(' ')}`);

    let container: Dockerode.Container;
    try {
      container = await this.docker.createContainer({
        Image: image,
        Cmd: command,
        Env: envList,
        HostConfig: {
          Binds: binds,
          NetworkMode: 'none',   // no internet after build
          Memory: 2 * 1024 * 1024 * 1024,  // 2 GB
          NanoCpus: 2 * 1e9,               // 2 CPUs
          AutoRemove: false,
        },
        AttachStdout: true,
        AttachStderr: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      onLog('system', `Failed to create container: ${msg}`);
      return { exitCode: -1, outputFiles: [], error: msg };
    }

    // Attach log stream before starting
    const logStream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });

    // demuxStream splits the Docker multiplexed stream into stdout/stderr
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    container.modem.demuxStream(
      logStream,
      // stdout writable
      {
        write(chunk: Buffer) {
          stdoutChunks.push(chunk);
          const text = chunk.toString('utf8');
          for (const line of text.split('\n')) {
            if (line.trim()) onLog('stdout', line);
          }
          return true;
        },
        end() {},
      } as unknown as NodeJS.WritableStream,
      // stderr writable
      {
        write(chunk: Buffer) {
          stderrChunks.push(chunk);
          const text = chunk.toString('utf8');
          for (const line of text.split('\n')) {
            if (line.trim()) onLog('stderr', line);
          }
          return true;
        },
        end() {},
      } as unknown as NodeJS.WritableStream,
    );

    await container.start();

    // Set up timeout killer
    const killTimer = setTimeout(async () => {
      onLog('system', `Timeout after ${timeout / 1000}s — killing container.`);
      await container.stop({ t: 0 }).catch(() => {});
    }, timeout);

    // Wait for container to finish
    const [statusResult] = await container.wait();
    clearTimeout(killTimer);

    const exitCode: number = (statusResult as { StatusCode: number }).StatusCode;
    onLog('system', `Container exited with code ${exitCode}.`);

    // Collect output files
    const outputFiles: string[] = [];
    if (outputDir && fs.existsSync(outputDir)) {
      const entries = fs.readdirSync(outputDir);
      for (const entry of entries) {
        outputFiles.push(path.join(outputDir, entry));
      }
    }

    // Remove container
    await container.remove({ force: true }).catch(() => {});

    return { exitCode, outputFiles };
  }

  // ── Temp directory helpers ─────────────────────────────────────────────

  createTempDir(prefix: string): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), `gui-bridge-${prefix}-`));
  }

  removeTempDir(dirPath: string): void {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
