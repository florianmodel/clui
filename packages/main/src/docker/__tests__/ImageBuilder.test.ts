import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ImageBuilder } from '../ImageBuilder.js';
import type { StackInfo } from '../../analyzer/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'image-builder-test-'));
}

function removeTempDir(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeFile(dir: string, relPath: string, content: string) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function makeStack(overrides: Partial<StackInfo> = {}): StackInfo {
  return {
    language: 'unknown',
    framework: 'unknown',
    keyFiles: [],
    entrypoint: undefined,
    entrypointConfidence: 0,
    ...overrides,
  };
}

// Access the private generateDockerfile method for testing
function getDockerfile(builder: ImageBuilder, stack: StackInfo, repoDir: string): string {
  return (builder as unknown as { generateDockerfile(s: StackInfo, r: string): string })
    .generateDockerfile(stack, repoDir);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ImageBuilder.generateDockerfile', () => {
  let builder: ImageBuilder;
  let tmpDir: string;

  beforeEach(() => {
    builder = new ImageBuilder();
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  // ── Python ────────────────────────────────────────────────────────────────

  describe('Python', () => {
    it('uses python:3.12-slim as default base image', () => {
      const df = getDockerfile(builder, makeStack({ language: 'python', keyFiles: [] }), tmpDir);
      expect(df).toContain('FROM python:3.12-slim');
    });

    it('reads Python version from .python-version file', () => {
      writeFile(tmpDir, '.python-version', '3.11.2\n');
      const df = getDockerfile(builder, makeStack({ language: 'python', keyFiles: [] }), tmpDir);
      expect(df).toContain('FROM python:3.11-slim');
    });

    it('reads Python version from pyproject.toml requires-python', () => {
      writeFile(tmpDir, 'pyproject.toml', '[project]\nrequires-python = ">=3.10"\n');
      const df = getDockerfile(builder, makeStack({ language: 'python', keyFiles: ['pyproject.toml'] }), tmpDir);
      expect(df).toContain('FROM python:3.10-slim');
    });

    it('uses pip install . for pyproject.toml', () => {
      const df = getDockerfile(
        builder,
        makeStack({ language: 'python', keyFiles: ['pyproject.toml'] }),
        tmpDir,
      );
      expect(df).toContain('pip install --no-cache-dir .');
    });

    it('uses pip install . for setup.py', () => {
      const df = getDockerfile(
        builder,
        makeStack({ language: 'python', keyFiles: ['setup.py'] }),
        tmpDir,
      );
      expect(df).toContain('pip install --no-cache-dir .');
    });

    it('copies requirements.txt and uses pip install -r for requirements.txt', () => {
      const df = getDockerfile(
        builder,
        makeStack({ language: 'python', keyFiles: ['requirements.txt'] }),
        tmpDir,
      );
      expect(df).toContain('COPY requirements.txt .');
      expect(df).toContain('pip install --no-cache-dir -r requirements.txt');
    });

    it('uses pipenv for Pipfile', () => {
      const df = getDockerfile(
        builder,
        makeStack({ language: 'python', keyFiles: ['Pipfile'] }),
        tmpDir,
      );
      expect(df).toContain('pipenv');
    });

    it('falls back to pip install -e . when no known install file is present', () => {
      const df = getDockerfile(
        builder,
        makeStack({ language: 'python', keyFiles: [] }),
        tmpDir,
      );
      expect(df).toContain('pip install --no-cache-dir -e .');
    });

    it('.python-version takes precedence over pyproject.toml', () => {
      writeFile(tmpDir, '.python-version', '3.9\n');
      writeFile(tmpDir, 'pyproject.toml', 'requires-python = ">=3.11"\n');
      const df = getDockerfile(builder, makeStack({ language: 'python', keyFiles: [] }), tmpDir);
      expect(df).toContain('FROM python:3.9-slim');
    });
  });

  // ── Node ──────────────────────────────────────────────────────────────────

  describe('Node', () => {
    it('uses node:20-slim as base image', () => {
      const df = getDockerfile(builder, makeStack({ language: 'node' }), tmpDir);
      expect(df).toContain('FROM node:20-slim');
    });

    it('runs npm install and npm run build', () => {
      const df = getDockerfile(builder, makeStack({ language: 'node' }), tmpDir);
      expect(df).toContain('npm install');
      expect(df).toContain('npm run build');
    });

    it('copies package*.json before the rest for layer caching', () => {
      const df = getDockerfile(builder, makeStack({ language: 'node' }), tmpDir);
      const pkgIdx = df.indexOf('COPY package*.json');
      const copyAllIdx = df.indexOf('COPY . .');
      expect(pkgIdx).toBeLessThan(copyAllIdx);
    });
  });

  // ── Rust ──────────────────────────────────────────────────────────────────

  describe('Rust', () => {
    it('uses a multi-stage build with rust:1-slim builder', () => {
      const df = getDockerfile(builder, makeStack({ language: 'rust' }), tmpDir);
      expect(df).toContain('FROM rust:1-slim AS builder');
    });

    it('runs cargo build --release', () => {
      const df = getDockerfile(builder, makeStack({ language: 'rust' }), tmpDir);
      expect(df).toContain('cargo build --release');
    });

    it('copies the release binary into a slim final image', () => {
      const df = getDockerfile(builder, makeStack({ language: 'rust' }), tmpDir);
      expect(df).toContain('FROM debian:bookworm-slim');
      expect(df).toContain('/app/target/release');
    });
  });

  // ── Go ────────────────────────────────────────────────────────────────────

  describe('Go', () => {
    it('uses a multi-stage build with golang:1.22-slim builder', () => {
      const df = getDockerfile(builder, makeStack({ language: 'go' }), tmpDir);
      expect(df).toContain('FROM golang:1.22-slim AS builder');
    });

    it('runs go build', () => {
      const df = getDockerfile(builder, makeStack({ language: 'go' }), tmpDir);
      expect(df).toContain('go build');
    });

    it('copies the built binary into a slim final image', () => {
      const df = getDockerfile(builder, makeStack({ language: 'go' }), tmpDir);
      expect(df).toContain('FROM debian:bookworm-slim');
      expect(df).toContain('/usr/local/bin/app');
    });
  });

  // ── Generic ───────────────────────────────────────────────────────────────

  describe('Generic / Unknown', () => {
    it('uses ubuntu:24.04 as base image', () => {
      const df = getDockerfile(builder, makeStack({ language: 'unknown' }), tmpDir);
      expect(df).toContain('FROM ubuntu:24.04');
    });

    it('installs build-essential and curl', () => {
      const df = getDockerfile(builder, makeStack({ language: 'unknown' }), tmpDir);
      expect(df).toContain('build-essential');
      expect(df).toContain('curl');
    });

    it('runs make if a Makefile is present', () => {
      const df = getDockerfile(builder, makeStack({ language: 'unknown' }), tmpDir);
      expect(df).toContain('Makefile');
      expect(df).toContain('make');
    });
  });
});
