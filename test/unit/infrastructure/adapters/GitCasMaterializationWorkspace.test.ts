import { describe, expect, it, vi } from 'vitest';
import type { CacheStoreResult } from '@git-stunts/git-cas';
import MaterializationCoordinate from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import GitCasMaterializationStoreAdapter, {
  type GitCasMaterializationFacade,
} from '../../../../src/infrastructure/adapters/GitCasMaterializationStoreAdapter.ts';
import GitCasMaterializationWorkspace from '../../../../src/infrastructure/adapters/GitCasMaterializationWorkspace.ts';
import type {
  MaterializationWorkspaceLease,
  MaterializationWorkspaceLeaseScheduler,
} from '../../../../src/infrastructure/adapters/GitCasMaterializationWorkspace.ts';
import type { PromoteMaterializationRequest } from '../../../../src/ports/MaterializationWorkspacePort.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

const WORKSPACE_CACHE_NAMESPACE = 'git-warp/materialization-workspaces';

describe('GitCasMaterializationWorkspace', () => {
  it('retains the latest in-progress roots in a separate expiring workspace', async () => {
    const harness = await createHarness();
    const roots = await createRoots(harness.cas);
    const workspace = await harness.adapter.openWorkspace(workspaceCoordinate());

    const witness = await workspace.checkpoint(roots);

    expect(witness).toMatchObject({
      policy: 'pinned',
      reachability: 'anchored',
      root: {
        kind: 'cache-set',
        namespace: WORKSPACE_CACHE_NAMESPACE,
      },
    });
    expect(harness.cas.readCacheKeys(WORKSPACE_CACHE_NAMESPACE)).toHaveLength(1);
    expect(harness.cas.readCacheHits(WORKSPACE_CACHE_NAMESPACE)[0]?.expiresAt).not.toBeNull();

    await workspace.release();
    await workspace.release();
    expect(harness.cas.readCacheKeys(WORKSPACE_CACHE_NAMESPACE)).toEqual([]);
  });

  it('keeps empty and released workspaces side-effect free', async () => {
    const harness = await createHarness();
    const workspace = await harness.adapter.openWorkspace(workspaceCoordinate());

    expect(await workspace.checkpoint({
      nodeAliveRoot: null,
      edgeAliveRoot: null,
    })).toBeNull();
    await workspace.release();
    await workspace.release();

    expect(harness.cas.readCacheKeys(WORKSPACE_CACHE_NAMESPACE)).toEqual([]);
    await expect(workspace.checkpoint({
      nodeAliveRoot: null,
      edgeAliveRoot: null,
    })).rejects.toMatchObject({ code: 'E_MATERIALIZATION_STORAGE' });
  });

  it('fails closed when git-cas declines workspace retention', async () => {
    const harness = await createHarness();
    const roots = await createRoots(harness.cas);
    const facade = withCacheResult(harness.cas, (stored) => Object.freeze({
      ...stored,
      accepted: false,
      hit: null,
      witness: null,
    }));
    const workspace = await adapterFor(facade).openWorkspace(workspaceCoordinate());

    await expect(workspace.checkpoint(roots)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('did not retain'),
    });
    await workspace.release();
    expect(harness.cas.readCacheKeys(WORKSPACE_CACHE_NAMESPACE)).toEqual([]);
  });

  it('cleans up when git-cas reports an unexpected workspace target', async () => {
    const harness = await createHarness();
    const roots = await createRoots(harness.cas);
    const page = await harness.cas.pages.put({ source: new Uint8Array([9]) });
    const cache = await harness.cas.caches.open({ namespace: WORKSPACE_CACHE_NAMESPACE });
    const unexpected = await cache.put('unexpected-workspace-target', page.handle);
    if (unexpected.hit === null) {
      throw new Error('Expected an unexpected workspace cache hit');
    }
    const facade = withCacheResult(harness.cas, (stored) => Object.freeze({
      ...stored,
      hit: unexpected.hit,
    }));
    const workspace = await adapterFor(facade).openWorkspace(workspaceCoordinate());

    await expect(workspace.checkpoint(roots)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('unexpected workspace handle'),
    });
    await workspace.release();
    expect(harness.cas.readCacheKeys(WORKSPACE_CACHE_NAMESPACE)).toEqual([
      'unexpected-workspace-target',
    ]);
  });

  it('serializes release behind an in-flight workspace checkpoint', async () => {
    const harness = await createHarness();
    const roots = await createRoots(harness.cas);
    const cache = await harness.cas.caches.open({ namespace: WORKSPACE_CACHE_NAMESPACE });
    let admitPut: () => void = () => undefined;
    const putGate = new Promise<void>((resolve) => {
      admitPut = resolve;
    });
    const workspace = new GitCasMaterializationWorkspace({
      bundles: harness.cas.bundles,
      cache: {
        put: async (...args) => {
          await putGate;
          return await cache.put(...args);
        },
        remove: async (key) => await cache.remove(key),
      },
      key: 'concurrent-release',
      promote: rejectPromotion,
    });

    const checkpoint = workspace.checkpoint(roots);
    const release = workspace.release();
    admitPut();

    await checkpoint;
    await release;
    expect(harness.cas.readCacheKeys(WORKSPACE_CACHE_NAMESPACE)).toEqual([]);
    await expect(workspace.checkpoint({
      nodeAliveRoot: null,
      edgeAliveRoot: null,
    })).rejects.toMatchObject({ code: 'E_MATERIALIZATION_STORAGE' });
  });

  it('renews an active lease without waiting for another root checkpoint', async () => {
    const harness = await createHarness();
    const roots = await createRoots(harness.cas);
    const cache = await harness.cas.caches.open({ namespace: WORKSPACE_CACHE_NAMESPACE });
    const scheduler = new ManualLeaseScheduler();
    let now = Date.parse('2026-07-16T00:00:00.000Z');
    const workspace = new GitCasMaterializationWorkspace({
      bundles: harness.cas.bundles,
      cache,
      key: 'renewing-workspace',
      clock: { now: () => new Date(now) },
      leaseTtlMs: 100,
      leaseRenewalMs: 40,
      leaseScheduler: scheduler,
      promote: rejectPromotion,
    });

    await workspace.checkpoint(roots);
    const firstExpiry = requireWorkspaceExpiry(harness.cas);
    now += 40;
    await scheduler.runNext();
    const renewedExpiry = requireWorkspaceExpiry(harness.cas);

    expect(renewedExpiry).toBeGreaterThan(firstExpiry);
    expect(scheduler.pending).toBe(true);
    await workspace.release();
    expect(scheduler.pending).toBe(false);
  });

  it('runs lease renewal through the production scheduler callback', async () => {
    vi.useFakeTimers();
    try {
      const harness = await createHarness();
      const roots = await createRoots(harness.cas);
      const cache = await harness.cas.caches.open({ namespace: WORKSPACE_CACHE_NAMESPACE });
      const workspace = new GitCasMaterializationWorkspace({
        bundles: harness.cas.bundles,
        cache,
        key: 'system-scheduler',
        leaseTtlMs: 100,
        leaseRenewalMs: 40,
        promote: rejectPromotion,
      });

      await workspace.checkpoint(roots);
      const firstExpiry = requireWorkspaceExpiry(harness.cas);
      await vi.advanceTimersByTimeAsync(40);

      expect(requireWorkspaceExpiry(harness.cas)).toBeGreaterThan(firstExpiry);
      await workspace.release();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores lease timers that fire after release or target replacement', async () => {
    const harness = await createHarness();
    const roots = await createRoots(harness.cas);
    const cache = await harness.cas.caches.open({ namespace: WORKSPACE_CACHE_NAMESPACE });
    const scheduler = new ManualLeaseScheduler();
    const workspace = new GitCasMaterializationWorkspace({
      bundles: harness.cas.bundles,
      cache,
      key: 'stale-renewal',
      leaseTtlMs: 100,
      leaseRenewalMs: 40,
      leaseScheduler: scheduler,
      promote: rejectPromotion,
    });

    await workspace.checkpoint(roots);
    const replacedTargetTimer = scheduler.takeNext();
    const replacement = await createRoots(harness.cas);
    await workspace.checkpoint(replacement);
    await replacedTargetTimer();
    const releasedTargetTimer = scheduler.takeNext();
    await workspace.release();
    await releasedTargetTimer();

    expect(harness.cas.readCacheKeys(WORKSPACE_CACHE_NAMESPACE)).toEqual([]);
  });

  it('fails closed after a lease renewal error and releases without masking cleanup', async () => {
    const harness = await createHarness();
    const roots = await createRoots(harness.cas);
    const cache = await harness.cas.caches.open({ namespace: WORKSPACE_CACHE_NAMESPACE });
    const scheduler = new ManualLeaseScheduler();
    const promote = vi.fn(rejectPromotion);
    let puts = 0;
    const workspace = new GitCasMaterializationWorkspace({
      bundles: harness.cas.bundles,
      cache: {
        put: async (...args) => {
          puts += 1;
          if (puts === 2) {
            throw new Error('renewal unavailable');
          }
          return await cache.put(...args);
        },
        remove: async (key) => await cache.remove(key),
      },
      key: 'failing-renewal',
      leaseTtlMs: 100,
      leaseRenewalMs: 40,
      leaseScheduler: scheduler,
      promote,
    });

    await workspace.checkpoint(roots);
    await scheduler.runNext();

    await expect(workspace.checkpoint(roots)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('lease renewal failed'),
    });
    await expect(workspace.promote({} as PromoteMaterializationRequest)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('lease renewal failed'),
    });
    expect(promote).not.toHaveBeenCalled();
    await expect(workspace.release()).resolves.toBeUndefined();
    expect(harness.cas.readCacheKeys(WORKSPACE_CACHE_NAMESPACE)).toEqual([]);
  });

  it('continues renewing while final materialization promotion is in flight', async () => {
    const harness = await createHarness();
    const roots = await createRoots(harness.cas);
    const cache = await harness.cas.caches.open({ namespace: WORKSPACE_CACHE_NAMESPACE });
    const scheduler = new ManualLeaseScheduler();
    let now = Date.parse('2026-07-16T00:00:00.000Z');
    let rejectPromotionGate: (reason: Error) => void = () => undefined;
    const promotionFailure = new Error('final retention unavailable');
    const promotionGate = new Promise<never>((_resolve, reject) => {
      rejectPromotionGate = reject;
    });
    let signalPromotionStarted: () => void = () => undefined;
    const promotionStarted = new Promise<void>((resolve) => {
      signalPromotionStarted = resolve;
    });
    const workspace = new GitCasMaterializationWorkspace({
      bundles: harness.cas.bundles,
      cache,
      key: 'long-promotion',
      clock: { now: () => new Date(now) },
      leaseTtlMs: 100,
      leaseRenewalMs: 40,
      leaseScheduler: scheduler,
      promote: async (_request) => {
        signalPromotionStarted();
        return await promotionGate;
      },
    });

    await workspace.checkpoint(roots);
    const firstExpiry = requireWorkspaceExpiry(harness.cas);
    const promotion = workspace.promote({} as PromoteMaterializationRequest);
    const promotionAssertion = expect(promotion).rejects.toBe(promotionFailure);
    await promotionStarted;
    const release = workspace.release();
    await expect(workspace.promote({} as PromoteMaterializationRequest)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('cannot promote'),
    });
    now += 40;
    await scheduler.runNext();

    expect(requireWorkspaceExpiry(harness.cas)).toBeGreaterThan(firstExpiry);
    rejectPromotionGate(promotionFailure);
    await promotionAssertion;
    await release;
    expect(harness.cas.readCacheKeys(WORKSPACE_CACHE_NAMESPACE)).toEqual([]);
  });

  it('rejects malformed roots and invalid clocks before retention', async () => {
    const harness = await createHarness();
    const cache = await harness.cas.caches.open({ namespace: WORKSPACE_CACHE_NAMESPACE });
    const workspace = new GitCasMaterializationWorkspace({
      bundles: harness.cas.bundles,
      cache,
      key: 'invalid-clock',
      clock: { now: () => new Date(Number.NaN) },
      promote: rejectPromotion,
    });

    await expect(workspace.checkpoint({
      nodeAliveRoot: 'not-a-bundle',
      edgeAliveRoot: null,
    })).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('not a bundle handle'),
    });
    await expect(Reflect.apply(workspace.checkpoint, workspace, [null]))
      .rejects.toMatchObject({
        code: 'E_MATERIALIZATION_STORAGE',
        message: expect.stringContaining('roots must be an object'),
      });

    const roots = await createRoots(harness.cas);
    await expect(workspace.checkpoint(roots)).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('invalid Date'),
    });
  });

  it('validates workspace dependencies and options', async () => {
    const harness = await createHarness();
    const cache = await harness.cas.caches.open({ namespace: WORKSPACE_CACHE_NAMESPACE });
    const valid = {
      bundles: harness.cas.bundles,
      cache,
      key: 'workspace-options',
      promote: rejectPromotion,
    };

    expect(() => Reflect.construct(GitCasMaterializationWorkspace, [null]))
      .toThrowError(/options/u);
    for (const field of ['bundles', 'cache', 'promote']) {
      const options = { ...valid };
      Reflect.set(options, field, null);
      expect(() => Reflect.construct(GitCasMaterializationWorkspace, [options]))
        .toThrowError(new RegExp(`${field} dependency`, 'u'));
    }
    expect(() => new GitCasMaterializationWorkspace({
      ...valid,
      key: '',
    })).toThrowError(/key/u);
    expect(() => Reflect.construct(GitCasMaterializationWorkspace, [{
      ...valid,
      clock: {},
    }])).toThrowError(/clock/u);
    expect(() => new GitCasMaterializationWorkspace({
      ...valid,
      leaseTtlMs: 40,
      leaseRenewalMs: 40,
    })).toThrowError(/leaseRenewalMs/u);
    expect(() => new GitCasMaterializationWorkspace({
      ...valid,
      leaseTtlMs: 0,
    })).toThrowError(/leaseTtlMs/u);
    expect(() => Reflect.construct(GitCasMaterializationWorkspace, [{
      ...valid,
      leaseScheduler: {},
    }])).toThrowError(/leaseScheduler/u);
  });
});

