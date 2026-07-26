import type Runtime from '../application/Runtime.ts';
import WarpError from '../domain/errors/WarpError.ts';

export type RuntimeHarnessOptions = Readonly<{
  readonly writer: string;
}>;

export type RuntimeHarnessHost = Readonly<{
  readonly createRepository: () => Promise<string>;
  readonly openRuntime: (
    options: RuntimeHarnessOptions & Readonly<{ at: string }>
  ) => Promise<Runtime>;
  readonly removeRepository: (at: string) => Promise<void>;
}>;

export type RuntimeHarness = Readonly<{
  readonly at: string;
  readonly runtime: Runtime;
  readonly close: () => Promise<void>;
}>;

/**
 * Creates an isolated real-Git Runtime and removes it when closed.
 *
 * The harness writes only inside the temporary repository it creates.
 */
export async function createRuntimeHarnessWithHost(
  options: RuntimeHarnessOptions,
  host: RuntimeHarnessHost
): Promise<RuntimeHarness> {
  const { writer } = requireRuntimeHarnessOptions(options);
  const capabilities = requireRuntimeHarnessHost(host);
  const at = await capabilities.createRepository();
  try {
    const runtime = await capabilities.openRuntime({ at, writer });
    let closePromise: Promise<void> | undefined;
    return Object.freeze({
      at,
      runtime,
      close: (): Promise<void> => {
        if (closePromise !== undefined) {
          return closePromise;
        }
        const attempt = closeRuntimeHarness(runtime, at, capabilities);
        closePromise = attempt.catch((error) => {
          closePromise = undefined;
          throw error;
        });
        return closePromise;
      },
    });
  } catch (error) {
    await capabilities.removeRepository(at);
    throw error;
  }
}

function requireRuntimeHarnessOptions(options: RuntimeHarnessOptions): RuntimeHarnessOptions {
  if (options === null || options === undefined) {
    throw new WarpError('Runtime harness options are required', 'E_RUNTIME_HARNESS_OPTIONS');
  }
  return options;
}

function requireRuntimeHarnessHost(host: RuntimeHarnessHost): RuntimeHarnessHost {
  if (host === null || host === undefined) {
    throw new WarpError('Runtime harness host is required', 'E_RUNTIME_HARNESS_HOST');
  }
  const capabilities = [host.createRepository, host.openRuntime, host.removeRepository];
  if (!capabilities.every((capability) => typeof capability === 'function')) {
    throw new WarpError('Runtime harness host is invalid', 'E_RUNTIME_HARNESS_HOST');
  }
  return host;
}

async function closeRuntimeHarness(
  runtime: Runtime,
  at: string,
  host: RuntimeHarnessHost
): Promise<void> {
  try {
    await runtime.close();
  } finally {
    await host.removeRepository(at);
  }
}
