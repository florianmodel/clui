import { describe, expect, it } from 'vitest';
import {
  collectInputBindings,
  resolveExecution,
  type Workflow,
} from '@gui-bridge/shared';

describe('command-builder execution resolution', () => {
  it('maps single-file inputs to step-scoped paths without basename collisions', () => {
    const workflow: Workflow = {
      id: 'overlay-video',
      name: 'Overlay Video',
      description: 'Test workflow',
      steps: [
        { id: 'input_video', label: 'Input Video', type: 'file_input', required: true },
        { id: 'overlay_image', label: 'Overlay', type: 'file_input', required: true },
      ],
      execute: {
        executable: 'ffmpeg',
        args: ['-i', '/input/input_video/{input_video}', '-i', '/input/overlay_image/{overlay_image}'],
        outputDir: '/output',
      },
    };

    const resolved = resolveExecution(workflow, {
      input_video: '/tmp/videos/clip.mp4',
      overlay_image: '/tmp/images/clip.mp4',
    });

    expect(resolved.mode).toBe('argv');
    expect(resolved.args).toEqual([
      '-i',
      '/input/input_video/clip.mp4',
      '-i',
      '/input/overlay_image/clip.mp4',
    ]);
  });

  it('resolves multi-file inputs as a mounted directory', () => {
    const workflow: Workflow = {
      id: 'batch-pdf',
      name: 'Batch PDF',
      description: 'Batch workflow',
      steps: [
        { id: 'input_files', label: 'Input Files', type: 'file_input', required: true, multiple: true },
      ],
      execute: {
        shellScript: 'for f in /input/input_files/*.pdf; do tool "$f"; done',
        outputDir: '/output',
      },
    };

    const bindings = collectInputBindings(workflow, {
      input_files: ['/tmp/A One.pdf', '/tmp/B Two.pdf'],
    });

    expect(bindings).toHaveLength(1);
    expect(bindings[0]).toMatchObject({
      stepId: 'input_files',
      containerDir: '/input/input_files',
      containerValue: '/input/input_files',
      multiple: true,
    });
  });

  it('resolves directory inputs to the mounted step directory', () => {
    const workflow: Workflow = {
      id: 'scan-dir',
      name: 'Scan Directory',
      description: 'Directory workflow',
      steps: [
        { id: 'source_dir', label: 'Source', type: 'directory_input', required: true },
      ],
      execute: {
        executable: 'tool',
        args: ['--source', '/input/source_dir'],
        outputDir: '/output',
      },
    };

    const bindings = collectInputBindings(workflow, {
      source_dir: '/Users/flo/Documents/Input Folder',
    });

    expect(bindings).toHaveLength(1);
    expect(bindings[0]).toMatchObject({
      stepId: 'source_dir',
      containerDir: '/input/source_dir',
      containerValue: '/input/source_dir',
    });
  });

  it('normalizes legacy command templates into argv execution', () => {
    const workflow: Workflow = {
      id: 'legacy',
      name: 'Legacy',
      description: 'Legacy workflow',
      steps: [
        { id: 'input_file', label: 'Input', type: 'file_input', required: true },
        { id: 'quality', label: 'Quality', type: 'number', required: false },
      ],
      execute: {
        command: 'ffmpeg -i /input/input_file/{input_file} -q {quality}',
        outputDir: '/output',
      },
    };

    const resolved = resolveExecution(workflow, {
      input_file: '/tmp/My Video.mov',
      quality: 23,
    });

    expect(resolved.mode).toBe('argv');
    expect(resolved.executable).toBe('ffmpeg');
    expect(resolved.args).toEqual(['-i', '/input/input_file/My Video.mov', '-q', '23']);
  });

  it('keeps explicit loop workflows in shell mode', () => {
    const workflow: Workflow = {
      id: 'shell',
      name: 'Shell',
      description: 'Shell workflow',
      steps: [
        { id: 'input_files', label: 'Input Files', type: 'file_input', required: true, multiple: true },
      ],
      execute: {
        command: 'for f in /input/input_files/*.pdf; do tool "$f"; done',
        outputDir: '/output',
      },
    };

    const resolved = resolveExecution(workflow, {
      input_files: ['/tmp/a.pdf'],
    });

    expect(resolved.mode).toBe('shell');
    expect(resolved.shellScript).toContain('/input/input_files/*.pdf');
  });
});
