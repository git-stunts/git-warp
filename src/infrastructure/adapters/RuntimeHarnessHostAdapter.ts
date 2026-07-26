import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Runtime from '../../application/Runtime.ts';
import type { RuntimeHarnessHost } from '../../testing/RuntimeHarness.ts';
import { openDefaultGitPlumbing } from './GitPlumbingRuntimeAdapter.ts';

const RUNTIME_HARNESS_PREFIX = 'git-warp-runtime-';

export function createDefaultRuntimeHarnessHost(): RuntimeHarnessHost {
  return Object.freeze({
    createRepository,
    openRuntime: async ({ at, writer }) => await Runtime.open({ at, writer }),
    removeRepository: async (at) => await rm(at, { recursive: true, force: true }),
  });
}

async function createRepository(): Promise<string> {
  const at = await mkdtemp(join(tmpdir(), RUNTIME_HARNESS_PREFIX));
  try {
    const plumbing = await openDefaultGitPlumbing(at);
    await plumbing.execute({ args: ['init', '--quiet'] });
    await plumbing.execute({ args: ['config', 'user.name', 'git-warp test harness'] });
    await plumbing.execute({ args: ['config', 'user.email', 'git-warp-testing@invalid'] });
    return at;
  } catch (error) {
    await rm(at, { recursive: true, force: true });
    throw error;
  }
}
