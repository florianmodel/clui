import * as fs from 'fs';
import * as path from 'path';
import type { UISchema, CapabilityDump } from '@gui-bridge/shared';
import { getProjectsDir } from '../paths.js';

export class SchemaCache {
  private baseDir: string;

  constructor() {
    this.baseDir = getProjectsDir();
  }

  get(cacheKey: string): UISchema | null {
    const schemaPath = path.join(this.baseDir, cacheKey, 'schema.json');
    try {
      const content = fs.readFileSync(schemaPath, 'utf8');
      return JSON.parse(content) as UISchema;
    } catch {
      return null;
    }
  }

  save(cacheKey: string, schema: UISchema): void {
    const projectDir = path.join(this.baseDir, cacheKey);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'schema.json'),
      JSON.stringify(schema, null, 2),
      'utf8',
    );
  }

  saveDump(cacheKey: string, dump: CapabilityDump): void {
    const projectDir = path.join(this.baseDir, cacheKey);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'capability-dump.json'),
      JSON.stringify(dump, null, 2),
      'utf8',
    );
  }

  invalidate(cacheKey: string): void {
    const schemaPath = path.join(this.baseDir, cacheKey, 'schema.json');
    try {
      fs.unlinkSync(schemaPath);
    } catch {
      // ignore if not found
    }
  }

  /**
   * Find a cached schema whose dockerImage matches and overwrite it.
   * Returns true if a match was found and saved; false if no cached entry exists
   * (e.g. for bundled example schemas that live in the repo, not in the cache).
   */
  saveByDockerImage(schema: UISchema): boolean {
    if (!fs.existsSync(this.baseDir)) return false;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
    } catch {
      return false;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const schemaPath = path.join(this.baseDir, entry.name, 'schema.json');
      try {
        const existing = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as UISchema;
        if (existing.dockerImage === schema.dockerImage) {
          fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2), 'utf8');
          return true;
        }
      } catch {
        // unreadable or missing file — skip
      }
    }

    return false;
  }

  /** Build a stable cache key from repo dir + docker image */
  static buildKey(repoDir: string, dockerImage: string): string {
    const repoName = path.basename(repoDir);
    // Sanitize docker image tag for use as directory name
    const imagePart = dockerImage.replace(/[/:]/g, '-');
    return `${repoName}--${imagePart}`;
  }
}
