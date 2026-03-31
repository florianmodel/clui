import type { CapabilityDump, UISchema, AnalysisProgressEvent } from '@gui-bridge/shared';
import type { DockerManager } from '../docker/DockerManager.js';
import { StackDetector } from './StackDetector.js';
import { ReadmeParser } from './ReadmeParser.js';
import { HelpParser } from './introspectors/HelpParser.js';
import { ArgparseIntrospector } from './introspectors/ArgparseIntrospector.js';
import { ClickIntrospector } from './introspectors/ClickIntrospector.js';
import type { ILLMClient } from './LLMClient.js';
import { SchemaCache } from './SchemaCache.js';

export class Analyzer {
  private schemaCache = new SchemaCache();

  constructor(
    private docker: DockerManager,
    private scriptsDir: string,
  ) {}

  /**
   * Analyze a project:
   * 1. Detect stack (language, framework, entrypoint)
   * 2. Parse README
   * 3. Run framework-specific introspector (if Python)
   * 4. Fallback: run --help and parse output
   */
  async analyze(repoDir: string, dockerImage: string, analyzerCommand?: string[]): Promise<CapabilityDump> {
    const warnings: string[] = [];

    // Step 1: stack detection (host FS reads)
    const stack = StackDetector.detect(repoDir);

    // Step 2: README parsing (host FS reads)
    const readme = ReadmeParser.parse(repoDir);

    // Step 3: get --help output (always useful, also serves as fallback)
    const helpText = await this.getHelpText(
      dockerImage,
      stack.entrypoint,
      analyzerCommand ?? stack.analyzerCommand,
      warnings,
    );

    // Step 4: framework-specific introspection
    let introspectionMethod: CapabilityDump['introspectionMethod'] = 'none';
    let args: CapabilityDump['arguments'] = [];
    let subcommands: CapabilityDump['subcommands'] = [];

    if (stack.language === 'python' && stack.entrypoint && stack.entrypointConfidence >= 0.5) {
      const { method, result, warning } = await this.runPythonIntrospection(
        dockerImage,
        stack.entrypoint,
        stack.framework,
        warnings,
      );
      introspectionMethod = method;
      args = result.arguments;
      subcommands = result.subcommands;
      if (warning) warnings.push(warning);
    }

    // Fallback to HelpParser if introspection didn't produce results
    if (args.length === 0 && helpText) {
      const parsed = HelpParser.parse(helpText);
      args = parsed.arguments;
      subcommands = parsed.subcommands;
      introspectionMethod = 'help-parser';
    }

    return {
      analyzedAt: new Date().toISOString(),
      repoDir,
      dockerImage,
      stack: {
        language: stack.language,
        framework: stack.framework,
        entrypoint: stack.entrypoint,
        entrypointConfidence: stack.entrypointConfidence,
        keyFiles: stack.keyFiles,
        analyzerCommand: analyzerCommand ?? stack.analyzerCommand,
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

  private async getHelpText(
    dockerImage: string,
    entrypoint: string | undefined,
    analyzerCommand: string[] | undefined,
    warnings: string[],
  ): Promise<string> {
    // Derive a candidate binary name from the image tag (e.g. "gui-bridge/yt-dlp" → "yt-dlp")
    const imageBin = dockerImage.split('/').pop()?.split(':')[0] ?? '';

    const commands: string[][] = [];

    if (analyzerCommand && analyzerCommand.length > 0) {
      commands.push([...analyzerCommand, '--help']);
    }

    // 1. ENTRYPOINT --help (works when Dockerfile sets ENTRYPOINT — most reliable)
    commands.push(['--help']);

    // 2. python -m module (reliable for pip-installed Python packages)
    if (entrypoint) {
      // entrypoint may be "yt_dlp:main" → module is "yt_dlp"
      const module = entrypoint.includes(':')
        ? entrypoint.split(':')[0]
        : entrypoint.replace(/\//g, '.').replace(/\.py$/, '');
      commands.push(['python', '-m', module, '--help']);
    }

    // 3. Image-basename as CLI binary (yt-dlp, black, rg, etc.)
    if (imageBin) {
      commands.push([imageBin, '--help']);
    }

    for (const cmd of commands) {
      try {
        const result = await this.docker.runCommand(
          dockerImage,
          cmd,
          { timeout: 15_000, entrypoint: cmd[0] === '--help' ? undefined : [] },
          () => {},
        );
        const output = (result.stdout + result.stderr).trim();
        // Only accept output that looks like help text (not a Python/shell error)
        if (
          output.length > 50 &&
          /usage|options|--help|USAGE|OPTIONS|commands|arguments/i.test(output)
        ) {
          return output;
        }
      } catch {
        // try next command
      }
    }

    warnings.push('Could not retrieve --help output from container');
    return '';
  }

  private async runPythonIntrospection(
    dockerImage: string,
    entrypoint: string,
    framework: 'argparse' | 'click' | 'typer' | 'unknown',
    warnings: string[],
  ): Promise<{
    method: CapabilityDump['introspectionMethod'];
    result: { arguments: CapabilityDump['arguments']; subcommands: CapabilityDump['subcommands'] };
    warning?: string;
  }> {
    if (framework === 'argparse') {
      const introspector = new ArgparseIntrospector(this.docker, this.scriptsDir);
      const result = await introspector.introspect(dockerImage, entrypoint);
      if (result.error) {
        return {
          method: 'help-parser',
          result: { arguments: [], subcommands: [] },
          warning: `argparse introspection failed: ${result.error}`,
        };
      }
      return { method: 'argparse', result };
    }

    if (framework === 'click' || framework === 'typer') {
      const introspector = new ClickIntrospector(this.docker, this.scriptsDir, framework);
      const result = await introspector.introspect(dockerImage, entrypoint);
      if (result.error) {
        return {
          method: 'help-parser',
          result: { arguments: [], subcommands: [] },
          warning: `${framework} introspection failed: ${result.error}`,
        };
      }
      return { method: framework, result };
    }

    // Unknown framework — skip Python introspection
    return {
      method: 'help-parser',
      result: { arguments: [], subcommands: [] },
    };
  }

  /**
   * Full pipeline: static analysis → LLM schema generation.
   * Sends progress events via the provided callback.
   * Uses the schema cache — pass forceRegenerate=true to bypass.
   */
  async analyzeAndGenerate(
    repoDir: string,
    dockerImage: string,
    llmClient: ILLMClient,
    onProgress: (event: AnalysisProgressEvent) => void,
    options?: { forceRegenerate?: boolean },
    analyzerCommand?: string[],
  ): Promise<{ schema: UISchema; warnings: string[] }> {
    const cacheKey = SchemaCache.buildKey(repoDir, dockerImage);

    // Check cache first
    if (!options?.forceRegenerate) {
      const cached = this.schemaCache.get(cacheKey);
      if (cached) {
        onProgress({ stage: 'complete', message: 'Loaded from cache.' });
        return { schema: cached, warnings: [] };
      }
    }

    // Step 1: static analysis
    onProgress({ stage: 'detecting', message: 'Detecting language and framework…' });
    const dump = await this.analyze(repoDir, dockerImage, analyzerCommand);
    this.schemaCache.saveDump(cacheKey, dump);

    // Step 2: LLM schema generation
    onProgress({
      stage: 'generating-ui',
      message: 'Generating UI with AI…',
      detail: `${dump.arguments.length} args · ${dump.subcommands.length} subcommands`,
    });
    const { schema, warnings } = await llmClient.generateUISchema(dump, dockerImage);

    // If the LLM did a repair pass, let the user know
    if (warnings.some(w => w.includes('placeholder mismatch') || w.includes('multi-file'))) {
      onProgress({ stage: 'generating-ui', message: 'Repairing schema issues…' });
    }

    // Save to cache
    this.schemaCache.save(cacheKey, schema);
    onProgress({ stage: 'complete', message: 'UI schema generated.' });

    return { schema, warnings };
  }

  /**
   * Refine an existing schema with user feedback.
   */
  async refineSchema(
    repoDir: string,
    dockerImage: string,
    currentSchema: UISchema,
    llmClient: ILLMClient,
    onProgress: (event: AnalysisProgressEvent) => void,
    feedback?: string,
    analyzerCommand?: string[],
  ): Promise<UISchema> {
    const cacheKey = SchemaCache.buildKey(repoDir, dockerImage);

    onProgress({ stage: 'generating-ui', message: 'Refining UI with AI…' });

    // Load dump from cache if available, otherwise re-analyze
    let dump: CapabilityDump;
    const cachedDump = this.schemaCache.getDump(cacheKey);
    if (cachedDump) {
      dump = cachedDump;
    } else {
      onProgress({ stage: 'detecting', message: 'Re-analyzing tool…' });
      dump = await this.analyze(repoDir, dockerImage, analyzerCommand);
      this.schemaCache.saveDump(cacheKey, dump);
    }

    const refined = await llmClient.refineUISchema(currentSchema, dump, dockerImage, feedback);
    this.schemaCache.save(cacheKey, refined);
    onProgress({ stage: 'complete', message: 'Schema refined.' });

    return refined;
  }
}
