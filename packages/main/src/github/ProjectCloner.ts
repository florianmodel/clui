import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execFileAsync = promisify(execFile);

export class ProjectCloner {
  private projectsDir: string;

  constructor() {
    this.projectsDir = path.join(os.homedir(), '.gui-bridge', 'projects');
  }

  /**
   * Clone (or update) a GitHub repo into ~/.gui-bridge/projects/{projectId}/repo/.
   * Uses --depth 1 for speed.
   */
  async clone(
    owner: string,
    repo: string,
    onProgress: (msg: string) => void,
  ): Promise<string> {
    const projectId = `${owner}--${repo}`;
    const targetDir = path.join(this.projectsDir, projectId, 'repo');

    if (fs.existsSync(targetDir)) {
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
      return targetDir;
    }

    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    onProgress(`Cloning ${owner}/${repo}…`);

    await execFileAsync(
      'git',
      ['clone', '--depth', '1', `https://github.com/${owner}/${repo}.git`, targetDir],
      { timeout: 120_000 },
    );

    onProgress('Clone complete.');
    return targetDir;
  }

  getProjectDir(projectId: string): string {
    return path.join(this.projectsDir, projectId);
  }
}
