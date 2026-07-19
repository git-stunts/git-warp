import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ContentAddressableStore, {
  BundleHandle as GitCasBundleHandle,
} from '@git-stunts/git-cas';
import Plumbing from '@git-stunts/plumbing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import MaterializationCoordinate from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import MaterializationRoot from '../../../../src/domain/materialization/MaterializationRoot.ts';
import MaterializationRoots from '../../../../src/domain/materialization/MaterializationRoots.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import GitCasRepositoryAdapter from '../../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import GitCasTrieStoreAdapter from '../../../../src/infrastructure/adapters/GitCasTrieStoreAdapter.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import type MaterializationStorePort from '../../../../src/ports/MaterializationStorePort.ts';

const execFileAsync = promisify(execFile);

describe('GitCasMaterializationStoreAdapter integration', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    try {
      await harness.materializations.close();
    } finally {
      try {
        await harness.cas.close();
      } finally {
        try {
          await harness.history.close();
        } finally {
          await rm(harness.path, { recursive: true, force: true });
        }
      }
    }
  });

  it('retains the materialization graph and resumes from a fresh repository adapter', async () => {
    const coordinate = new MaterializationCoordinate({
      frontier: new Map([['writer-a', 'a'.repeat(40)]]),
      ceiling: null,
    });
    const trieFixture = await createTrieRoot(harness.cas);
    const rootFixture = await createRoots(harness.cas, trieFixture);
    const retained = await harness.materializations.retain({
      coordinate,
      roots: rootFixture.roots,
      stateHash: 'state-hash',
    });

    const reopenedCas = createCas(harness.plumbing);
    const reopenedFixture = await createMaterializations(
      harness.plumbing,
      reopenedCas,
    );
    const reopened = reopenedFixture.materializations;
    try {
      const acquisition = await reopened.acquireExact(coordinate);
      if (acquisition === null) {
        throw new Error('Retained materialization was not reopened');
      }
      const resolved = acquisition.materialization;
      const nodeAliveRoot = resolved.roots.nodeAlive.handle;
      if (nodeAliveRoot === null) {
        throw new Error('Retained materialization did not expose its node root');
      }
      const reopenedTrie = new GitCasTrieStoreAdapter({ cas: reopenedCas });
      const children = await reopenedTrie.readBranch(nodeAliveRoot.toString());
      const child = children.get(0);
      if (child === undefined) {
        throw new Error('Retained trie root did not contain its leaf child');
      }
      const unreachable = await prunableOids(harness.path);

      expect(resolved.bundle.equals(retained.bundle)).toBe(true);
      expect(resolved.roots.entries().map(([name, root]) => rootSignature(name, root)))
        .toEqual(rootFixture.roots.entries().map(([name, root]) => rootSignature(name, root)));
      expect(await reopenedTrie.readLeaf(child)).toEqual(trieFixture.bytes);
      expect(unreachable).not.toContain(GitCasBundleHandle.parse(retained.bundle.toString()).oid);
      for (const oid of rootFixture.retainedOids) {
        expect(unreachable).not.toContain(oid);
      }
      expect(await harness.plumbing.execute({
        args: ['show-ref', '--verify', '--hash', 'refs/cas/caches/git-warp/materializations'],
      })).toMatch(/^[0-9a-f]{40}\n?$/u);
      await acquisition.release();
    } finally {
      try {
        await reopened.close();
      } finally {
        try {
          await reopenedCas.close();
        } finally {
          await reopenedFixture.history.close();
        }
      }
    }
  });

  it('keeps a replaced generation reachable until its runtime lease closes', async () => {
    const coordinate = workspaceCoordinate();
    const firstTrie = await createTrieRoot(harness.cas, 7);
    const firstRoots = await createRoots(harness.cas, firstTrie, 0);
    const first = await harness.materializations.retain({
      coordinate,
      roots: firstRoots.roots,
      stateHash: 'first-state-hash',
    });
    const acquisition = await harness.materializations.acquireExact(coordinate);
    if (acquisition === null) {
      throw new Error('Retained materialization could not be acquired');
    }

    const secondTrie = await createTrieRoot(harness.cas, 17);
    const secondRoots = await createRoots(harness.cas, secondTrie, 16);
    const second = await harness.materializations.retain({
      coordinate,
      roots: secondRoots.roots,
      stateHash: 'second-state-hash',
    });

    await expireAllReflogs(harness.path);
    await execFileAsync('git', ['-C', harness.path, 'prune', '--expire=now']);
    expect(acquisition.materialization.bundle.equals(first.bundle)).toBe(true);
    expect(acquisition.materialization.retention).toMatchObject({
      policy: 'pinned',
      reachability: 'anchored',
      root: { locator: expect.stringContaining('cache-acquisitions') },
    });
    expect(await harness.cas.bundles.getMember({
      handle: first.bundle.toString(),
      path: 'meta/descriptor',
    })).not.toBeNull();
    expect(await prunableOids(harness.path)).not.toContain(
      GitCasBundleHandle.parse(first.bundle.toString()).oid,
    );

    await acquisition.release();
    await expireAllReflogs(harness.path);
    expect(await prunableOids(harness.path)).not.toContain(
      GitCasBundleHandle.parse(first.bundle.toString()).oid,
    );

    await harness.materializations.close();
    await expireAllReflogs(harness.path);
    const prunable = await prunableOids(harness.path);
    expect(prunable).toContain(GitCasBundleHandle.parse(first.bundle.toString()).oid);
    expect(prunable).not.toContain(GitCasBundleHandle.parse(second.bundle.toString()).oid);
  });

  it('keeps workspace roots readable across aggressive Git pruning', async () => {
    const workspace = await harness.materializations.openWorkspace(workspaceCoordinate());
    const trie = new GitCasTrieStoreAdapter({ cas: harness.cas });
    const bytes = new Uint8Array([7, 8, 9]);
    const leafRoot = await trie.writeLeaf(bytes, workspace);
    await execFileAsync('git', ['-C', harness.path, 'prune', '--expire=now']);
    const branchRoot = await trie.writeBranch(new Map([[0, leafRoot]]), workspace);
    await execFileAsync('git', ['-C', harness.path, 'prune', '--expire=now']);

    const witness = await workspace.checkpoint({
      nodeAliveRoot: branchRoot,
      edgeAliveRoot: null,
    });
    if (witness === null) {
      throw new Error('Workspace did not witness its non-empty trie root');
    }
    expect(witness).toMatchObject({
      policy: 'evictable',
      reachability: 'anchored',
      root: { kind: 'root-set' },
    });
    expect(await prunableOids(harness.path)).not.toContain(
      GitCasBundleHandle.parse(branchRoot).oid,
    );

    await execFileAsync('git', ['-C', harness.path, 'prune', '--expire=now']);
    const children = await trie.readBranch(branchRoot);
    expect(children.size).toBe(1);
    expect(await trie.readLeaf(leafRoot)).toEqual(bytes);

    await workspace.release();
  });

  it('renews an active workspace on checkpoint without a git-warp lease timer', async () => {
    const clock = new MutableClock('2026-07-16T00:00:00.000Z');
    const leaseHarness = await createHarness(clock);
    try {
      const workspace = await leaseHarness.materializations.openWorkspace(workspaceCoordinate());
      const trie = new GitCasTrieStoreAdapter({ cas: leaseHarness.cas });
      const leafRoot = await trie.writeLeaf(new Uint8Array([1, 2, 3]), workspace);
      const branchRoot = await trie.writeBranch(new Map([[0, leafRoot]]), workspace);

      clock.advance(90 * 60 * 1_000);
      await workspace.checkpoint({
        nodeAliveRoot: branchRoot,
        edgeAliveRoot: null,
      });
      clock.advance(90 * 60 * 1_000);

      const sweep = await leaseHarness.cas.workspaces.sweep({
        namespace: 'git-warp/materializations',
        limit: 10,
      });
      expect(sweep.changed).toBe(0);
      await execFileAsync('git', ['-C', leaseHarness.path, 'prune', '--expire=now']);

      expect((await trie.readBranch(branchRoot)).size).toBe(1);
      await workspace.release();
    } finally {
      try {
        await leaseHarness.materializations.close();
      } finally {
        try {
          await leaseHarness.cas.close();
        } finally {
          try {
            await leaseHarness.history.close();
          } finally {
            await rm(leaseHarness.path, { recursive: true, force: true });
          }
        }
      }
    }
  });
});

