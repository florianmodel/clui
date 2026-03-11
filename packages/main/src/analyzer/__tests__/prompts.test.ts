import { describe, it, expect } from 'vitest';
import { buildFixCommandPrompt } from '../prompts/fix-command.js';
import { buildRefinementPrompt } from '../prompts/generate-schema.js';
import type { Workflow, UISchema, CapabilityDump } from '@gui-bridge/shared';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const workflow: Workflow = {
  id: 'convert-video',
  name: 'Convert Video',
  description: 'Convert a video file',
  steps: [
    { id: 'input_file', label: 'Input File', type: 'file_input', required: true },
    { id: 'output_format', label: 'Output Format', type: 'dropdown', required: true, options: [] },
    { id: 'quality', label: 'Quality', type: 'number', required: false },
  ],
  execute: {
    command: 'ffmpeg -i /input/{input_file} -q {quality} /output/out.{output_format}',
    outputDir: '/output',
  },
};

const minimalSchema: UISchema = {
  projectId: 'ffmpeg',
  projectName: 'FFmpeg',
  description: 'Video converter',
  version: '1.0.0',
  dockerImage: 'gui-bridge-test--ffmpeg',
  workflows: [workflow],
};

const minimalDump: CapabilityDump = {
  analyzedAt: '2024-01-01T00:00:00Z',
  repoDir: '/tmp/ffmpeg',
  dockerImage: 'gui-bridge-test--ffmpeg',
  stack: { language: 'unknown', framework: 'unknown', keyFiles: [], entrypointConfidence: 0 },
  readme: { description: 'A video tool', usageExamples: [], installInstructions: '', fullContent: '' },
  arguments: [],
  subcommands: [],
  helpText: '',
  introspectionMethod: 'help-parser',
  warnings: [],
};

// ── buildFixCommandPrompt ──────────────────────────────────────────────────────

describe('buildFixCommandPrompt', () => {
  it('includes the workflow name', () => {
    const prompt = buildFixCommandPrompt(workflow, 'ffmpeg -i /input/file.mp4 /output/out.mp4', 'error: codec not found');
    expect(prompt).toContain('Convert Video');
  });

  it('includes the original command template', () => {
    const prompt = buildFixCommandPrompt(workflow, 'ffmpeg -i /input/file.mp4 /output/out.mp4', 'some error');
    expect(prompt).toContain(workflow.execute.command);
  });

  it('includes all step IDs as available placeholders', () => {
    const prompt = buildFixCommandPrompt(workflow, 'cmd', 'error');
    expect(prompt).toContain('input_file');
    expect(prompt).toContain('output_format');
    expect(prompt).toContain('quality');
  });

  it('includes the failed command that was run', () => {
    const failedCmd = 'ffmpeg -i /input/file.mp4 -badflag /output/out.mp4';
    const prompt = buildFixCommandPrompt(workflow, failedCmd, 'error');
    expect(prompt).toContain(failedCmd);
  });

  it('includes the error output', () => {
    const error = 'Unknown encoder: h264\nConversion failed!';
    const prompt = buildFixCommandPrompt(workflow, 'cmd', error);
    expect(prompt).toContain(error);
  });

  it('trims error output to the last 1500 characters', () => {
    const longError = 'x'.repeat(2000);
    const prompt = buildFixCommandPrompt(workflow, 'cmd', longError);
    // Should contain the tail (last 1500 chars), not the full 2000
    expect(prompt).toContain('x'.repeat(1500));
    // Should not contain more than 1500 consecutive x's
    expect(prompt).not.toContain('x'.repeat(1501));
  });

  it('requests JSON output with template and explanation fields', () => {
    const prompt = buildFixCommandPrompt(workflow, 'cmd', 'error');
    expect(prompt).toContain('"template"');
    expect(prompt).toContain('"explanation"');
  });

  it('instructs to keep /input/ and /output/ path conventions', () => {
    const prompt = buildFixCommandPrompt(workflow, 'cmd', 'error');
    expect(prompt).toContain('/input/');
    expect(prompt).toContain('/output/');
  });
});

// ── buildRefinementPrompt ──────────────────────────────────────────────────────

describe('buildRefinementPrompt', () => {
  it('includes the tool name', () => {
    const prompt = buildRefinementPrompt(minimalSchema, minimalDump);
    expect(prompt).toContain('FFmpeg');
  });

  it('includes the current schema as JSON', () => {
    const prompt = buildRefinementPrompt(minimalSchema, minimalDump);
    expect(prompt).toContain('"projectId"');
    expect(prompt).toContain('"convert-video"');
  });

  it('includes user feedback when provided', () => {
    const feedback = 'Let me select multiple files at once';
    const prompt = buildRefinementPrompt(minimalSchema, minimalDump, feedback);
    expect(prompt).toContain(feedback);
  });

  it('uses a generic improve message when no feedback is given', () => {
    const prompt = buildRefinementPrompt(minimalSchema, minimalDump);
    expect(prompt).toContain('review and improve');
  });

  it('includes stack language and framework from the dump', () => {
    const prompt = buildRefinementPrompt(minimalSchema, minimalDump);
    expect(prompt).toContain('unknown');
  });

  it('includes readme description when present', () => {
    const prompt = buildRefinementPrompt(minimalSchema, minimalDump);
    expect(prompt).toContain('A video tool');
  });

  it('instructs to output only JSON', () => {
    const prompt = buildRefinementPrompt(minimalSchema, minimalDump);
    expect(prompt).toContain('Output ONLY');
  });
});
