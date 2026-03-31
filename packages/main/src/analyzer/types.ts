// Internal types used within the analyzer module only.
// Not exported to @gui-bridge/shared.

export interface StackInfo {
  language: 'python' | 'node' | 'rust' | 'go' | 'unknown';
  framework: 'argparse' | 'click' | 'typer' | 'unknown';
  entrypoint?: string;
  entrypointConfidence: number;  // 0-1
  keyFiles: string[];
  analyzerCommand?: string[];
}

export interface ReadmeInfo {
  description?: string;
  usageExamples: string[];
  installInstructions?: string;
  fullContent: string;  // truncated to 4000 chars
}
