import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { RunRecord } from '@gui-bridge/shared';

const MAX_RECORDS = 100;

export class HistoryStore {
  private projectsDir: string;

  constructor() {
    this.projectsDir = path.join(os.homedir(), '.gui-bridge', 'projects');
  }

  private historyPath(projectId: string): string {
    return path.join(this.projectsDir, projectId, 'history.json');
  }

  private readAll(projectId: string): RunRecord[] {
    const p = this.historyPath(projectId);
    try {
      const raw = fs.readFileSync(p, 'utf8');
      return JSON.parse(raw) as RunRecord[];
    } catch {
      return [];
    }
  }

  append(projectId: string, record: RunRecord): void {
    const records = this.readAll(projectId);
    records.unshift(record); // newest first
    const trimmed = records.slice(0, MAX_RECORDS);
    const p = this.historyPath(projectId);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(trimmed, null, 2), 'utf8');
  }

  list(projectId: string): RunRecord[] {
    return this.readAll(projectId);
  }

  clear(projectId: string): void {
    const p = this.historyPath(projectId);
    try {
      fs.unlinkSync(p);
    } catch {
      // file didn't exist — that's fine
    }
  }
}
