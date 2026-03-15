import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type {
  ProjectMeta,
  ProjectStatus,
  InstallProgressEvent,
  SearchResult,
  UISchema,
} from '@gui-bridge/shared';
import { DockerManager } from '../docker/DockerManager.js';
import { ImageBuilder } from '../docker/ImageBuilder.js';
import { ProjectCloner } from '../github/ProjectCloner.js';
import { StackDetector } from '../analyzer/StackDetector.js';
import { Analyzer } from '../analyzer/Analyzer.js';
import { NativeAnalyzer } from '../analyzer/NativeAnalyzer.js';
import type { ILLMClient } from '../analyzer/LLMClient.js';
import { TemplateRegistry } from '../registry/index.js';
import { KnownToolRegistry, NativeInstallManager } from '../native/index.js';
import { getProjectsDir } from '../paths.js';

export class ProjectManager {
  private projectsDir: string;
  private cloner: ProjectCloner;
  private imageBuilder: ImageBuilder;
  private docker: DockerManager;
  private registry: TemplateRegistry;
  private nativeInstall: NativeInstallManager;

  constructor(docker: DockerManager, private scriptsDir: string) {
    this.docker = docker;
    this.projectsDir = getProjectsDir();
    this.cloner = new ProjectCloner();
    this.imageBuilder = new ImageBuilder();
    this.registry = new TemplateRegistry();
    this.nativeInstall = new NativeInstallManager();
  }

  /**
   * Full installation pipeline:
   * clone → detect → registry check → build image → analyze CLI → generate UI schema.
   * Emits progress events via onProgress callback.
   *
   * Registry check (step 2.5): silently fetches a pre-generated schema from the community
   * registry. If found, the analyze + LLM-generate steps are skipped (saving ~25s + API cost).
   * The Docker image is always built — it's required for execution regardless.
   */
  async install(
    owner: string,
    repo: string,
    searchResult: SearchResult,
    llmClient: ILLMClient | null,
    onProgress: (event: InstallProgressEvent) => void,
  ): Promise<ProjectMeta> {
    const projectId = `${owner}--${repo}`;
    const imageTag = `gui-bridge-${projectId}`.toLowerCase();

    const send = (
      stage: InstallProgressEvent['stage'],
      message: string,
    ) => onProgress({ projectId, stage, message });

    try {
      // Step 1: Clone
      send('cloning', `Cloning ${owner}/${repo}…`);
      const { repoDir, commitSha } = await this.cloner.clone(owner, repo, (msg) => send('cloning', msg));

      // Step 2: Detect stack
      send('detecting', 'Detecting project type…');
      const stack = StackDetector.detect(repoDir);
      send('detecting', `Detected: ${stack.language}${stack.framework && stack.framework !== 'unknown' ? ` + ${stack.framework}` : ''}`);

      // Step 2.5: Registry check — silent, ≤2s, falls through on any failure
      send('registry', 'Checking community templates…');
      const registryHit = await this.registry.lookup(owner, repo);

      if (registryHit) {
        // Found a pre-generated schema — skip analyze + LLM
        send('registry', 'Found community template — skipping AI generation ✓');

        const schemaPath = path.join(this.projectsDir, projectId, 'schema.json');
        fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
        fs.writeFileSync(schemaPath, JSON.stringify(registryHit.schema, null, 2), 'utf8');

        // Still need Docker image for execution
        const imageAlreadyBuilt = await this.docker.imageExists(imageTag);
        if (imageAlreadyBuilt) {
          send('building', 'Docker image already built — reusing existing image ✓');
        } else {
          send('building', 'Building Docker image (this may take a few minutes)…');
          await this.imageBuilder.buildForProject(projectId, repoDir, stack, (line) => {
            send('building', line);
          });
        }

        const meta: ProjectMeta = {
          projectId,
          owner,
          repo,
          fullName: `${owner}/${repo}`,
          description: searchResult.description,
          language: searchResult.language,
          stars: searchResult.stars,
          installedAt: new Date().toISOString(),
          dockerImage: imageTag,
          status: 'ready',
          repoDir,
          schemaPath,
          commitSha,
          schemaSource: 'registry',
        };

        this.saveMeta(meta);
        send('complete', 'Ready to use! (community template)');
        return meta;
      }

      // Registry miss — run full pipeline
      // Decide: native or Docker?
      const knownEntry = KnownToolRegistry.lookup(projectId);
      const dockerHealth = await this.docker.checkHealth();
      const useNative = !!knownEntry && !dockerHealth.ok;

      let nativeBinary: string | undefined;
      let nativeVersion: string | undefined;

      if (useNative) {
        // Native path: install via brew/pip/npm/cargo instead of Docker
        send('installing', `Checking if ${knownEntry!.binary} is already installed…`);
        const alreadyInstalled = await this.nativeInstall.isInstalled(knownEntry!.binary, knownEntry!.verifyArgs);

        if (!alreadyInstalled.installed) {
          const pm = await this.nativeInstall.pickPackageManager(knownEntry!.install);
          if (!pm) {
            throw new Error(
              `Cannot install ${knownEntry!.binary}: no supported package manager found. ` +
              `Install Homebrew (macOS) or Docker Desktop and try again.`,
            );
          }
          send('installing', `Installing ${knownEntry!.binary} via ${pm}…`);
          const result = await this.nativeInstall.install(
            knownEntry!,
            (stream, line) => send('installing', line),
          );
          if (!result.ok) {
            throw new Error(`Installation failed: ${result.error}`);
          }
        } else {
          send('installing', `${knownEntry!.binary} already installed (${alreadyInstalled.version ?? 'ok'}) ✓`);
        }

        const verified = await this.nativeInstall.verify(knownEntry!);
        if (!verified) {
          throw new Error(`Could not verify ${knownEntry!.binary} after install. Please check your installation.`);
        }
        nativeBinary = knownEntry!.binary;
        nativeVersion = verified;
        send('installing', `${knownEntry!.binary} ${verified} ready ✓`);
      } else {
        // Step 3: Build Docker image (skip if already built)
        const imageAlreadyBuilt = await this.docker.imageExists(imageTag);
        if (imageAlreadyBuilt) {
          send('building', 'Docker image already built — reusing existing image ✓');
        } else {
          send('building', 'Building Docker image (this may take a few minutes)…');
          await this.imageBuilder.buildForProject(projectId, repoDir, stack, (line) => {
            send('building', line);
          });
        }
      }

      // Step 4: Analyze CLI
      send('analyzing', 'Analyzing CLI interface…');
      let dump;
      if (useNative && nativeBinary) {
        const nativeAnalyzer = new NativeAnalyzer(this.scriptsDir);
        dump = await nativeAnalyzer.analyze(repoDir, nativeBinary);
      } else {
        const analyzer = new Analyzer(this.docker, this.scriptsDir);
        dump = await analyzer.analyze(repoDir, imageTag);
      }
      send('analyzing', `Found ${dump.arguments.length} arguments, ${dump.subcommands.length} subcommands`);

      // Step 5: Generate UI schema (only if LLM client available)
      let schemaPath: string | undefined;
      let status: ProjectStatus = 'no-schema';
      let schemaSource: ProjectMeta['schemaSource'];

      // For native mode, use 'native:{binary}' as the schema's dockerImage sentinel
      const schemaImageKey = useNative && nativeBinary ? `native:${nativeBinary}` : imageTag;

      if (llmClient) {
        send('generating', 'Generating interface with AI…');
        try {
          const schema = await llmClient.generateUISchema(dump, schemaImageKey);
          schemaPath = path.join(this.projectsDir, projectId, 'schema.json');
          fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
          fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2), 'utf8');
          status = 'ready';
          schemaSource = 'llm';
          send('generating', 'Interface generated!');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          send('generating', `AI generation failed: ${msg}. You can regenerate later.`);
        }
      } else {
        send('generating', 'Skipped UI generation (no API key). You can generate it later.');
      }

