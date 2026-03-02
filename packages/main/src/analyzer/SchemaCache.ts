import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { UISchema, CapabilityDump } from '@gui-bridge/shared';

export class SchemaCache {
  private baseDir: string;

  constructor() {
    this.baseDir = path.join(os.homedir(), '.gui-bridge', 'projects');
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

  /** Build a stable cache key from repo dir + docker image */
  static buildKey(repoDir: string, dockerImage: string): string {
    const repoName = path.basename(repoDir);
    // Sanitize docker image tag for use as directory name
    const imagePart = dockerImage.replace(/[/:]/g, '-');
    return `${repoName}--${imagePart}`;
  }
}