type WorkspaceRoots = Readonly<{
  nodeAliveRoot: string;
  edgeAliveRoot: string;
}>;

type Harness = Readonly<{
  adapter: GitCasMaterializationStoreAdapter;
  cas: InMemoryGitCasFacade;
}>;

async function createHarness(): Promise<Harness> {
  const cas = new InMemoryGitCasFacade({
    history: new InMemoryGraphAdapter(),
    storage: new InMemoryBlobStorageAdapter(),
  });
  return Object.freeze({
    cas,
    adapter: adapterFor(cas),
  });
}

async function createRoots(cas: InMemoryGitCasFacade): Promise<WorkspaceRoots> {
  const nodePage = await cas.pages.put({ source: new Uint8Array([1]) });
  const edgePage = await cas.pages.put({ source: new Uint8Array([2]) });
  const nodeBundle = await cas.bundles.putOrdered({ members: [['root', nodePage.handle]] });
  const edgeBundle = await cas.bundles.putOrdered({ members: [['root', edgePage.handle]] });
  return Object.freeze({
    nodeAliveRoot: nodeBundle.handle.toString(),
    edgeAliveRoot: edgeBundle.handle.toString(),
  });
}

function adapterFor(cas: GitCasMaterializationFacade): GitCasMaterializationStoreAdapter {
  return new GitCasMaterializationStoreAdapter({
    cas,
    codec: defaultCodec,
    crypto: new NodeCryptoAdapter(),
    laneName: 'events',
  });
}

