import { DockerManager } from '../docker/DockerManager.js';
import { DockerExecutor } from './DockerExecutor.js';
import { NativeExecutor } from './NativeExecutor.js';
import type { IExecutor } from './IExecutor.js';
import type { ProjectMeta } from '@gui-bridge/shared';

/**
 * Picks the right IExecutor implementation for a given project.
 *
 * Priority rules:
 * 1. If meta.executionMode is explicitly set, respect it.
 * 2. If Docker is unavailable but a native binary is known, use NativeExecutor.
 * 3. Otherwise fall back to DockerExecutor.
 */
export class ExecutorRouter {
  constructor(private docker: DockerManager) {}

  async forProject(meta: ProjectMeta): Promise<IExecutor> {
    if (meta.executionMode === 'native') {
      return new NativeExecutor();
    }
    if (meta.executionMode === 'docker') {
      return new DockerExecutor(this.docker, meta.dockerImage);
    }

    // Auto-detect: use native if Docker is down and binary is known
    const dockerHealth = await this.docker.checkHealth();
    if (!dockerHealth.ok && meta.nativeBinary) {
      return new NativeExecutor();
    }

    return new DockerExecutor(this.docker, meta.dockerImage);
  }
}
