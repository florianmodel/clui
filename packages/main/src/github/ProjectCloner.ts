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
    const projectDir = path.join(this.projectsDir, projectId);
    const targetDir = path.join(projectDir, 'repo');

    if (fs.existsSync(targetDir)) {
      const gitDir = path.join(targetDir, '.git');
      const headFile = path.join(gitDir, 'HEAD');

      if (fs.existsSync(gitDir) && fs.existsSync(headFile)) {
        // .git and HEAD exist — check if the repo is actually usable
        const sha = await this.getHeadSha(targetDir);
        if (sha) {
          // Valid clone — pull latest
          onProgress('Updating existing clone…');
          try {
            await execFileAsync('git', ['-C', targetDir, 'pull', '--ff-only'], {
              timeout: 60_000,
            });
            onProgress('Repository updated.');
          } catch {
            // Pull failed (e.g. diverged history) — keep current clone as-is
            onProgress('Using existing clone (pull skipped).');
          }
          const commitSha = await this.getHeadSha(targetDir);
          return { repoDir: targetDir, commitSha };
        }
      }

      // Partial or corrupt clone — remove before re-cloning
      onProgress('Removing incomplete clone…');
      await this.forceRemove(targetDir);
    }

    // ── Fresh clone ──────────────────────────────────────────────────────────
    fs.mkdirSync(projectDir, { recursive: true });
    await this.cleanupStaleTempClones(projectDir);

    // --template= prevents git from copying Homebrew/system template files into .git/
    // during init (description, hooks, info/exclude).  On macOS/APFS there is a brief
    // window after `mkdir .git` where those files aren't yet accessible, causing ENOENT
    // when git tries to write into them.  Skipping templates avoids that race entirely.
    onProgress(`Cloning ${owner}/${repo}…`);

    let cloneDir = this.createTempCloneDir(projectDir);
    try {
      await this.cloneIntoDir(owner, repo, cloneDir);
    } catch {
      // First attempt failed (APFS timing race or leftover files from parallel process).
      // Clean up whatever git left behind and retry once after a longer settle time.
      onProgress('Clone failed — cleaning up and retrying…');
      await this.forceRemove(cloneDir);
      await new Promise<void>((r) => setTimeout(r, 800));
      cloneDir = this.createTempCloneDir(projectDir);
      await this.cloneIntoDir(owner, repo, cloneDir);
    }

    if (fs.existsSync(targetDir)) {
      await this.forceRemove(targetDir);
      await new Promise<void>((r) => setTimeout(r, 200));
    }

    try {
      fs.renameSync(cloneDir, targetDir);
    } catch {
      // If something recreated repo/ between clone and rename, remove it once and retry.
      if (fs.existsSync(targetDir)) {
        await this.forceRemove(targetDir);
      }
      fs.renameSync(cloneDir, targetDir);
    }

    onProgress('Clone complete.');
    const commitSha = await this.getHeadSha(targetDir);
    return { repoDir: targetDir, commitSha };
  }

  /**
   * Reliably remove a directory tree on macOS/Linux.
   * Node's fs.rmSync({ recursive: true }) can throw ENOTEMPTY on macOS when
   * another process (git, Spotlight, fsevents) holds a handle inside the tree.
   * Shell `rm -rf` is atomic and does not have this race condition.
   */
  async forceRemove(dirPath: string): Promise<void> {
    try {
      await execFileAsync('rm', ['-rf', dirPath], { timeout: 15_000 });
    } catch {
      // If rm -rf somehow failed (shouldn't happen), fall back to Node
      try {
        fs.rmSync(dirPath, { recursive: true, force: true });
      } catch {
        // Best-effort — if it still fails the subsequent clone will fail with a clear error
      }
    }
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

  private createTempCloneDir(projectDir: string): string {
    return fs.mkdtempSync(path.join(projectDir, '.repo-clone-'));
  }

  private async cloneIntoDir(owner: string, repo: string, targetDir: string): Promise<void> {
    const cloneArgs = [
      'clone', '--depth', '1', '--template=',
      `https://github.com/${owner}/${repo}.git`,
      targetDir,
    ];
    await execFileAsync('git', cloneArgs, { timeout: 120_000 });
  }

  private async cleanupStaleTempClones(projectDir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(projectDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('.repo-clone-')) continue;
      await this.forceRemove(path.join(projectDir, entry.name));
    }
  }
}
