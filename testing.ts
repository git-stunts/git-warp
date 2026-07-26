/**
 * Explicit Runtime testing support.
 *
 * The harness uses a disposable real Git repository so consumer tests exercise
 * the same production composition boundary as `Runtime.open()`.
 */

export { createRuntimeHarness } from './src/testing/RuntimeHarness.ts';
export type {
  RuntimeHarness,
  RuntimeHarnessOptions,
} from './src/testing/RuntimeHarness.ts';