      // Step 6: Save project metadata
      const meta: ProjectMeta = {
        projectId,
        owner,
        repo,
        fullName: `${owner}/${repo}`,
        description: searchResult.description,
        language: searchResult.language,
        stars: searchResult.stars,
        installedAt: new Date().toISOString(),
        dockerImage: imageTag,
        status,
        repoDir,
        schemaPath,
        commitSha,
        schemaSource,
        ...(useNative && nativeBinary ? {
          executionMode: 'native' as const,
          nativeBinary,
          nativeVersion,
        } : {}),
      };

      this.saveMeta(meta);
      send('complete', 'Ready to use!');
      return meta;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      send('error', `Installation failed: ${msg}`);

      // Save failed meta so we can show the error in the library
      const failedMeta: ProjectMeta = {
        projectId,
        owner,
        repo,
        fullName: `${owner}/${repo}`,
        description: searchResult.description,
        language: searchResult.language,
        stars: searchResult.stars,
        installedAt: new Date().toISOString(),
        dockerImage: `gui-bridge-${projectId}`.toLowerCase(),
        status: 'error',
        error: msg,
        repoDir: this.cloner.getProjectDir(projectId) + '/repo',
      };
      this.saveMeta(failedMeta);
      throw err;
    }
  }

  /** Generate (or regenerate) UI schema for an already-installed project. */
  async generateSchema(
    projectId: string,
    llmClient: ILLMClient,
    onProgress: (event: InstallProgressEvent) => void,
  ): Promise<UISchema> {
    const meta = this.getMeta(projectId);
    if (!meta) throw new Error(`Project "${projectId}" not found`);

    const send = (stage: InstallProgressEvent['stage'], message: string) =>
      onProgress({ projectId, stage, message });

    send('analyzing', 'Analyzing CLI interface…');
    const analyzer = new Analyzer(this.docker, this.scriptsDir);
    const dump = await analyzer.analyze(meta.repoDir, meta.dockerImage);

    send('generating', 'Generating interface with AI…');
    const schema = await llmClient.generateUISchema(dump, meta.dockerImage);

    const schemaPath = path.join(this.projectsDir, projectId, 'schema.json');
    fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
    fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2), 'utf8');

    // Update meta
    const updatedMeta: ProjectMeta = { ...meta, status: 'ready', schemaPath, schemaSource: 'llm' };
    this.saveMeta(updatedMeta);
    send('complete', 'Interface ready!');

    return schema;
  }

  listInstalled(): ProjectMeta[] {
    if (!fs.existsSync(this.projectsDir)) return [];

    const projects: ProjectMeta[] = [];
    for (const entry of fs.readdirSync(this.projectsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const meta = this.getMeta(entry.name);
      if (meta) projects.push(meta);
    }

    return projects.sort((a, b) => b.installedAt.localeCompare(a.installedAt));
  }

  getMeta(projectId: string): ProjectMeta | null {
    const metaPath = path.join(this.projectsDir, projectId, 'meta.json');
    try {
      return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as ProjectMeta;
    } catch {
      return null;
    }
  }

  getSchema(projectId: string): UISchema | null {
    const meta = this.getMeta(projectId);
    if (!meta?.schemaPath) return null;
    try {
      const schema = JSON.parse(fs.readFileSync(meta.schemaPath, 'utf8')) as UISchema;
      // Validate that file_input steps have proper {step_id} placeholders in command templates.
      // The LLM occasionally forgets the curly braces (e.g. writes /input/step_id instead of
      // /input/{step_id}), making input file substitution silently fail at runtime.
      if (!this.isSchemaValid(schema)) {
        // Invalidate so the user is prompted to regenerate
        fs.unlinkSync(meta.schemaPath);
        this.saveMeta({ ...meta, status: 'no-schema', schemaPath: undefined });
        return null;
      }
      return schema;
    } catch {
      return null;
    }
  }

  /** Returns false if any non-multiple file_input step lacks a {step_id} in any workflow command. */
  private isSchemaValid(schema: UISchema): boolean {
    for (const workflow of schema.workflows) {
      const cmd = workflow.execute?.command ?? '';
      for (const step of workflow.steps) {
        if (step.type === 'file_input' && !step.multiple) {
          if (!cmd.includes(`{${step.id}}`)) return false;
        }
      }
    }
    return true;
  }

  async uninstall(projectId: string): Promise<void> {
    const meta = this.getMeta(projectId);
    if (meta?.dockerImage) {
      await this.docker.removeImage(meta.dockerImage);
    }

    const projectDir = path.join(this.projectsDir, projectId);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  }

  openFolder(projectId: string): string | null {
    const meta = this.getMeta(projectId);
    return meta ? path.join(this.projectsDir, projectId) : null;
  }

  /** Check whether the upstream repo has new commits since the last install. */
  async checkForUpdates(projectId: string): Promise<{ hasUpdate: boolean; behindBy: number }> {
    const meta = this.getMeta(projectId);
    if (!meta?.repoDir) return { hasUpdate: false, behindBy: 0 };

    const execAsync = promisify(exec);
    try {
      await execAsync('git fetch origin --quiet', { cwd: meta.repoDir });
      const { stdout } = await execAsync('git rev-list HEAD..origin/HEAD --count', { cwd: meta.repoDir });
      const behindBy = parseInt(stdout.trim(), 10) || 0;
      return { hasUpdate: behindBy > 0, behindBy };
    } catch {
      return { hasUpdate: false, behindBy: 0 };
    }
  }

  /** Pull latest commits, rebuild Docker image, regenerate schema. */
  async applyUpdate(
    projectId: string,
    llmClient: ILLMClient,
    onProgress: (event: InstallProgressEvent) => void,
  ): Promise<UISchema> {
    const meta = this.getMeta(projectId);
    if (!meta) throw new Error(`Project "${projectId}" not found`);

    const send = (stage: InstallProgressEvent['stage'], message: string) =>
      onProgress({ projectId, stage, message });

    const execAsync = promisify(exec);

    send('cloning', 'Pulling latest changes…');
    await execAsync('git pull origin --ff-only', { cwd: meta.repoDir });

    send('building', 'Rebuilding Docker image…');
    await this.docker.removeImage(meta.dockerImage).catch(() => {});
    await this.imageBuilder.buildForProject(projectId, meta.repoDir, StackDetector.detect(meta.repoDir), (line) => {
      send('building', line);
    });

    send('analyzing', 'Re-analyzing CLI interface…');
    const analyzer = new Analyzer(this.docker, this.scriptsDir);
    const dump = await analyzer.analyze(meta.repoDir, meta.dockerImage);

    send('generating', 'Regenerating interface with AI…');
    const schema = await llmClient.generateUISchema(dump, meta.dockerImage);

    const schemaPath = path.join(this.projectsDir, projectId, 'schema.json');
    fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
    fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2), 'utf8');

    const updatedMeta: ProjectMeta = {
      ...meta,
      status: 'ready',
      schemaPath,
      schemaSource: 'llm',
      installedAt: new Date().toISOString(),
    };
    this.saveMeta(updatedMeta);
    send('complete', 'Updated!');

    return schema;
  }

  private saveMeta(meta: ProjectMeta): void {
    const dir = path.join(this.projectsDir, meta.projectId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  }
}
