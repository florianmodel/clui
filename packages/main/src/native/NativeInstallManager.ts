import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import type { KnownToolEntry, NativeInstall } from './KnownToolRegistry.js';
import type { LogCallback } from '../docker/DockerManager.js';

const execFileAsync = promisify(execFile);

export type PackageManager = 'brew' | 'apt' | 'pip' | 'npm' | 'cargo';

export interface InstallResult {
  ok: boolean;
  error?: string;
}

export interface BinaryCheck {
  installed: boolean;
  path?: string;
  version?: string;
}

export interface Capabilities {
  hasDocker: boolean;
  hasHomebrew: boolean;
  hasPip: boolean;
  hasNpm: boolean;
  hasCargo: boolean;
  platform: string;
}

export class NativeInstallManager {
  /** Check if a binary is on PATH and optionally capture its version. */
  async isInstalled(binary: string, versionArgs = ['--version']): Promise<BinaryCheck> {
    try {
      const { stdout } = await execFileAsync('which', [binary], { timeout: 5_000 });
      const binPath = stdout.trim();
      if (!binPath) return { installed: false };

      try {
        const { stdout: ver } = await execFileAsync(binary, versionArgs, { timeout: 5_000 });
        return { installed: true, path: binPath, version: ver.trim().split('\n')[0] };
      } catch {
        return { installed: true, path: binPath };
      }
    } catch {
      return { installed: false };
    }
  }

  /** Detect which package managers are available on this system. */
  async detectCapabilities(): Promise<Capabilities> {
    const [docker, brew, pip, npm, cargo] = await Promise.all([
      this.which('docker'),
      this.which('brew'),
      this.which('pip3').catch(() => this.which('pip')),
      this.which('npm'),
      this.which('cargo'),
    ]);

    return {
      hasDocker: !!docker,
      hasHomebrew: !!brew,
      hasPip: !!pip,
      hasNpm: !!npm,
      hasCargo: !!cargo,
      platform: process.platform,
    };
  }

  /** Pick the best available package manager for the given entry. */
  async pickPackageManager(install: NativeInstall): Promise<PackageManager | null> {
    const caps = await this.detectCapabilities();

    // Priority: brew (Mac) > apt (Linux) > pip > npm > cargo
    if (install.brew && caps.hasHomebrew) return 'brew';
    if (install.apt && process.platform === 'linux') {
      const hasApt = await this.which('apt-get');
      if (hasApt) return 'apt';
    }
    if (install.pip && caps.hasPip) return 'pip';
    if (install.npm && caps.hasNpm) return 'npm';
    if (install.cargo && caps.hasCargo) return 'cargo';
    return null;
  }

  /**
   * Install a known tool using the best available package manager.
   * Streams install output line-by-line via onLog.
   */
  async install(
    entry: KnownToolEntry,
    onLog: LogCallback,
    onProgress?: (pct: number) => void,
  ): Promise<InstallResult> {
    const pm = await this.pickPackageManager(entry.install);
    if (!pm) {
      return {
        ok: false,
        error: `No supported package manager found. Install Homebrew (macOS), pip, npm, or cargo first.`,
      };
    }

    const cmd = this.buildInstallCommand(pm, entry.install);
    onLog('system', `Installing via ${pm}: ${cmd.join(' ')}`);
    onProgress?.(5);

    return new Promise((resolve) => {
      const proc = spawn(cmd[0], cmd.slice(1), {
        env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1' },
      });

      proc.stdout.on('data', (data: Buffer) => {
        for (const line of data.toString().split('\n')) {
          if (line.trim()) onLog('stdout', line);
        }
      });
      proc.stderr.on('data', (data: Buffer) => {
        for (const line of data.toString().split('\n')) {
          if (line.trim()) onLog('stderr', line);
        }
      });

      proc.on('close', (code) => {
        onProgress?.(95);
        if (code === 0) {
          resolve({ ok: true });
        } else {
          resolve({ ok: false, error: `${pm} install exited with code ${code}` });
        }
      });

      proc.on('error', (err) => {
        resolve({ ok: false, error: err.message });
      });
    });
  }

  /** Verify the binary works after install. Returns version string on success. */
  async verify(entry: KnownToolEntry): Promise<string | null> {
    const check = await this.isInstalled(entry.binary, entry.verifyArgs);
    return check.installed ? (check.version ?? 'installed') : null;
  }

  private buildInstallCommand(pm: PackageManager, install: NativeInstall): string[] {
    switch (pm) {
      case 'brew':
        return ['brew', 'install', install.brew!];
      case 'apt':
        return ['sudo', 'apt-get', 'install', '-y', install.apt!];
      case 'pip':
        return ['pip3', 'install', '--user', install.pip!];
      case 'npm':
        return ['npm', 'install', '-g', install.npm!];
      case 'cargo':
        return ['cargo', 'install', install.cargo!];
    }
  }

  private async which(binary: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('which', [binary], { timeout: 3_000 });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }
}
