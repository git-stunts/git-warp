import { describe, expect, it } from 'vitest';
import type { BundleCapability } from '@git-stunts/git-cas';
import DomainBundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import GitCasTrieStoreAdapter, {
  type GitCasTrieFacade,
} from '../../../../src/infrastructure/adapters/GitCasTrieStoreAdapter.ts';
import ArtifactStagingPort, {
  type StageOrderedBundleOptions,
  type StageOrderedBundleRequest,
  type StageOrderedBundlesOptions,
  type StagePageOptions,
  type StagePagesOptions,
  type StagedBundleMember,
} from '../../../../src/ports/ArtifactStagingPort.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

describe('GitCasTrieStoreAdapter write waves', () => {
  it('preserves singleton roots while batching leaf pages and bundles', async () => {
    const cas = createCas();
    const baseline = new GitCasTrieStoreAdapter({ cas });
    const leaves = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];
    const expected = await writeLeavesIndividually(baseline, leaves);
    const recording = recordingFacade(cas);
    const adapter = new GitCasTrieStoreAdapter({ cas: recording.facade });

    const actual = await adapter.writeLeaves(leaves);

    expect(actual).toEqual(expected);
    expect(recording.calls.pageBatches).toEqual([3]);
    expect(recording.calls.bundleBatches).toEqual([3]);
    expect(recording.calls.singletonPages).toBe(0);
    expect(recording.calls.singletonBundles).toBe(0);
  });

  it('preserves singleton roots while batching an independent branch wave', async () => {
    const cas = createCas();
    const baseline = new GitCasTrieStoreAdapter({ cas });
    const leaf = await baseline.writeLeaf(new Uint8Array([1]));
    const branches = [
      new Map([[0, leaf]]),
      new Map([[1, leaf]]),
      new Map([[2, leaf]]),
    ];
    const expected = await writeBranchesIndividually(baseline, branches);
    const recording = recordingFacade(cas);
    const adapter = new GitCasTrieStoreAdapter({ cas: recording.facade });

    const actual = await adapter.writeBranches(branches);

    expect(actual).toEqual(expected);
    expect(recording.calls.bundleBatches).toEqual([3]);
    expect(recording.calls.singletonBundles).toBe(0);
  });

  it('uses batch-capable staging without escaping to direct writes', async () => {
    const cas = createCas();
    const adapter = new GitCasTrieStoreAdapter({ cas });
    const staging = new RecordingStaging(cas);
    const leaves = [new Uint8Array([1]), new Uint8Array([2])];
    const expected = await writeLeavesIndividually(adapter, leaves);

    const actual = await adapter.writeLeaves(leaves, staging);
    await adapter.writeBranches([new Map([[0, actual[0]!]])], staging);

    expect(actual).toEqual(expected);
    expect(staging.pageBatches).toEqual([2]);
    expect(staging.bundleBatches).toEqual([2, 1]);
    expect(staging.singletonPages).toBe(0);
    expect(staging.singletonBundles).toBe(0);
  });

  it('falls back to singleton writes when batch capabilities are absent', async () => {
    const cas = createCas();
    const recording = singletonFacade(cas);
    const adapter = new GitCasTrieStoreAdapter({ cas: recording.facade });
    const leaves = [new Uint8Array([1]), new Uint8Array([2])];

    const roots = await adapter.writeLeaves(leaves);
    await adapter.writeBranches([new Map([[0, roots[0]!]])]);

    expect(recording.calls.singletonPages).toBe(2);
    expect(recording.calls.singletonBundles).toBe(3);
  });

  it('fails closed when a page batch omits an ordered result', async () => {
    const cas = createCas();
    const recording = recordingFacade(cas);
    const malformed: GitCasTrieFacade = {
      bundles: recording.facade.bundles,
      pages: { ...recording.facade.pages, putBatch: async () => Object.freeze([]) },
    };

    await expect(new GitCasTrieStoreAdapter({ cas: malformed }).writeLeaves([
      new Uint8Array([1]),
    ])).rejects.toMatchObject({
      code: 'E_TRIE_STORE_WRITE',
      context: { kind: 'page', expected: 1, actual: 0 },
    });
  });

  it('fails closed when a bundle batch omits an ordered result', async () => {
    const cas = createCas();
    const recording = recordingFacade(cas);
    const malformed: GitCasTrieFacade = {
      pages: recording.facade.pages,
      bundles: {
        ...recording.facade.bundles,
        putOrderedBatch: async () => Object.freeze([]),
      },
    };

    await expect(new GitCasTrieStoreAdapter({ cas: malformed }).writeLeaves([
      new Uint8Array([1]),
    ])).rejects.toMatchObject({
      code: 'E_TRIE_STORE_WRITE',
      context: { kind: 'bundle', expected: 1, actual: 0 },
    });
  });

  it('fails closed when a direct page batch is sparse', async () => {
    const cas = createCas();
    const malformed: GitCasTrieFacade = {
      bundles: cas.bundles,
      pages: {
        ...cas.pages,
        putBatch: async (request) => {
          const staged = await cas.pages.putBatch(request);
          return sparsePair(staged[0]!);
        },
      },
    };

    await expect(new GitCasTrieStoreAdapter({ cas: malformed }).writeLeaves([
      new Uint8Array([1]),
      new Uint8Array([2]),
    ])).rejects.toMatchObject({
      code: 'E_TRIE_STORE_WRITE',
      context: { kind: 'page', expected: 2, actual: 2, index: 1 },
    });
  });

  it('fails closed when a direct bundle batch is sparse', async () => {
    const cas = createCas();
    const malformed: GitCasTrieFacade = {
      pages: cas.pages,
      bundles: {
        ...cas.bundles,
        putOrderedBatch: async (request) => {
          const staged = await cas.bundles.putOrderedBatch(request);
          return sparsePair(staged[0]!);
        },
      },
    };

    await expect(new GitCasTrieStoreAdapter({ cas: malformed }).writeLeaves([
      new Uint8Array([1]),
      new Uint8Array([2]),
    ])).rejects.toMatchObject({
      code: 'E_TRIE_STORE_WRITE',
      context: { kind: 'bundle', expected: 2, actual: 2, index: 1 },
    });
  });

  it('fails closed when a staged page batch is sparse', async () => {
    const cas = createCas();
    const adapter = new GitCasTrieStoreAdapter({ cas });

    await expect(adapter.writeLeaves([
      new Uint8Array([1]),
      new Uint8Array([2]),
    ], new SparsePageStaging(cas))).rejects.toMatchObject({
      code: 'E_TRIE_STORE_WRITE',
      context: { kind: 'page', expected: 2, actual: 2, index: 1 },
    });
  });

  it('fails closed when a staged bundle batch is sparse', async () => {
    const cas = createCas();
    const adapter = new GitCasTrieStoreAdapter({ cas });

    await expect(adapter.writeLeaves([
      new Uint8Array([1]),
      new Uint8Array([2]),
    ], new SparseBundleStaging(cas))).rejects.toMatchObject({
      code: 'E_TRIE_STORE_WRITE',
      context: { kind: 'bundle', expected: 2, actual: 2, index: 1 },
    });
  });

  it('windows leaf waves at the declared page and bundle limits', async () => {
    const cas = createCas();
    const recording = recordingFacade(cas);
    const adapter = new GitCasTrieStoreAdapter({ cas: recording.facade });
    const leaves = Array.from({ length: 257 }, (_, value) => new Uint8Array([value % 256]));

    await expect(adapter.writeLeaves(leaves)).resolves.toHaveLength(257);

    expect(recording.calls.pageBatches).toEqual([256, 1]);
    expect(recording.calls.bundleBatches).toEqual([64, 64, 64, 64, 1]);
  });

  it('windows branch waves by aggregate member count', async () => {
    const cas = createCas();
    const baseline = new GitCasTrieStoreAdapter({ cas });
    const leaf = await baseline.writeLeaf(new Uint8Array([1]));
    const branches = Array.from({ length: 33 }, () => branchWithMembers(leaf, 256));
    const recording = recordingFacade(cas);
    const adapter = new GitCasTrieStoreAdapter({ cas: recording.facade });

    await expect(adapter.writeBranches(branches)).resolves.toHaveLength(33);

    expect(recording.calls.bundleBatches).toEqual([32, 1]);
    expect(recording.calls.singletonBundles).toBe(0);
  });

  it('keeps an oversized individual branch on the supported singleton path', async () => {
    const cas = createCas();
    const baseline = new GitCasTrieStoreAdapter({ cas });
    const leaf = await baseline.writeLeaf(new Uint8Array([1]));
    const recording = recordingFacade(cas);
    const adapter = new GitCasTrieStoreAdapter({ cas: recording.facade });

    await expect(adapter.writeBranches([branchWithMembers(leaf, 8_193)]))
      .resolves.toHaveLength(1);

    expect(recording.calls.bundleBatches).toEqual([]);
    expect(recording.calls.singletonBundles).toBe(1);
  });

  it('keeps empty waves side-effect free', async () => {
    const recording = recordingFacade(createCas());
    const adapter = new GitCasTrieStoreAdapter({ cas: recording.facade });

    await expect(adapter.writeLeaves([])).resolves.toEqual([]);
    await expect(adapter.writeBranches([])).resolves.toEqual([]);

    expect(recording.calls).toEqual(emptyCalls());
  });
});

