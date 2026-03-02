import type { ArgumentInfo, ArgumentType, SubcommandInfo } from '@gui-bridge/shared';
import type { DockerManager } from '../../docker/DockerManager.js';

interface ClickJsonParam {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
  help?: string;
  is_flag?: boolean;
  multiple?: boolean;
  choices?: string[];
  nargs?: number;
  param_type?: 'option' | 'argument';
}

interface ClickJsonCommand {
  name: string;
  help?: string;
  params?: ClickJsonParam[];
  commands?: ClickJsonCommand[];
}

interface ClickJsonOutput {
  commands?: ClickJsonCommand[];
  params?: ClickJsonParam[];
  help?: string;
  error?: string;
}

/**
 * Runs `python /analyzer/introspect_click.py <entrypoint>` (or introspect_typer.py
 * when framework is 'typer') in the container and parses the JSON output.
 */
export class ClickIntrospector {
  constructor(
    private docker: DockerManager,
    private scriptsDir: string,
    private framework: 'click' | 'typer' = 'click',
  ) {}

  async introspect(
    image: string,
    entrypoint: string,
  ): Promise<{ arguments: ArgumentInfo[]; subcommands: SubcommandInfo[]; error?: string }> {
    const script =
      this.framework === 'typer'
        ? '/analyzer/introspect_typer.py'
        : '/analyzer/introspect_click.py';

    const result = await this.docker.runCommand(
      image,
      ['python', script, entrypoint],
      {
        extraVolumes: [{ hostPath: this.scriptsDir, containerPath: '/analyzer', readOnly: true }],
        timeout: 30_000,
      },
      () => {},
    );

    if (result.exitCode !== 0) {
      return {
        arguments: [],
        subcommands: [],
        error: `click introspection failed (exit ${result.exitCode}): ${result.stderr.slice(0, 500)}`,
      };
    }

    try {
      const json: ClickJsonOutput = JSON.parse(result.stdout.trim());
      if (json.error) {
        return { arguments: [], subcommands: [], error: json.error };
      }

      const topArgs = (json.params ?? []).map(ClickIntrospector.mapParam);
      const subcommands = (json.commands ?? []).map(ClickIntrospector.mapCommand);

      return { arguments: topArgs, subcommands };
    } catch (err) {
      return {
        arguments: [],
        subcommands: [],
        error: `Failed to parse click JSON: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private static mapParam(p: ClickJsonParam): ArgumentInfo {
    const isFlag = p.is_flag ?? false;
    const type: ArgumentType = isFlag ? 'bool' : ClickIntrospector.mapType(p.type, p.choices);
    const positional = p.param_type === 'argument';

    return {
      name: positional ? p.name : `--${p.name.replace(/_/g, '-')}`,
      aliases: [],
      positional,
      type,
      required: p.required,
      default: p.default != null ? String(p.default) : undefined,
      choices: p.choices && p.choices.length > 0 ? p.choices : undefined,
      description: p.help,
      isFlag,
      multiple: p.multiple ?? false,
    };
  }

  private static mapCommand(cmd: ClickJsonCommand): SubcommandInfo {
    return {
      name: cmd.name,
      description: cmd.help,
      arguments: (cmd.params ?? []).map(ClickIntrospector.mapParam),
      subcommands: (cmd.commands ?? []).map(ClickIntrospector.mapCommand),
    };
  }

  private static mapType(clickType: string, choices?: string[]): ArgumentType {
    if (choices && choices.length > 0) return 'choice';
    switch (clickType.toLowerCase()) {
      case 'int':
      case 'integer': return 'int';
      case 'float': return 'float';
      case 'path':
      case 'file': return 'file';
      case 'bool':
      case 'boolean': return 'bool';
      case 'choice': return 'choice';
      default: return 'string';
    }
  }
}
