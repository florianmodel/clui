import * as fs from 'fs';
import * as path from 'path';
import { safeStorage } from 'electron';
import type { AppConfig } from '@gui-bridge/shared';
import { getConfigPath } from '../paths.js';

/**
 * Persists app configuration to disk.
 *
 * API keys are encrypted with Electron safeStorage (macOS Keychain / Windows
 * Credential Manager / Linux Secret Service) before being written to the JSON
 * config file. The stored values are base64-encoded ciphertext — they are
 * useless without access to the OS credential store on the same machine.
 *
 * Fallback: if safeStorage is not available (e.g. during automated tests or
 * headless environments), keys are stored as plaintext with a `plain:` prefix
 * so the code can round-trip correctly.
 *
 * Backward compatibility: legacy values stored before encryption was
 * introduced (no `enc:` / `plain:` prefix) are read as-is and re-encrypted
 * transparently on the next write.
 */
export class ConfigManager {
  private configPath: string;

  constructor() {
    this.configPath = getConfigPath();
  }

  getConfig(): AppConfig {
    try {
      const content = fs.readFileSync(this.configPath, 'utf8');
      const raw = JSON.parse(content) as Record<string, unknown>;
      return this.decryptKeys(raw);
    } catch {
      return {};
    }
  }

  setConfig(updates: Partial<AppConfig>): void {
    const existing = this.getConfig();
    const updated = { ...existing, ...updates };
    const encrypted = this.encryptKeys(updated);
    const configDir = path.dirname(this.configPath);
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(encrypted, null, 2), 'utf8');
  }

  hasApiKey(): boolean {
    const config = this.getConfig();
    return !!config.anthropicApiKey || !!config.openaiApiKey;
  }

  // ── Encryption helpers ─────────────────────────────────────────────────────

  private readonly KEY_FIELDS: (keyof AppConfig)[] = ['anthropicApiKey', 'openaiApiKey'];

  /** Encrypt sensitive fields before writing to disk. */
  private encryptKeys(config: AppConfig): Record<string, unknown> {
    const out: Record<string, unknown> = { ...config };
    for (const field of this.KEY_FIELDS) {
      const value = config[field];
      if (typeof value !== 'string' || value === '') continue;
      // Already encrypted/marked — don't double-encrypt
      if (value.startsWith('enc:') || value.startsWith('plain:')) {
        out[field] = value;
        continue;
      }
      out[field] = this.encrypt(value);
    }
    return out;
  }

  /** Decrypt sensitive fields after reading from disk. */
  private decryptKeys(raw: Record<string, unknown>): AppConfig {
    const out: Record<string, unknown> = { ...raw };
    for (const field of this.KEY_FIELDS) {
      const value = raw[field];
      if (typeof value !== 'string' || value === '') continue;
      out[field] = this.decrypt(value);
    }
    return out as AppConfig;
  }

  private encrypt(plaintext: string): string {
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buf = safeStorage.encryptString(plaintext);
        return 'enc:' + buf.toString('base64');
      } catch {
        // Fall through to plaintext fallback
      }
    }
    return 'plain:' + plaintext;
  }

  private decrypt(stored: string): string {
    if (stored.startsWith('enc:')) {
      try {
        const buf = Buffer.from(stored.slice(4), 'base64');
        return safeStorage.decryptString(buf);
      } catch {
        // Corrupted ciphertext — return empty so the user is prompted to re-enter
        return '';
      }
    }
    if (stored.startsWith('plain:')) {
      return stored.slice(6);
    }
    // Legacy plaintext value (no prefix) — return as-is.
    // It will be re-encrypted on the next setConfig() call.
    return stored;
  }
}
