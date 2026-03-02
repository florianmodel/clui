import type { ArgumentInfo, ArgumentType, SubcommandInfo } from '@gui-bridge/shared';
import type { DockerManager } from '../../docker/DockerManager.js';

interface ArgparseJsonArg {
  name: string;
  aliases?: string[];
  type?: string;
  required?: boolean;
  default?: unknown;
  choices?: unknown[];
  help?: string;
  nargs?: string | number;
  action?: string;
  metavar?: string;
}

interface ArgparseJsonOutput {
  arguments?: ArgparseJsonArg[];
  subcommands?: Array<{
    name: string;
    description?: string;
    arguments?: ArgparseJsonArg[];
  }>;
  error?: string;
}

/**
 * Runs `python /analyzer/introspect_argparse.py <entrypoint>` in the container
 * and parses the JSON output into ArgumentInfo[].
 */
export class ArgparseIntrospector {
  constructor(
    private docker: DockerManager,
    private scriptsDir: string,
  ) {}

  async introspect(
    image: string,
    entrypoint: string,
  ): Promise<{ arguments: ArgumentInfo[]; subcommands: SubcommandInfo[]; error?: string }> {
    const result = await this.docker.runCommand(
      image,
      ['python', '/analyzer/introspect_argparse.py', entrypoint],
      {
        extraVolumes: [{ hostPath: this.scriptsDir, containerPath: '/analyzer', readOnly: true }],
        timeout: 30_000,
      },
      () => {},  // suppress log output
    );

    if (result.exitCode !== 0) {
      return {
        arguments: [],
        subcommands: [],
        error: `argparse introspection failed (exit ${result.exitCode}): ${result.stderr.slice(0, 500)}`,
      };
    }

    try {
      const json: ArgparseJsonOutput = JSON.parse(result.stdout.trim());
      if (json.error) {
        return { arguments: [], subcommands: [], error: json.error };
      }
      return {
        arguments: (json.arguments ?? []).map(ArgparseIntrospector.mapArg),
        subcommands: (json.subcommands ?? []).map((sub) => ({
          name: sub.name,
          description: sub.description,
          arguments: (sub.arguments ?? []).map(ArgparseIntrospector.mapArg),
        })),
      };
    } catch (err) {
      return {
        arguments: [],
        subcommands: [],
        error: `Failed to parse argparse JSON: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private static mapArg(raw: ArgparseJsonArg): ArgumentInfo {
    const isFlag = raw.action === 'store_true' || raw.action === 'store_false';
    const type: ArgumentType = isFlag
      ? 'bool'
      : ArgparseIntrospector.mapType(raw.type, raw.choices);

    const choices = raw.choices
      ? raw.choices.map((c) => String(c)).filter(Boolean)
      : undefined;

    return {
      name: raw.name,
      aliases: raw.aliases ?? [],
      positional: !raw.name.startsWith('-'),
      type,
      required: raw.required ?? false,
      default: raw.default != null ? String(raw.default) : undefined,
      choices,
      description: raw.help,
      isFlag,
      multiple: raw.nargs === '*' || raw.nargs === '+' || raw.nargs === 'REMAINDER',
      metavar: raw.metavar,
    };
  }

  private static mapType(pyType?: string, choices?: unknown[]): ArgumentType {
    if (choices && choices.length > 0) return 'choice';
    switch (pyType) {
      case 'int': return 'int';
      case 'float': return 'float';
      case 'Path':
      case 'path': return 'file';
      case 'bool': return 'bool';
      default: return 'string';
    }
  }
}
