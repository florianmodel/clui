/**
 * Build a prompt asking the LLM to classify the root cause of a CLI failure.
 * Returns a small JSON object — meant to be called with max_tokens ~256.
 */
export function buildDiagnosePrompt(errorOutput: string, builtCommand: string): string {
  const trimmed = errorOutput.slice(-3000);

  return `Classify the root cause of this CLI failure. Respond with ONLY this JSON (no markdown, no extra text):

{"errorClass":"<class>","shortReason":"<reason>","relevantLine":"<line or null>"}

errorClass must be one of:
- "file-not-found"      — input file or path does not exist
- "wrong-output-path"   — output path is a directory, not a file (IsADirectoryError or similar)
- "bad-argument"        — wrong flag, unsupported option, or invalid value
- "permission-denied"   — permission error on file or directory
- "tool-crashed"        — segfault, uncaught exception, OOM, or unexpected exit
- "timeout"             — process killed due to timeout
- "multi-file-wrong"    — command used /input/{placeholder} as a path instead of iterating /input/
- "unknown"             — none of the above match clearly

shortReason: one sentence, 20 words or fewer, plain English.
relevantLine: copy the single most diagnostic line from the error output, or null if none.

## Command that ran:
${builtCommand}

## Error output:
${trimmed}`;
}
