import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { intent } from '../../../advanced.ts';
import { GitStorage, RetainedWriteReceipt, Warp, WarpAccessDenied, WarpAccessPort, WarpAddress, WarpWriteGrant } from '../../../index.ts';
import CheckpointController from '../../../src/domain/services/controllers/CheckpointController.ts';
import { PatchDiscovery } from '../../../src/domain/services/controllers/PatchDiscovery.ts';
import CheckpointTailBasisLoader from '../../../src/domain/services/optic/CheckpointTailBasisLoader.ts';
import RuntimeHost from '../../../src/domain/RuntimeHost.ts';
import { buildWriterRef } from '../../../src/domain/utils/RefLayout.ts';

/**
 * The multi-writer no-coordination guarantees of `WarpGraph.noCoordination.test.ts`,
 * through the public Warp boundary (#1051): writers never coordinate, chains stay
 * linear, and clocks and dots stay unique, across arbitrary interleavings.
 */
const GRAPH = 'shared';
const WRITERS = ['alice', 'bob', 'carol'] as const;

class AllowAll extends WarpAccessPort {
  override authorizeWrite(): Promise<WarpWriteGrant> {
    return Promise.resolve(new WarpWriteGrant({ authority: 'test', budget: { records: 1024, bytes: 1024 * 1024, work: 1024 } }));
  }
}

const directories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map(async (path) => await rm(path, { recursive: true, force: true })));
});

function git(path: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd: path, encoding: 'utf8' }).trim();
}

async function repository(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'warp-nocoord-'));
  directories.push(path);
  git(path, ['init', '--quiet']);
  git(path, ['config', 'user.name', 'Warp test']);
  git(path, ['config', 'user.email', 'warp@example.invalid']);
  return path;
}

async function openWarp(path: string): Promise<Warp> {
  return await Warp.open(WarpAddress.of(GitStorage.at(path), GRAPH), new AllowAll());
}

function hasTrailer(path: string, sha: string, trailer: string): string {
  return git(path, ['log', '-1', `--format=%(trailers:key=${trailer},valueonly)`, sha]);
}

function chain(path: string, writer: string): string[] {
  return git(path, ['rev-list', buildWriterRef(GRAPH, writer)]).split('\n');
}

describe('No-coordination through the Warp boundary', () => {
  it('keeps every writer chain linear with unique clocks across arbitrary interleavings', { timeout: 120_000 }, async () => {
    await fc.assert(fc.asyncProperty(
      fc.array(fc.constantFrom(...WRITERS), { minLength: 3, maxLength: 12 }),
      async (order) => {
        const path = await repository();
        const warp = await openWarp(path);
        const expected = new Map<string, number>();
        for (const [index, writer] of order.entries()) {
          const receipt = await warp.as(writer).execute(intent.node.add({ subject: `node:${index}` }));
          expect(receipt).toBeInstanceOf(RetainedWriteReceipt);
          expected.set(writer, (expected.get(writer) ?? 0) + 1);
        }
        await warp.close();
        for (const [writer, count] of expected) {
          const commits = chain(path, writer);
          expect(commits).toHaveLength(count);
          expect(git(path, ['rev-list', '--count', '--merges', buildWriterRef(GRAPH, writer)])).toBe('0');
          const clocks = commits.map((sha) => Number(hasTrailer(path, sha, 'eg-lamport')));
          expect(new Set(clocks).size).toBe(count);
          expect([...clocks].sort((a, b) => b - a)).toEqual(clocks);
        }
      },
    ), { numRuns: 4 });
  });

  it('advances a clock past every folded writer, with no other writer consulted at commit', async () => {
    const path = await repository();
    const warp = await openWarp(path);
    await warp.as('alice').execute(intent.node.add({ subject: 'a' }));
    await warp.as('alice').execute(intent.node.add({ subject: 'b' }));
    await warp.as('bob').execute(intent.node.add({ subject: 'c' }));
    await warp.close();

    const [aliceTip] = chain(path, 'alice');
    const [bobTip] = chain(path, 'bob');

    expect(Number(hasTrailer(path, bobTip ?? '', 'eg-lamport'))).toBeGreaterThan(Number(hasTrailer(path, aliceTip ?? '', 'eg-lamport')));
  });
});

describe('Zero whole-state traps', () => {
  const hits: string[] = [];

  function trap(name: string): () => never {
    return () => {
      hits.push(name);
      throw new Error(`trap: a public write reached ${name}`);
    };
  }

  function installTraps(): void {
    vi.spyOn(RuntimeHost.prototype, '_materializeGraph').mockImplementation(trap('RuntimeHost._materializeGraph'));
    vi.spyOn(RuntimeHost.prototype, 'materialize').mockImplementation(trap('RuntimeHost.materialize'));
    vi.spyOn(RuntimeHost.prototype, 'materializeCoordinate').mockImplementation(trap('RuntimeHost.materializeCoordinate'));
    vi.spyOn(CheckpointController.prototype, 'createCheckpoint').mockImplementation(trap('CheckpointController.createCheckpoint'));
    vi.spyOn(CheckpointTailBasisLoader.prototype, 'load').mockImplementation(trap('CheckpointTailBasisLoader.load'));
    vi.spyOn(PatchDiscovery.prototype, 'loadPatchChainFromSha').mockImplementation(trap('PatchDiscovery.loadPatchChainFromSha'));
  }

  afterEach(() => { hits.length = 0; });

  it('drives every write intent kind without touching one', async () => {
    const path = await repository();
    installTraps();
    const warp = await openWarp(path);
    const writer = warp.as('alice');
    const staged = await writer.stage('hello', { mime: 'text/plain' });
    if (staged instanceof WarpAccessDenied) { throw new Error(staged.cause); }
    const written = [
      intent.node.add({ subject: 'a' }),
      intent.node.add({ subject: 'b' }),
      intent.edge.add({ from: 'a', to: 'b', label: 'links' }),
      intent.property.set({ subject: 'a', key: 'title', value: 'one' }),
      intent.node.attachContent({ subject: 'a', content: staged }),
      intent.node.clearContent({ subject: 'a' }),
      intent.edge.attachContent({ from: 'a', to: 'b', label: 'links', content: staged }),
      intent.edge.clearContent({ from: 'a', to: 'b', label: 'links' }),
      intent.entity.add({ subject: 'e', properties: { title: 'entity' } }),
      intent.entity.addAuto({ namespace: 'todo', properties: { title: 'auto' } }),
      intent.edge.remove({ from: 'a', to: 'b', label: 'links' }),
      intent.node.remove({ subject: 'b' }),
    ];
    for (const next of written) {
      expect(await writer.execute(next)).toBeInstanceOf(RetainedWriteReceipt);
    }
    await warp.close();

    expect(hits).toEqual([]);
  });

  it('has live traps: the whole-state path they guard does fire', async () => {
    installTraps();

    await expect(async () => await RuntimeHost.prototype.materialize.call({} as RuntimeHost)).rejects.toThrow('trap');
    expect(hits).toEqual(['RuntimeHost.materialize']);
  });
});