type Harness = Readonly<{
  cas: ContentAddressableStore;
  materializations: MaterializationStorePort;
  history: GitTimelineHistoryAdapter;
  path: string;
  plumbing: Awaited<ReturnType<typeof Plumbing.createDefault>>;
}>;

async function createHarness(clock?: { readonly now: () => Date }): Promise<Harness> {
  const path = await mkdtemp(join(tmpdir(), 'git-warp-materializations-'));
  const plumbing = await Plumbing.createDefault({ cwd: path });
  await plumbing.execute({ args: ['init', '-q'] });
  await plumbing.execute({ args: ['config', 'user.email', 'test@example.com'] });
  await plumbing.execute({ args: ['config', 'user.name', 'Test'] });
  const cas = createCas(plumbing, clock);
  const materializationFixture = await createMaterializations(plumbing, cas);
  return Object.freeze({
    cas,
    history: materializationFixture.history,
    path,
    plumbing,
    materializations: materializationFixture.materializations,
  });
}

function createCas(
  plumbing: Awaited<ReturnType<typeof Plumbing.createDefault>>,
  clock?: { readonly now: () => Date },
): ContentAddressableStore {
  return ContentAddressableStore.createCbor({
    plumbing,
    chunking: { strategy: 'cdc' },
    applicationRefPrefixes: ['refs/warp/'],
    ...(clock === undefined ? {} : { clock }),
  });
}

