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
  // Tool-specific hints
  if (command.includes('ffmpeg')) {
    if (stderr.includes('Invalid data found'))
      return { message: "The file format isn't supported", suggestion: 'Try a different file or check the format.' };
    if (stderr.includes('already exists'))
      return { message: 'The output file already exists', suggestion: 'Choose a different output name or delete the existing file.' };
  }

  // Python / filesystem errors (order matters — check specific before general)
  if (stderr.includes('IsADirectoryError') || stderr.includes('[Errno 21] Is a directory'))
    return { message: 'Command tried to open a folder as a file', suggestion: 'Regenerate the UI from the sidebar menu to fix the command template.' };
  if (stderr.includes('NotADirectoryError') || stderr.includes('[Errno 20] Not a directory'))
    return { message: 'Command tried to list files inside a file path', suggestion: 'Regenerate the UI from the sidebar menu to fix the command template.' };
  if (stderr.includes('ModuleNotFoundError') || stderr.includes('No module named'))
    return { message: 'A required Python package is missing from the container', suggestion: 'Try uninstalling and reinstalling the project to rebuild the Docker image.' };
  if (stderr.includes('FileNotFoundError') || (stderr.includes('No such file or directory') && stderr.includes('/input/')))
    return { message: 'Input file not found in the container', suggestion: 'Make sure you selected a valid file.' };
  if (stderr.includes('JSONDecodeError') || stderr.includes('json.decoder'))
    return { message: 'Output was not valid JSON', suggestion: 'The input file may be malformed or the wrong format.' };
  if (stderr.includes('PermissionError') || (stderr.includes('Permission denied') && stderr.includes('/output/')))
    return { message: 'Cannot write to the output folder', suggestion: 'Check that the output directory is writable.' };

  // Shell / binary errors
  if (stderr.includes('command not found') || stderr.includes(': not found'))
    return { message: 'Tool binary not found in the container', suggestion: 'Try reinstalling the project to rebuild the Docker image.' };
  if (exitCode === 137 || stderr.includes('Killed'))
    return { message: 'Process was killed — likely ran out of memory', suggestion: 'Try with a smaller file or split the task into parts.' };

  // General fallback: include first meaningful stderr line so the user isn't left with just an exit code
  const firstLine = stderr.split('\n')
    .map(l => l.trim())
    .find(l => l.length > 10 && !l.startsWith('Traceback') && !l.startsWith('File "'));
  return {
    message: `Command failed with exit code ${exitCode}`,
    suggestion: firstLine ? firstLine.slice(0, 150) : 'Check the logs below for details.',
  };
}