type WriteCalls = {
  readonly pageBatches: number[];
  readonly bundleBatches: number[];
  singletonPages: number;
  singletonBundles: number;
};

function emptyCalls(): WriteCalls {
  return { pageBatches: [], bundleBatches: [], singletonPages: 0, singletonBundles: 0 };
}

function createCas(): InMemoryGitCasFacade {
  return new InMemoryGitCasFacade({
    history: new InMemoryGraphAdapter(),
    storage: new InMemoryBlobStorageAdapter(),
  });
}

function recordingFacade(
  cas: InMemoryGitCasFacade,
): Readonly<{ facade: GitCasTrieFacade; calls: WriteCalls }> {
  const calls = emptyCalls();
  const facade: GitCasTrieFacade = {
    pages: {
      get: cas.pages.get,
      put: async (request) => {
        calls.singletonPages += 1;
        return await cas.pages.put(request);
      },
      putBatch: async (request) => {
        calls.pageBatches.push(request.pages.length);
        return await cas.pages.putBatch(request);
      },
    },
    bundles: {
      getMemberReference: cas.bundles.getMemberReference,
      iterateMemberReferences: cas.bundles.iterateMemberReferences,
      putOrdered: async (request) => {
        calls.singletonBundles += 1;
        return await cas.bundles.putOrdered(request);
      },
      putOrderedBatch: async (request) => {
        calls.bundleBatches.push(request.bundles.length);
        return await cas.bundles.putOrderedBatch(request);
      },
    },
  };
  return { facade, calls };
}

