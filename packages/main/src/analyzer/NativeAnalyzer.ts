import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import type { CapabilityDump } from '@gui-bridge/shared';
import { StackDetector } from './StackDetector.js';
import { ReadmeParser } from './ReadmeParser.js';
import { HelpParser } from './introspectors/HelpParser.js';

const execFileAsync = promisify(execFile);

/**
 * Docker-free alternative to Analyzer.
 * Runs the tool directly on the host to gather CLI metadata.
 *
 * Used when Docker is unavailable and the tool is a known binary
 * installed natively via Homebrew/pip/npm/cargo.
 */
export class NativeAnalyzer {
  constructor(private scriptsDir: string) {}

  async analyze(repoDir: string, binary: string): Promise<CapabilityDump> {
    const warnings: string[] = [];

    const stack = StackDetector.detect(repoDir);
    const readme = ReadmeParser.parse(repoDir);

    const helpText = await this.getHelpText(binary, warnings);

    let args: CapabilityDump['arguments'] = [];
    let subcommands: CapabilityDump['subcommands'] = [];
    let introspectionMethod: CapabilityDump['introspectionMethod'] = 'none';

    // Try Python introspection if the tool is Python-based and python3 is on PATH
    if (stack.language === 'python' && stack.entrypoint && stack.entrypointConfidence >= 0.5) {
      const introspected = await this.tryPythonIntrospection(
        stack.entrypoint,
        stack.framework,
        warnings,
      );
      if (introspected) {
        args = introspected.arguments;
        subcommands = introspected.subcommands;
        introspectionMethod = introspected.method;
      }
    }

    // Fallback: parse --help text
    if (args.length === 0 && helpText) {
      const parsed = HelpParser.parse(helpText);
      args = parsed.arguments;
      subcommands = parsed.subcommands;
      introspectionMethod = 'help-parser';
    }

    return {
      analyzedAt: new Date().toISOString(),
      repoDir,
      dockerImage: `native:${binary}`,
      stack: {
        language: stack.language,
        framework: stack.framework,
        entrypoint: stack.entrypoint,
        entrypointConfidence: stack.entrypointConfidence,
        keyFiles: stack.keyFiles,
      },
      readme: {
        description: readme.description,
        usageExamples: readme.usageExamples,
        installInstructions: readme.installInstructions,
        fullContent: readme.fullContent,
      },
      arguments: args,
      subcommands,
      helpText,
      introspectionMethod,
      warnings,
    };
  }

  private async getHelpText(binary: string, warnings: string[]): Promise<string> {
    const candidates = [
      [binary, '--help'],
      [binary, '-h'],
      [binary, 'help'],
    ];

    for (const cmd of candidates) {
      try {
        const output = await this.captureOutput(cmd, 15_000);
        const combined = (output.stdout + output.stderr).trim();
        if (
          combined.length > 50 &&
          /usage|options|--help|USAGE|OPTIONS|commands|arguments/i.test(combined)
        ) {
          return combined;
        }
      } catch {
        // try next
      }
    }

    warnings.push(`Could not retrieve --help from binary: ${binary}`);
    return '';
  }

  /**
   * Try running Python introspection scripts locally.
   * Falls back silently if python3 is not available or if scripts fail.
   */
  private async tryPythonIntrospection(
    entrypoint: string,
    framework: 'argparse' | 'click' | 'typer' | 'unknown',
    warnings: string[],
  ): Promise<{
    arguments: CapabilityDump['arguments'];
    subcommands: CapabilityDump['subcommands'];
    method: CapabilityDump['introspectionMethod'];
  } | null> {
    if (framework === 'unknown') return null;

    const scriptName = framework === 'argparse'
      ? 'introspect_argparse.py'
      : framework === 'click' || framework === 'typer'
        ? 'introspect_click.py'
        : null;

    if (!scriptName) return null;

    const scriptPath = path.join(this.scriptsDir, scriptName);

    try {
      const result = await this.captureOutput(['python3', scriptPath, entrypoint], 30_000);

      if (result.exitCode !== 0 || !result.stdout.trim()) {
        warnings.push(`Native Python introspection failed (${framework}): ${result.stderr.slice(0, 200)}`);
        return null;
      }

      const json = JSON.parse(result.stdout.trim()) as {
        arguments?: unknown[];
        subcommands?: unknown[];
        error?: string;
      };

      if (json.error) {
        warnings.push(`Native Python introspection error: ${json.error}`);
        return null;
      }

      // The script output format matches CapabilityDump shape closely enough
      // for the LLM to work with it. Cast through unknown to satisfy types.
      return {
        arguments: (json.arguments ?? []) as unknown as CapabilityDump['arguments'],
        subcommands: (json.subcommands ?? []) as unknown as CapabilityDump['subcommands'],
        method: framework as CapabilityDump['introspectionMethod'],
      };
    } catch {
      warnings.push(`Native Python introspection threw: check python3 is on PATH`);
      return null;
    }
  }

  private captureOutput(
    cmd: string[],
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const proc = spawn(cmd[0], cmd.slice(1));
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      proc.stdout.on('data', (d: Buffer) => stdout.push(d));
      proc.stderr.on('data', (d: Buffer) => stderr.push(d));

      const timer = setTimeout(() => proc.kill('SIGTERM'), timeoutMs);

      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
          exitCode: code ?? -1,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({ stdout: '', stderr: err.message, exitCode: -1 });
      });
    });
  }
}