function withCacheResult(
  cas: InMemoryGitCasFacade,
  rewrite: (stored: CacheStoreResult) => CacheStoreResult,
): GitCasMaterializationFacade {
  return {
    bundles: cas.bundles,
    pages: cas.pages,
    caches: {
      open: async (options) => {
        const cache = await cas.caches.open(options);
        return {
          get: async (key) => await cache.get(key),
          put: async (key, handle, entryOptions) => rewrite(
            await cache.put(key, handle, entryOptions),
          ),
          remove: async (key) => await cache.remove(key),
        };
      },
    },
  };
}

function requireWorkspaceExpiry(cas: InMemoryGitCasFacade): number {
  const expiresAt = cas.readCacheHits(WORKSPACE_CACHE_NAMESPACE)[0]?.expiresAt;
  if (expiresAt === undefined || expiresAt === null) {
    throw new Error('Expected the workspace to have an expiry');
  }
  return Date.parse(expiresAt);
}

function workspaceCoordinate(): MaterializationCoordinate {
  return new MaterializationCoordinate({
    frontier: new Map([['writer-a', 'patch-a']]),
    ceiling: null,
  });
}

function rejectPromotion(): Promise<never> {
  return Promise.reject(new Error('Promotion is not used by this workspace lifecycle test'));
}

class ManualLeaseScheduler implements MaterializationWorkspaceLeaseScheduler {
  #task: (() => Promise<void>) | null = null;

  get pending(): boolean {
    return this.#task !== null;
  }

  schedule(task: () => Promise<void>, _delayMs: number): MaterializationWorkspaceLease {
    this.#task = task;
    return Object.freeze({
      cancel: () => {
        if (this.#task === task) {
          this.#task = null;
        }
      },
    });
  }

  async runNext(): Promise<void> {
    await this.takeNext()();
  }

  takeNext(): () => Promise<void> {
    const task = this.#task;
    if (task === null) {
      throw new Error('Expected a scheduled lease renewal');
    }
    this.#task = null;
    return task;
  }
}