function singletonFacade(
  cas: InMemoryGitCasFacade,
): Readonly<{ facade: GitCasTrieFacade; calls: WriteCalls }> {
  const recording = recordingFacade(cas);
  return {
    calls: recording.calls,
    facade: {
      pages: {
        get: recording.facade.pages.get,
        put: recording.facade.pages.put,
      },
      bundles: {
        getMemberReference: recording.facade.bundles.getMemberReference,
        iterateMemberReferences: recording.facade.bundles.iterateMemberReferences,
        putOrdered: recording.facade.bundles.putOrdered,
      },
    },
  };
}

async function writeLeavesIndividually(
  adapter: GitCasTrieStoreAdapter,
  leaves: readonly Uint8Array[],
): Promise<readonly string[]> {
  const roots: string[] = [];
  for (const leaf of leaves) { roots.push(await adapter.writeLeaf(leaf)); }
  return roots;
}

async function writeBranchesIndividually(
  adapter: GitCasTrieStoreAdapter,
  branches: readonly ReadonlyMap<number, string>[],
): Promise<readonly string[]> {
  const roots: string[] = [];
  for (const branch of branches) { roots.push(await adapter.writeBranch(branch)); }
  return roots;
}

function branchWithMembers(root: string, count: number): ReadonlyMap<number, string> {
  return new Map(Array.from({ length: count }, (_, nibble) => [nibble, root]));
}

