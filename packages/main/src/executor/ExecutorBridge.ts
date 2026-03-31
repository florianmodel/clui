/**
 * Re-exports the shared execution helpers so all existing
 * main-process imports continue to work without changes.
 *
 * The actual logic lives in packages/shared/src/command-builder.ts so the
 * renderer can import the same functions and the command preview always matches
 * what is actually executed.
 */
export {
  buildCommand,
  collectInputBindings,
  collectInputFiles,
  describeExecution,
  resolveExecution,
} from '@gui-bridge/shared';
