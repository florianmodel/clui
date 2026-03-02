// UI Schema — the central contract between Analyzer (Chunk 3/4) and Renderer (Chunk 2).
// Defined here so both packages can reference the same types without coupling.

export type StepType =
  | 'text_input'
  | 'number'
  | 'dropdown'
  | 'radio'
  | 'checkbox'
  | 'file_input'
  | 'directory_input'
  | 'textarea'
  | 'toggle';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface ValidationRule {
  pattern?: string;  // Regex string
  message?: string;  // Human-readable error message
}

export interface Step {
  id: string;
  label: string;
  description?: string;
  guidance?: string;
  type: StepType;
  required: boolean;
  default?: string | number | boolean;
  placeholder?: string;

  // Type-specific
  options?: SelectOption[];  // dropdown, radio
  accept?: string;           // file_input (e.g. ".mp4,.avi")
  multiple?: boolean;        // file_input
  min?: number;              // number
  max?: number;              // number
  step?: number;             // number (increment)
  validation?: ValidationRule;

  // Conditional visibility
  showIf?: {
    stepId: string;
    equals: string | number | boolean;
  };
}

export interface ExecutionConfig {
  command: string;              // Template with {step_id} placeholders
  outputDir: string;            // Container path (usually /output)
  outputPattern?: string;       // Glob for expected output files
  successMessage?: string;
  estimatedDuration?: string;   // e.g. "~30 seconds per minute of video"
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  guidance?: string;
  steps: Step[];
  execute: ExecutionConfig;
}

export interface UISchema {
  projectId: string;
  projectName: string;
  description: string;
  version: string;
  icon?: string;              // emoji or icon name
  dockerImage: string;        // Docker image tag to use for execution
  dockerfilePath?: string;    // Relative path to Dockerfile for auto-build
  workflows: Workflow[];
}
