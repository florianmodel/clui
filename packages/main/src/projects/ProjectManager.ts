import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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
import type { ILLMClient } from '../analyzer/LLMClient.js';

export class ProjectManager {
  private projectsDir: string;
  private cloner: ProjectCloner;
  private imageBuilder: ImageBuilder;
  private docker: DockerManager;

  constructor(docker: DockerManager, private scriptsDir: string) {
    this.docker = docker;
    this.projectsDir = path.join(os.homedir(), '.gui-bridge', 'projects');
    this.cloner = new ProjectCloner();
    this.imageBuilder = new ImageBuilder();
  }

  /**
   * Full installation pipeline:
   * clone → detect → build image → analyze CLI → generate UI schema.
   * Emits progress events via onProgress callback.
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
      const repoDir = await this.cloner.clone(owner, repo, (msg) => send('cloning', msg));

      // Step 2: Detect stack
      send('detecting', 'Detecting project type…');
      const stack = StackDetector.detect(repoDir);
      send('detecting', `Detected: ${stack.language}${stack.framework && stack.framework !== 'unknown' ? ` + ${stack.framework}` : ''}`);

      // Step 3: Build Docker image
      send('building', 'Building Docker image (this may take a few minutes)…');
      await this.imageBuilder.buildForProject(projectId, repoDir, stack, (line) => {
        send('building', line);
      });

      // Step 4: Analyze CLI
      send('analyzing', 'Analyzing CLI interface…');
      const analyzer = new Analyzer(this.docker, this.scriptsDir);
      const dump = await analyzer.analyze(repoDir, imageTag);
      send('analyzing', `Found ${dump.arguments.length} arguments, ${dump.subcommands.length} subcommands`);

      // Step 5: Generate UI schema (only if LLM client available)
      let schemaPath: string | undefined;
      let status: ProjectStatus = 'no-schema';

      if (llmClient) {
        send('generating', 'Generating interface with AI…');
        try {
          const schema = await llmClient.generateUISchema(dump, imageTag);
          schemaPath = path.join(this.projectsDir, projectId, 'schema.json');
          fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
          fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2), 'utf8');
          status = 'ready';
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
    const updatedMeta: ProjectMeta = { ...meta, status: 'ready', schemaPath };
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
      return JSON.parse(fs.readFileSync(meta.schemaPath, 'utf8')) as UISchema;
    } catch {
      return null;
    }
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

  private saveMeta(meta: ProjectMeta): void {
    const dir = path.join(this.projectsDir, meta.projectId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
  }
}
