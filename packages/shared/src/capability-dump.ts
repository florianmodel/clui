// CapabilityDump — raw output of Chunk 3 static CLI introspection.
// This is the input contract for Chunk 4's LLM schema generation.

export type ArgumentType =
  | 'string'
  | 'int'
  | 'float'
  | 'bool'
  | 'file'
  | 'directory'
  | 'choice'
  | 'unknown';

export interface ArgumentInfo {
  /** Primary flag name (e.g. '--output', '-o', 'INPUT_FILE' for positional) */
  name: string;
  /** All aliases for this argument (e.g. ['-o', '--output']) */
  aliases: string[];
  /** Whether this is a positional argument (no leading --) */
  positional: boolean;
  /** Inferred type */
  type: ArgumentType;
  /** Whether this argument is required */
  required: boolean;
  /** Default value as a string, if known */
  default?: string;
  /** Allowed choices, if this is an enum/choice argument */
  choices?: string[];
  /** Human-readable description from --help */
  description?: string;
  /** Whether this is a flag (store_true/store_false in argparse) */
  isFlag: boolean;
  /** Whether multiple values are accepted (nargs='*' or '+') */
  multiple: boolean;
  /** Metavar hint from --help (e.g. 'FILE', 'FORMAT') */
  metavar?: string;
}

export interface SubcommandInfo {
  name: string;
  description?: string;
  arguments: ArgumentInfo[];
  subcommands?: SubcommandInfo[];
}

export interface CapabilityDump {
  /** ISO timestamp when the analysis was performed */
  analyzedAt: string;

  /** Absolute host path to the repo directory that was analyzed */
  repoDir: string;

  /** Docker image tag used to run the tool */
  dockerImage: string;

  /** Detected project info */
  stack: {
    language: 'python' | 'node' | 'rust' | 'go' | 'unknown';
    framework: 'argparse' | 'click' | 'typer' | 'unknown';
    entrypoint?: string;
    entrypointConfidence: number;   // 0-1
    keyFiles: string[];
    analyzerCommand?: string[];
  };

  /** README content, truncated */
  readme: {
    description?: string;
    usageExamples: string[];
    installInstructions?: string;
    fullContent: string;           // truncated to 4000 chars
  };

  /** Top-level arguments (from --help or introspection) */
  arguments: ArgumentInfo[];

  /** Subcommands, if the CLI has them */
  subcommands: SubcommandInfo[];

  /** Raw --help output from the container */
  helpText: string;

  /** How the arguments were extracted */
  introspectionMethod: 'argparse' | 'click' | 'typer' | 'help-parser' | 'none';

  /** Any warnings or errors during analysis */
  warnings: string[];
}
