import { describe, expect, it, vi } from 'vitest';
import { NativeInstallManager } from '../NativeInstallManager.js';

describe('NativeInstallManager', () => {
  it('detects pip support when only pip is installed', async () => {
    const manager = new NativeInstallManager();
    const whichSpy = vi.spyOn(
      manager as unknown as { which: (binary: string) => Promise<string | null> },
      'which',
    );

    whichSpy.mockImplementation(async (binary: string) => {
      if (binary === 'pip') return '/usr/bin/pip';
      return null;
    });

    const capabilities = await manager.detectCapabilities();

    expect(capabilities.hasPip).toBe(true);
    expect(whichSpy).toHaveBeenCalledWith('pip3');
    expect(whichSpy).toHaveBeenCalledWith('pip');
  });

  it('uses pip when pip3 is unavailable', async () => {
    const manager = new NativeInstallManager();
    const detectPipBinary = vi.spyOn(
      manager as unknown as { detectPipBinary: () => Promise<string> },
      'detectPipBinary',
    ).mockResolvedValue('pip');

    const command = await (manager as unknown as { buildInstallCommand: (pm: 'pip', install: { pip: string }) => Promise<string[]> })
      .buildInstallCommand('pip', { pip: 'yt-dlp' });

    expect(command).toEqual(['pip', 'install', '--user', 'yt-dlp']);
    expect(detectPipBinary).toHaveBeenCalled();
  });
});