class RecordingStaging extends ArtifactStagingPort {
  readonly pageBatches: number[] = [];
  readonly bundleBatches: number[] = [];
  singletonPages = 0;
  singletonBundles = 0;
  readonly #cas: InMemoryGitCasFacade;

  constructor(cas: InMemoryGitCasFacade) {
    super();
    this.#cas = cas;
  }

  override async stagePage(source: Uint8Array, options: StagePageOptions): Promise<string> {
    this.singletonPages += 1;
    return (await this.#cas.pages.put({ source, ...options })).handle.toString();
  }

  override async stagePages(
    sources: readonly Uint8Array[],
    options: StagePagesOptions,
  ): Promise<readonly string[]> {
    this.pageBatches.push(sources.length);
    const staged = await this.#cas.pages.putBatch({
      pages: sources.map((source) => ({ source, maxBytes: options.maxBytes })),
      maxBatchBytes: options.maxBatchBytes,
      maxBatchPages: options.maxBatchPages,
    });
    return staged.map((page) => page.handle.toString());
  }

  override async stageOrderedBundle(
    members: Iterable<StagedBundleMember>,
    options?: StageOrderedBundleOptions,
  ): Promise<DomainBundleHandle> {
    this.singletonBundles += 1;
    const staged = await this.#cas.bundles.putOrdered({
      members,
      ...(options?.maxMembers === undefined ? {} : { limits: options }),
    });
    return new DomainBundleHandle(staged.handle.toString());
  }

  override async stageOrderedBundles(
    bundles: readonly StageOrderedBundleRequest[],
    options: StageOrderedBundlesOptions,
  ): Promise<readonly DomainBundleHandle[]> {
    this.bundleBatches.push(bundles.length);
    const staged = await this.#cas.bundles.putOrderedBatch({
      bundles: bundles.map(gitCasBundleRequest),
      ...options,
    });
    return staged.map((bundle) => new DomainBundleHandle(bundle.handle.toString()));
  }
}

class SparsePageStaging extends RecordingStaging {
  override async stagePages(
    sources: readonly Uint8Array[],
    options: StagePagesOptions,
  ): Promise<readonly string[]> {
    const staged = await super.stagePages(sources, options);
    return sparsePair(staged[0]!);
  }
}

class SparseBundleStaging extends RecordingStaging {
  override async stageOrderedBundles(
    bundles: readonly StageOrderedBundleRequest[],
    options: StageOrderedBundlesOptions,
  ): Promise<readonly DomainBundleHandle[]> {
    const staged = await super.stageOrderedBundles(bundles, options);
    return sparsePair(staged[0]!);
  }
}

function gitCasBundleRequest(
  request: StageOrderedBundleRequest,
): Parameters<BundleCapability['putOrderedBatch']>[0]['bundles'][number] {
  return {
    members: request.members,
    ...(request.options?.maxMembers === undefined
      ? {}
      : { limits: { maxMembers: request.options.maxMembers } }),
  };
}

function sparsePair<T>(value: T): readonly T[] {
  const sparse: T[] = [];
  sparse.length = 2;
  sparse[0] = value;
  return Object.freeze(sparse);
}
