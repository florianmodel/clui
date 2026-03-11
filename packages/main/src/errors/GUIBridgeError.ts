export type ErrorCategory =
  | 'docker'
  | 'network'
  | 'github'
  | 'build'
  | 'analysis'
  | 'execution'
  | 'filesystem'
  | 'api_key'
  | 'unknown';

export class GUIBridgeError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
    public readonly suggestion?: string,
    public readonly recoverable: boolean = true,
    public readonly category: ErrorCategory = 'unknown',
  ) {
    super(message);
    this.name = 'GUIBridgeError';
  }
}

export class DockerNotRunningError extends GUIBridgeError {
  constructor() {
    super(
      'Docker daemon not responding',
      "Docker Desktop isn't running",
      'Open Docker Desktop and wait for it to start, then try again.',
      true,
      'docker',
    );
  }
}

export class DockerBuildError extends GUIBridgeError {
  constructor(projectName: string, stderr: string) {
    super(
      `Docker build failed: ${stderr}`,
      `Failed to build ${projectName}`,
      simplifyDockerError(stderr),
      true,
      'build',
    );
  }
}

export class NetworkError extends GUIBridgeError {
  constructor(action: string) {
    super(
      `Network error during ${action}`,
      'No internet connection',
      'Check your internet connection and try again. Installed projects still work offline.',
      true,
      'network',
    );
  }
}

export class APIKeyError extends GUIBridgeError {
  constructor(detail: string) {
    super(
      `API key error: ${detail}`,
      "There's an issue with your API key",
      'Go to Settings to update your Anthropic API key. You can get one at console.anthropic.com.',
      true,
      'api_key',
    );
  }
}

export class ExecutionError extends GUIBridgeError {
  constructor(command: string, exitCode: number, stderr: string) {
    const simplified = simplifyExecutionError(command, exitCode, stderr);
    super(
      `Command failed (exit ${exitCode}): ${stderr}`,
      simplified.message,
      simplified.suggestion,
      true,
      'execution',
    );
  }
}

function simplifyDockerError(stderr: string): string {
  if (stderr.includes('No such file or directory'))
    return 'A required file was missing during the build. The project might need additional setup.';
  if (stderr.includes('Could not resolve host'))
    return 'The build needs internet access to download dependencies. Check your connection.';
  if (stderr.includes('No space left on device'))
    return 'Your disk is full. Free up some space and try again.';
  if (stderr.includes('permission denied'))
    return 'Docker needs permission to access the files. Try restarting Docker Desktop.';
  return `Try uninstalling and reinstalling the project. Error: ${stderr.slice(0, 150)}`;
}

function simplifyExecutionError(
  command: string,
  exitCode: number,
  stderr: string,
): { message: string; suggestion: string } {
  if (command.includes('ffmpeg')) {
    if (stderr.includes('No such file or directory'))
      return { message: "The input file couldn't be found", suggestion: 'Make sure you selected a valid file.' };
    if (stderr.includes('Invalid data found'))
      return { message: "The file format isn't supported", suggestion: 'Try a different file or check the format.' };
    if (stderr.includes('already exists'))
      return { message: 'The output file already exists', suggestion: 'Choose a different output name or delete the existing file.' };
  }
  return {
    message: `The command failed with exit code ${exitCode}`,
    suggestion: 'Check the logs for details. You may need to adjust your settings.',
  };
}
