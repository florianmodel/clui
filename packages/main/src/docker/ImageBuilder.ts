import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { StackInfo } from '../analyzer/types.js';

/**
 * Builds Docker images for installed projects.
 * Prefers an existing repo Dockerfile; otherwise generates one from the detected stack.
 */
export class ImageBuilder {
  /**
   * Build (or reuse) a Docker image for the project.
   * Returns the image tag on success.
   */
  async buildForProject(
    projectId: string,
    repoDir: string,
    stack: StackInfo,
    onLog: (line: string) => void,
  ): Promise<string> {
    const imageTag = `gui-bridge-${projectId}`.toLowerCase();

    const existingDockerfile = path.join(repoDir, 'Dockerfile');
    let dockerfilePath: string;
    let cleanup = false;

    if (fs.existsSync(existingDockerfile)) {
      onLog(`Found Dockerfile — building from it…`);
      dockerfilePath = existingDockerfile;
    } else {
      onLog(`No Dockerfile found — generating one for ${stack.language} project…`);
      const content = this.generateDockerfile(stack, repoDir);
      dockerfilePath = path.join(repoDir, '.gui-bridge.Dockerfile');
      fs.writeFileSync(dockerfilePath, content, 'utf8');
      cleanup = true;
    }

    try {
      await this.dockerBuild(imageTag, dockerfilePath, repoDir, onLog);
    } finally {
      if (cleanup && fs.existsSync(dockerfilePath)) {
        fs.unlinkSync(dockerfilePath);
      }
    }

    return imageTag;
  }

  /** Run `docker build` as a child process, streaming output to onLog. */
  private dockerBuild(
    tag: string,
    dockerfilePath: string,
    contextPath: string,
    onLog: (line: string) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', ['build', '-t', tag, '-f', dockerfilePath, contextPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const emit = (data: Buffer) => {
        for (const line of data.toString().split('\n')) {
          const t = line.trim();
          if (t) onLog(t);
        }
      };

      proc.stdout.on('data', emit);
      proc.stderr.on('data', emit);

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`docker build failed with exit code ${code}`));
        }
      });

      proc.on('error', reject);
    });
  }

  private generateDockerfile(stack: StackInfo, repoDir: string): string {
    switch (stack.language) {
      case 'python':
        return this.pythonDockerfile(stack, repoDir);
      case 'node':
        return this.nodeDockerfile();
      case 'rust':
        return this.rustDockerfile();
      case 'go':
        return this.goDockerfile();
      default:
        return this.genericDockerfile();
    }
  }

  private pythonDockerfile(stack: StackInfo, repoDir: string): string {
    const pythonVersion = this.detectPythonVersion(repoDir) ?? '3.12';

    let installStep = '';
    if (stack.keyFiles.includes('pyproject.toml') || stack.keyFiles.includes('setup.py')) {
      installStep = 'RUN pip install --no-cache-dir .';
    } else if (stack.keyFiles.includes('requirements.txt')) {
      installStep = 'COPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt';
    } else if (stack.keyFiles.includes('Pipfile')) {
      installStep = 'RUN pip install --no-cache-dir pipenv && pipenv install --system --deploy';
    } else {
      installStep = 'RUN pip install --no-cache-dir -e . 2>/dev/null || true';
    }

    return `FROM python:${pythonVersion}-slim
WORKDIR /app
COPY . .
${installStep}
`;
  }

  private nodeDockerfile(): string {
    return `FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN npm run build 2>/dev/null || true
`;
  }

  private rustDockerfile(): string {
    return `FROM rust:1-slim AS builder
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release /usr/local/bin/
WORKDIR /app
`;
  }

  private goDockerfile(): string {
    return `FROM golang:1.22-slim AS builder
WORKDIR /app
COPY . .
RUN go build -o /usr/local/bin/app .

FROM debian:bookworm-slim
COPY --from=builder /usr/local/bin/app /usr/local/bin/app
WORKDIR /app
`;
  }

  private genericDockerfile(): string {
    return `FROM ubuntu:24.04
RUN apt-get update && apt-get install -y build-essential curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN if [ -f Makefile ]; then make; fi
`;
  }

  private detectPythonVersion(repoDir: string): string | undefined {
    // Check .python-version
    const pvFile = path.join(repoDir, '.python-version');
    if (fs.existsSync(pvFile)) {
      const v = fs.readFileSync(pvFile, 'utf8').trim();
      const match = v.match(/^(\d+\.\d+)/);
      if (match) return match[1];
    }
    // Check pyproject.toml requires-python
    const ppFile = path.join(repoDir, 'pyproject.toml');
    if (fs.existsSync(ppFile)) {
      const content = fs.readFileSync(ppFile, 'utf8');
      const match = content.match(/requires-python\s*=\s*["']>=?\s*(\d+\.\d+)/);
      if (match) return match[1];
    }
    return undefined;
  }
}
