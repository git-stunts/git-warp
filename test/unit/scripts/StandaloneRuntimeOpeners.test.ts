/**
 * Standalone runtime openers must supply every port themselves.
 *
 * The global Vitest setup installs the default runtime ports, which hides an
 * opener that forgets one. Each witness here resets the module registry, so
 * no resolver is installed, and then opens through the real opener.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Plumbing from '@git-stunts/plumbing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const roots: string[] = [];

async function freshDirectory(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function initRepository(prefix: string): Promise<string> {
  const repo = await freshDirectory(prefix);
  const plumbing = await Plumbing.createDefault({ cwd: repo });
  await plumbing.execute({ args: ['init', '-q'] });
  await plumbing.execute({ args: ['config', 'user.name', 'opener witness'] });
  await plumbing.execute({ args: ['config', 'user.email', 'opener@example.invalid'] });
  return repo;
}

/** Proves the current module registry has no installed random resolver. */
async function expectNoRandomResolver(): Promise<void> {
  const resolvers = await import('../../../src/domain/warp/RuntimeHostPortResolvers.ts');
  await expect(resolvers.resolveConfiguredRandom(undefined)).rejects.toMatchObject({ code: 'E_RANDOM_REQUIRED' });
}

/** A packed-artifact directory whose dist modules are the repository sources. */
async function sourcePackage(): Promise<string> {
  const packageDir = await freshDirectory('packed-opener-');
  const modules: ReadonlyArray<readonly [string, string]> = [
    ['index.js', 'index.ts'],
    ['src/application/RuntimeStorageAccess.js', 'src/application/RuntimeStorageAccess.ts'],
    ['src/application/RuntimeHostNodeDefaults.js', 'src/application/RuntimeHostNodeDefaults.ts'],
    ['src/domain/warp/RuntimeHostProduct.js', 'src/domain/warp/RuntimeHostProduct.ts'],
  ];
  for (const [published, source] of modules) {
    const path = join(packageDir, 'dist', published);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, `export * from '${pathToFileURL(join(REPO_ROOT, source)).href}';\n`);
  }
  return packageDir;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe('standalone runtime openers without installed resolvers', () => {
  it('Runtime.open writes through openWarp and the write composition', async () => {
    const repo = await initRepository('runtime-opener-');
    await expectNoRandomResolver();
    const { Runtime } = await import('../../../index.ts');
    const { intent } = await import('../../../advanced.ts');

    const runtime = await Runtime.open({ at: repo, writer: 'alice' });
    try {
      const receipt = await (await runtime.lane('events')).write([intent.node.add({ subject: 'n' })]);
      expect(receipt.outcome.kind).toBe('derived');
    } finally {
      await runtime.close();
    }
  });

  it('PackedArtifactBoundaryAdapter.removal opens the packed runtime', async () => {
    const repo = await initRepository('packed-removal-');
    const packageDir = await sourcePackage();
    await expectNoRandomResolver();
    const { Runtime } = await import('../../../index.ts');
    const { intent } = await import('../../../advanced.ts');
    const writes: ReadonlyArray<readonly [string, ReturnType<typeof intent.node.add>]> = [
      ['alice', intent.node.add({ subject: 'n' })],
      ['remover', intent.node.remove({ subject: 'n' })],
    ];
    for (const [writer, write] of writes) {
      const runtime = await Runtime.open({ at: repo, writer });
      try {
        await (await runtime.lane('events')).write([write]);
      } finally {
        await runtime.close();
      }
    }
    const { default: PackedArtifactBoundaryAdapter } = await import(
      '../../../src/infrastructure/adapters/PackedArtifactBoundaryAdapter.ts'
    );

    await expect(new PackedArtifactBoundaryAdapter().removal({
      packageDir, repo, writer: 'remover', expectedDots: ['alice:1'],
    })).resolves.toBeUndefined();
    await expect(new PackedArtifactBoundaryAdapter().removal({
      packageDir, repo, writer: 'remover', expectedDots: ['alice:2'],
    })).rejects.toMatchObject({ code: 'E_PACKED_REMOVAL_DOTS' });
  });

  it('openPerformanceRuntime opens its runtime host', async () => {
    const repo = await freshDirectory('performance-opener-');
    await expectNoRandomResolver();
    const { openPerformanceRuntime } = await import('../../../scripts/performance/PerformanceRuntime.ts');

    const opened = await openPerformanceRuntime(repo);
    try {
      expect(opened.runtime._random.randomBytes(4)).toHaveLength(4);
    } finally {
      await opened.close();
    }
  });

  it('openScratchGraph opens the v18-to-v19 scratch graph', async () => {
    const repo = await initRepository('scratch-opener-');
    await expectNoRandomResolver();
    const { openScratchGraph } = await import('../../../scripts/v18-to-v19/V18MigrationScratchGraph.ts');

    const scratch = await openScratchGraph(repo, 'events', 'migrator');
    try {
      expect(scratch.graph.writerId).toBe('migrator');
    } finally {
      await scratch.close();
    }
  });
});
