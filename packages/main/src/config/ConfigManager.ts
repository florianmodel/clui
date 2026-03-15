import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { AppConfig } from '@gui-bridge/shared';

export class ConfigManager {
  private configPath: string;

  constructor() {
    const configDir = path.join(os.homedir(), '.gui-bridge');
    this.configPath = path.join(configDir, 'config.json');
  }

  getConfig(): AppConfig {
    try {
      const content = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(content) as AppConfig;
    } catch {
      return {};
    }
  }

  setConfig(updates: Partial<AppConfig>): void {
    const existing = this.getConfig();
    const updated = { ...existing, ...updates };
    const configDir = path.dirname(this.configPath);
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(updated, null, 2), 'utf8');
  }

  hasApiKey(): boolean {
    const config = this.getConfig();
    return !!config.anthropicApiKey || !!config.openaiApiKey;
  }
}
