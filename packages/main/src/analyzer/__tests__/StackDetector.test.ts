import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StackDetector } from '../StackDetector.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stack-detector-test-'));
}

function removeTempDir(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeFile(dir: string, relPath: string, content: string) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

describe('StackDetector', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  describe('language detection', () => {
    it('detects Python from pyproject.toml', () => {
      writeFile(tmpDir, 'pyproject.toml', '[tool.poetry]\nname = "myapp"');
      const info = StackDetector.detect(tmpDir);
      expect(info.language).toBe('python');
      expect(info.keyFiles).toContain('pyproject.toml');
    });

    it('detects Python from setup.py', () => {
      writeFile(tmpDir, 'setup.py', 'from setuptools import setup\nsetup(name="myapp")');
      const info = StackDetector.detect(tmpDir);
      expect(info.language).toBe('python');
      expect(info.keyFiles).toContain('setup.py');
    });

    it('detects Python from requirements.txt', () => {
      writeFile(tmpDir, 'requirements.txt', 'click==8.0.0\nrequests>=2.28');
      const info = StackDetector.detect(tmpDir);
      expect(info.language).toBe('python');
    });

    it('detects Node from package.json', () => {
      writeFile(tmpDir, 'package.json', '{"name": "myapp", "version": "1.0.0"}');
      const info = StackDetector.detect(tmpDir);
      expect(info.language).toBe('node');
      expect(info.keyFiles).toContain('package.json');
    });

    it('detects Rust from Cargo.toml', () => {
      writeFile(tmpDir, 'Cargo.toml', '[package]\nname = "myapp"');
      const info = StackDetector.detect(tmpDir);
      expect(info.language).toBe('rust');
      expect(info.keyFiles).toContain('Cargo.toml');
    });

    it('detects Go from go.mod', () => {
      writeFile(tmpDir, 'go.mod', 'module myapp\ngo 1.21');
      const info = StackDetector.detect(tmpDir);
      expect(info.language).toBe('go');
      expect(info.keyFiles).toContain('go.mod');
    });

    it('returns unknown for an unrecognized project (only Makefile)', () => {
      writeFile(tmpDir, 'Makefile', 'all:\n\techo hello');
      const info = StackDetector.detect(tmpDir);
      expect(info.language).toBe('unknown');
      expect(info.keyFiles).toHaveLength(0);
    });
  });

  describe('framework detection (Python)', () => {
    it('detects argparse from import statement', () => {
      writeFile(tmpDir, 'requirements.txt', 'requests');
      writeFile(tmpDir, 'cli.py', 'import argparse\nparser = argparse.ArgumentParser()');
      const info = StackDetector.detect(tmpDir);
      expect(info.framework).toBe('argparse');
    });

    it('detects click from import click', () => {
      writeFile(tmpDir, 'requirements.txt', 'click');
      writeFile(tmpDir, 'main.py', 'import click\n@click.command()\ndef cli(): pass');
      const info = StackDetector.detect(tmpDir);
      expect(info.framework).toBe('click');
    });

    it('detects typer before click (typer takes priority)', () => {
      writeFile(tmpDir, 'requirements.txt', 'typer');
      writeFile(tmpDir, 'app.py', 'import typer\nimport click\napp = typer.Typer()');
      const info = StackDetector.detect(tmpDir);
      expect(info.framework).toBe('typer');
    });

    it('returns unknown framework for a Python project with no recognized framework', () => {
      writeFile(tmpDir, 'requirements.txt', 'requests');
      writeFile(tmpDir, 'main.py', 'import sys\nprint("hello")');
      const info = StackDetector.detect(tmpDir);
      expect(info.language).toBe('python');
      expect(info.framework).toBe('unknown');
    });
  });

  describe('entrypoint detection', () => {
    it('detects __main__.py at confidence 0.7', () => {
      writeFile(tmpDir, 'requirements.txt', '');
      writeFile(tmpDir, '__main__.py', 'from .cli import main\nmain()');
      const info = StackDetector.detect(tmpDir);
      expect(info.entrypoint).toBe('__main__.py');
      expect(info.entrypointConfidence).toBe(0.7);
    });

    it('detects main.py at confidence 0.5', () => {
      writeFile(tmpDir, 'requirements.txt', '');
      writeFile(tmpDir, 'main.py', 'print("hello")');
      const info = StackDetector.detect(tmpDir);
      expect(info.entrypoint).toBe('main.py');
      expect(info.entrypointConfidence).toBe(0.5);
    });

    it('detects cli.py at confidence 0.5', () => {
      writeFile(tmpDir, 'requirements.txt', '');
      writeFile(tmpDir, 'cli.py', 'import click');
      const info = StackDetector.detect(tmpDir);
      expect(info.entrypoint).toBe('cli.py');
      expect(info.entrypointConfidence).toBe(0.5);
    });

    it('extracts console_scripts entrypoint from setup.py at confidence 0.9', () => {
      const setupPy = `
from setuptools import setup
setup(
    name='myapp',
    entry_points={
        'console_scripts': [
            'myapp = myapp.cli:main',
        ],
    },
)
`;
      writeFile(tmpDir, 'setup.py', setupPy);
      const info = StackDetector.detect(tmpDir);
      expect(info.entrypointConfidence).toBe(0.9);
      expect(info.entrypoint).toContain('myapp');
      expect(info.analyzerCommand).toEqual(['python', '-m', 'myapp.cli']);
    });

    it('returns confidence 0 when no entrypoint found', () => {
      writeFile(tmpDir, 'requirements.txt', '');
      writeFile(tmpDir, 'utils.py', 'def helper(): pass');
      const info = StackDetector.detect(tmpDir);
      expect(info.entrypointConfidence).toBe(0);
      expect(info.entrypoint).toBeUndefined();
    });
  });

  describe('non-Python projects', () => {
    it('does not attempt framework detection for Node', () => {
      writeFile(tmpDir, 'package.json', '{}');
      const info = StackDetector.detect(tmpDir);
      expect(info.framework).toBe('unknown');
    });

    it('does not set entrypoint for Rust projects', () => {
      writeFile(tmpDir, 'Cargo.toml', '[package]');
      const info = StackDetector.detect(tmpDir);
      expect(info.entrypoint).toBeUndefined();
    });
  });

  describe('analyzer command detection', () => {
    it('detects Node bin entrypoints from package.json', () => {
      writeFile(tmpDir, 'package.json', JSON.stringify({
        name: 'clipper',
        version: '1.0.0',
        bin: 'bin/clipper.js',
      }));

      const info = StackDetector.detect(tmpDir);
      expect(info.analyzerCommand).toEqual(['node', './bin/clipper.js']);
    });

    it('detects the first named Node bin entry', () => {
      writeFile(tmpDir, 'package.json', JSON.stringify({
        name: 'clipper',
        version: '1.0.0',
        bin: {
          clipper: 'dist/cli.js',
          helper: 'dist/helper.js',
        },
      }));

      const info = StackDetector.detect(tmpDir);
      expect(info.analyzerCommand).toEqual(['node', './dist/cli.js']);
    });

    it('detects Rust binary names from Cargo.toml', () => {
      writeFile(tmpDir, 'Cargo.toml', '[package]\nname = "media-tool"\n');

      const info = StackDetector.detect(tmpDir);
      expect(info.analyzerCommand).toEqual(['/usr/local/bin/media-tool']);
    });

    it('uses the fixed Go analyzer binary path', () => {
      writeFile(tmpDir, 'go.mod', 'module example.com/tool\ngo 1.21');

      const info = StackDetector.detect(tmpDir);
      expect(info.analyzerCommand).toEqual(['/usr/local/bin/app']);
    });
  });
});
