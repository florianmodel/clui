import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { getProjectsDir } from '../paths.js';

const execFileAsync = promisify(execFile);

export class ProjectCloner {
  private projectsDir: string;

  constructor() {
    this.projectsDir = getProjectsDir();
  }

  /**
   * Clone (or update) a GitHub repo into ~/.gui-bridge/projects/{projectId}/repo/.
   * Uses --depth 1 for speed. Returns the repo directory and HEAD commit SHA.
   */
  async clone(
    owner: string,
    repo: string,
    onProgress: (msg: string) => void,
  ): Promise<{ repoDir: string; commitSha?: string }> {
    const projectId = `${owner}--${repo}`;
    const targetDir = path.join(this.projectsDir, projectId, 'repo');

    if (fs.existsSync(targetDir)) {
      const gitDir = path.join(targetDir, '.git');
      if (!fs.existsSync(gitDir)) {
        // Directory exists but has no .git (partial/failed clone) — remove and re-clone
        onProgress('Removing incomplete clone and retrying…');
        fs.rmSync(targetDir, { recursive: true, force: true });
      } else {
        // Already cloned — pull latest
        onProgress('Updating existing clone…');
        try {
          await execFileAsync('git', ['-C', targetDir, 'pull', '--ff-only'], {
            timeout: 60_000,
          });
          onProgress('Repository updated.');
        } catch {
          // Pull failed (e.g. diverged) — just use existing clone
          onProgress('Using existing clone (pull skipped).');
        }
        const commitSha = await this.getHeadSha(targetDir);
        return { repoDir: targetDir, commitSha };
      }
    }

    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    onProgress(`Cloning ${owner}/${repo}…`);

    await execFileAsync(
      'git',
      ['clone', '--depth', '1', `https://github.com/${owner}/${repo}.git`, targetDir],
      { timeout: 120_000 },
    );

    onProgress('Clone complete.');
    const commitSha = await this.getHeadSha(targetDir);
    return { repoDir: targetDir, commitSha };
  }

  /** Read the current HEAD commit SHA from a local git repo. Returns undefined on failure. */
  private async getHeadSha(repoDir: string): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', repoDir, 'rev-parse', 'HEAD'],
        { timeout: 5_000 },
      );
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  getProjectDir(projectId: string): string {
    return path.join(this.projectsDir, projectId);
  }
}