async function createMaterializations(
  plumbing: Awaited<ReturnType<typeof Plumbing.createDefault>>,
  cas: ContentAddressableStore,
): Promise<Readonly<{
  history: GitTimelineHistoryAdapter;
  materializations: MaterializationStorePort;
}>> {
  const history = new GitTimelineHistoryAdapter({ plumbing });
  const repository = new GitCasRepositoryAdapter({ plumbing, history, cas });
  const services = await repository.createRuntimeStorageServices({
    timelineName: 'events',
    codec: defaultCodec,
    crypto: new NodeCryptoAdapter(),
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
  });
  return Object.freeze({ history, materializations: services.materializations });
}

type TrieRootFixture = Readonly<{
  bytes: Uint8Array;
  retainedOids: readonly string[];
  root: BundleHandle;
}>;

async function createTrieRoot(
  cas: ContentAddressableStore,
  seed = 7,
): Promise<TrieRootFixture> {
  const adapter = new GitCasTrieStoreAdapter({ cas });
  const bytes = new Uint8Array([seed, seed + 1, seed + 2]);
  const leafRoot = await adapter.writeLeaf(bytes);
  const branchRoot = await adapter.writeBranch(new Map([[0, leafRoot]]));
  const leafMember = await cas.bundles.getMember({
    handle: leafRoot,
    path: 'leaf/data',
  });
  if (leafMember === null || leafMember.handle.kind !== 'page') {
    throw new Error('Trie integration fixture did not create a leaf page');
  }
  return Object.freeze({
    bytes,
    retainedOids: Object.freeze([
      GitCasBundleHandle.parse(branchRoot).oid,
      GitCasBundleHandle.parse(leafRoot).oid,
      leafMember.handle.oid,
    ]),
    root: new BundleHandle(branchRoot),
  });
}

async function createRoots(
  cas: ContentAddressableStore,
  trie: TrieRootFixture,
  byteOffset = 0,
): Promise<Readonly<{
  retainedOids: readonly string[];
  roots: MaterializationRoots;
}>> {
  const handles: BundleHandle[] = [];
  const retainedOids: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    if (index === 4) {
      handles.push(trie.root);
      retainedOids.push(...trie.retainedOids);
      continue;
    }
    const page = await cas.pages.put({ source: new Uint8Array([index + byteOffset]) });
    const bundle = await cas.bundles.put({ members: { root: page.handle } });
    handles.push(new BundleHandle(bundle.handle.toString()));
    retainedOids.push(page.handle.oid, bundle.handle.oid);
  }
  return Object.freeze({
    retainedOids: Object.freeze(retainedOids),
    roots: rootsFromHandles(handles),
  });
}

function rootsFromHandles(handles: readonly BundleHandle[]): MaterializationRoots {
  const [
    adjacency,
    edgeAlive,
    edgeBirths,
    frontier,
    nodeAlive,
    properties,
    provenanceSupport,
    roaringIndexes,
  ] = handles;
  if (
    adjacency === undefined || edgeAlive === undefined || edgeBirths === undefined ||
    frontier === undefined || nodeAlive === undefined || properties === undefined ||
    provenanceSupport === undefined || roaringIndexes === undefined
  ) {
    throw new Error('Root integration fixture did not create every root');
  }
  return new MaterializationRoots({
    adjacency: MaterializationRoot.retained(adjacency),
    edgeAlive: MaterializationRoot.retained(edgeAlive),
    edgeBirths: MaterializationRoot.retained(edgeBirths),
    frontier: MaterializationRoot.retained(frontier),
    nodeAlive: MaterializationRoot.retained(nodeAlive),
    properties: MaterializationRoot.retained(properties),
    provenanceSupport: MaterializationRoot.retained(provenanceSupport),
    roaringIndexes: MaterializationRoot.retained(roaringIndexes),
  });
}

function rootSignature(
  name: string,
  root: MaterializationRoot,
): readonly [string, string, string | null] {
  return [name, root.status, root.handle?.toString() ?? null];
}

function workspaceCoordinate(): MaterializationCoordinate {
  return new MaterializationCoordinate({
    frontier: new Map([['writer-a', 'a'.repeat(40)]]),
    ceiling: null,
  });
}

class MutableClock {
  #current: number;

  constructor(iso: string) {
    this.#current = Date.parse(iso);
  }

  now(): Date {
    return new Date(this.#current);
  }

  advance(milliseconds: number): void {
    this.#current += milliseconds;
  }
}

async function prunableOids(path: string): Promise<Set<string>> {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', path, 'prune', '-n', '--expire=now'],
  );
  return new Set(
    stdout
      .split('\n')
      .map((line) => line.trim().split(/\s+/u)[0])
      .filter((oid): oid is string => oid !== undefined && oid.length > 0),
  );
}

async function expireAllReflogs(path: string): Promise<void> {
  await execFileAsync('git', ['-C', path, 'reflog', 'expire', '--expire=now', '--all']);
}
