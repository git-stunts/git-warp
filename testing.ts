/**
 * Explicit Runtime testing support.
 *
 * The harness uses a disposable real Git repository so consumer tests exercise
 * the same production composition boundary as `Runtime.open()`.
 */

import { createDefaultRuntimeHarnessHost } from './src/infrastructure/adapters/RuntimeHarnessHostAdapter.ts';
import {
  createRuntimeHarnessWithHost,
  type RuntimeHarness,
  type RuntimeHarnessOptions,
} from './src/testing/RuntimeHarness.ts';

const DEFAULT_RUNTIME_HARNESS_HOST = createDefaultRuntimeHarnessHost();

export async function createRuntimeHarness(
  options: RuntimeHarnessOptions
): Promise<RuntimeHarness> {
  return await createRuntimeHarnessWithHost(options, DEFAULT_RUNTIME_HARNESS_HOST);
}

export { createRuntimeHarnessWithHost };
export type {
  RuntimeHarness,
  RuntimeHarnessHost,
  RuntimeHarnessOptions,
} from './src/testing/RuntimeHarness.ts';
