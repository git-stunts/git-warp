import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Runtime from '../application/Runtime.ts';
import WarpError from '../domain/errors/WarpError.ts';
import { openDefaultGitPlumbing } from '../infrastructure/adapters/GitPlumbingRuntimeAdapter.ts';

export type RuntimeHarnessOptions = Readonly<{
  readonly writer: string;
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
export async function createRuntimeHarness(
  options: RuntimeHarnessOptions,
): Promise<RuntimeHarness> {
  const { writer } = requireRuntimeHarnessOptions(options);
  const at = await mkdtemp(join(tmpdir(), 'git-warp-runtime-'));
  try {
    await initializeRepository(at);
    const runtime = await Runtime.open({ at, writer });
    let closed = false;
    return Object.freeze({
      at,
      runtime,
      close: async (): Promise<void> => {
        if (closed) {
          return;
        }
        closed = true;
        try {
          await runtime.close();
        } finally {
          await rm(at, { recursive: true, force: true });
        }
      },
    });
  } catch (error) {
    await rm(at, { recursive: true, force: true });
    throw error;
  }
}

function requireRuntimeHarnessOptions(options: RuntimeHarnessOptions): RuntimeHarnessOptions {
  if (options === null || options === undefined) {
    throw new WarpError('Runtime harness options are required', 'E_RUNTIME_HARNESS_OPTIONS');
  }
  return options;
}

async function initializeRepository(at: string): Promise<void> {
  const plumbing = await openDefaultGitPlumbing(at);
  await plumbing.execute({ args: ['init', '--quiet'] });
  await plumbing.execute({ args: ['config', 'user.name', 'git-warp test harness'] });
  await plumbing.execute({ args: ['config', 'user.email', 'git-warp-testing@invalid'] });
}
