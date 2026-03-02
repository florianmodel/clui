import * as fs from 'fs';
import * as path from 'path';
import type { StackInfo } from './types.js';

/**
 * Detects the language, framework, and entrypoint of a project
 * by reading files on the host filesystem (no Docker required).
 */
export class StackDetector {
  static detect(repoDir: string): StackInfo {
    const keyFiles: string[] = [];

    // ── Language detection ───────────────────────────────────────────────
    const hasPyproject = fs.existsSync(path.join(repoDir, 'pyproject.toml'));
    const hasSetupPy = fs.existsSync(path.join(repoDir, 'setup.py'));
    const hasRequirements = fs.existsSync(path.join(repoDir, 'requirements.txt'));
    const hasPackageJson = fs.existsSync(path.join(repoDir, 'package.json'));
    const hasCargo = fs.existsSync(path.join(repoDir, 'Cargo.toml'));
    const hasGoMod = fs.existsSync(path.join(repoDir, 'go.mod'));

    if (hasPyproject) keyFiles.push('pyproject.toml');
    if (hasSetupPy) keyFiles.push('setup.py');
    if (hasRequirements) keyFiles.push('requirements.txt');
    if (hasPackageJson) keyFiles.push('package.json');
    if (hasCargo) keyFiles.push('Cargo.toml');
    if (hasGoMod) keyFiles.push('go.mod');

    let language: StackInfo['language'] = 'unknown';
    if (hasPyproject || hasSetupPy || hasRequirements) {
      language = 'python';
    } else if (hasPackageJson) {
      language = 'node';
    } else if (hasCargo) {
      language = 'rust';
    } else if (hasGoMod) {
      language = 'go';
    }

    // ── Framework detection (Python only) ────────────────────────────────
    let framework: StackInfo['framework'] = 'unknown';
    if (language === 'python') {
      framework = StackDetector.detectPythonFramework(repoDir);
    }

    // ── Entrypoint detection ─────────────────────────────────────────────
    const { entrypoint, confidence } = StackDetector.detectEntrypoint(
      repoDir,
      hasPyproject,
      hasSetupPy,
    );

    return {
      language,
      framework,
      entrypoint,
      entrypointConfidence: confidence,
      keyFiles,
    };
  }

  private static detectPythonFramework(repoDir: string): StackInfo['framework'] {
    // Scan all Python files and accumulate framework signals.
    // Return the highest-priority framework found across ALL files
    // (typer > click > argparse), so a single blib2to3/vendored file
    // with argparse doesn't shadow the real framework.
    const candidates = StackDetector.gatherPythonFiles(repoDir, 3);

    let found: Set<StackInfo['framework']> = new Set();
    for (const filePath of candidates) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        if (/^(?:import|from)\s+typer\b/m.test(content) || /from\s+typer\s+import/m.test(content)) {
          found.add('typer');
        }
        if (/^(?:import|from)\s+click\b/m.test(content) || /from\s+click\s+import/m.test(content)) {
          found.add('click');
        }
        if (/^import\s+argparse\b/m.test(content) || /from\s+argparse\s+import/m.test(content)) {
          found.add('argparse');
        }
      } catch {
        // skip unreadable files
      }
    }

    // Priority: typer > click > argparse
    if (found.has('typer')) return 'typer';
    if (found.has('click')) return 'click';
    if (found.has('argparse')) return 'argparse';
    return 'unknown';
  }

  private static gatherPythonFiles(dir: string, maxDepth: number): string[] {
    const results: string[] = [];
    if (maxDepth === 0) return results;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return results;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.py')) {
        results.push(full);
      } else if (entry.isDirectory()) {
        results.push(...StackDetector.gatherPythonFiles(full, maxDepth - 1));
      }
    }
    return results;
  }

  private static detectEntrypoint(
    repoDir: string,
    hasPyproject: boolean,
    hasSetupPy: boolean,
  ): { entrypoint?: string; confidence: number } {
    // 1. Try console_scripts in setup.py or pyproject.toml (high confidence)
    if (hasSetupPy) {
      const ep = StackDetector.extractConsoleScript(path.join(repoDir, 'setup.py'));
      if (ep) return { entrypoint: ep, confidence: 0.9 };
    }
    if (hasPyproject) {
      const ep = StackDetector.extractConsoleScript(path.join(repoDir, 'pyproject.toml'));
      if (ep) return { entrypoint: ep, confidence: 0.9 };
    }

    // 2. __main__.py
    const mainPy = path.join(repoDir, '__main__.py');
    if (fs.existsSync(mainPy)) {
      return { entrypoint: '__main__.py', confidence: 0.7 };
    }
    // Also check src/__main__.py
    const srcMain = path.join(repoDir, 'src', '__main__.py');
    if (fs.existsSync(srcMain)) {
      return { entrypoint: 'src/__main__.py', confidence: 0.7 };
    }

    // 3. Common entry filenames
    for (const name of ['main.py', 'cli.py', 'app.py', '__main__.py']) {
      // Check top-level and src/
      for (const prefix of ['', 'src/']) {
        const fp = path.join(repoDir, prefix + name);
        if (fs.existsSync(fp)) {
          return { entrypoint: prefix + name, confidence: 0.5 };
        }
      }
    }

    return { entrypoint: undefined, confidence: 0 };
  }

  /**
   * Extract the console_scripts entry point from setup.py or pyproject.toml.
   * Returns the raw "module:function" string (e.g. "yt_dlp:main", "black:patched_main").
   * Returns undefined if not found.
   */
  private static extractConsoleScript(filePath: string): string | undefined {
    try {
      const content = fs.readFileSync(filePath, 'utf8');

      // setup.py / setup.cfg: console_scripts = ['name = module:func']
      const setupMatch = content.match(/console_scripts[^[]*\[([^\]]+)\]/s);
      if (setupMatch) {
        // Extract: 'name = "module:func"' or "name = 'module:func'"
        const entryMatch = setupMatch[1].match(/=\s*["']([^"']+)["']/);
        if (entryMatch) return entryMatch[1].trim(); // e.g. "yt_dlp:main"
        // Plain form: name = module:func (no quotes)
        const plainMatch = setupMatch[1].match(/=\s*(\S+:\S+)/);
        if (plainMatch) return plainMatch[1].trim();
      }

      // pyproject.toml: [project.scripts] or [tool.poetry.scripts]
      // e.g.  yt-dlp = "yt_dlp:main"
      const pyprojectMatch = content.match(
        /\[(?:project|tool\.poetry)\.scripts\]\s*([\s\S]*?)(?:\[|$)/,
      );
      if (pyprojectMatch) {
        const entryMatch = pyprojectMatch[1].match(/=\s*"([^"]+)"/);
        if (entryMatch) return entryMatch[1].trim(); // e.g. "yt_dlp:main"
      }
    } catch {
      // ignore
    }
    return undefined;
  }
}
