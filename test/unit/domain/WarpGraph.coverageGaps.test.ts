import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import { encode } from '../../../src/infrastructure/codecs/CborCodec.ts';
import { encodePatchMessage } from '../../../src/domain/services/codec/WarpMessageCodec.ts';
import { createEmptyState } from '../../../src/domain/services/JoinReducer.ts';
import ORSet from '../../../src/domain/crdt/ORSet.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';

const crypto = new NodeCryptoAdapter();

function createMockPersistence() {
  return {
    readRef: vi.fn(),
    showNode: vi.fn(),
    writeBlob: vi.fn(),
    writeTree: vi.fn(),
    readBlob: vi.fn(),
    readTreeOids: vi.fn(),
    commitNode: vi.fn(),
    commitNodeWithTree: vi.fn(),
    updateRef: vi.fn(),
    listRefs: vi.fn().mockResolvedValue([]),
    getNodeInfo: vi.fn(),
    ping: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 }),
    configGet: vi.fn().mockResolvedValue(null),
    configSet: vi.fn().mockResolvedValue(undefined),
    deleteRef: vi.fn(),
    nodeExists: vi.fn().mockResolvedValue(true),
  };
}

/**
 * Helper: creates a mock patch commit for testing.
 * @param {any} options
 * @returns {any}
 */
function createMockPatch({ sha, graphName, writerId, lamport, patchOid, ops, parentSha = null as string | null, context = null as any }) {
  const patch = {
    schema: 2,
    writer: writerId,
    lamport,
    context: context || { [writerId]: lamport },
    ops,
  };
  const patchBuffer = encode(patch);
  const message = encodePatchMessage({
    graph: graphName,
    writer: writerId,
    lamport,
    patchOid,
    schema: 2,
  });

  return {
    sha,
    patchOid,
    patchBuffer,
    message,
    parentSha,
    nodeInfo: {
      sha,
      message,
      author: 'Test <test@example.com>',
      date: new Date().toISOString(),
      parents: parentSha ? [parentSha] : [],
    },
  };
}

describe('WarpCore coverage gaps', () => {
    let persistence;

  beforeEach(() => {
    persistence = createMockPersistence();
  });

  // --------------------------------------------------------------------------
  // 1. seekCache getter
  // --------------------------------------------------------------------------
  describe('get seekCache', () => {
    it('returns null when no seek cache is set', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      expect(graph.seekCache).toBeNull();
    });

    it('returns the seek cache passed at construction', async () => {
            const mockCache = ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }) as any;
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
        seekCache: mockCache,
      });

      expect(graph.seekCache).toBe(mockCache);
    });
  });

  // --------------------------------------------------------------------------
  // 2. setSeekCache()
  // --------------------------------------------------------------------------
  describe('setSeekCache', () => {
    it('sets the seek cache after construction', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      expect(graph.seekCache).toBeNull();

            const mockCache = ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }) as any;
      graph.setSeekCache(mockCache);

      expect(graph.seekCache).toBe(mockCache);
    });

    it('replaces an existing seek cache', async () => {
            const cache1 = ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }) as any;
            const cache2 = ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }) as any;

      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
        seekCache: cache1,
      });

      expect(graph.seekCache).toBe(cache1);

      graph.setSeekCache(cache2);

      expect(graph.seekCache).toBe(cache2);
    });
  });

  // --------------------------------------------------------------------------
  // 3. join()
  // --------------------------------------------------------------------------
  describe('join', () => {
    it('throws E_NO_STATE when no cached state exists', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const otherState = createEmptyState();

      expect(() => graph.join(otherState)).toThrow('No live reading basis');
    });

    it('throws when otherState is null', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      (graph as any)._cachedState = createEmptyState();

      expect(() => graph.join((null as any))).toThrow('Invalid state');
    });

    it('throws when otherState is missing nodeAlive', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      (graph as any)._cachedState = createEmptyState();

      expect(() => graph.join(({ edgeAlive: ORSet.empty() } as any))).toThrow('Invalid state');
    });

    it('throws when otherState is missing edgeAlive', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      (graph as any)._cachedState = createEmptyState();

      expect(() => graph.join(({ nodeAlive: ORSet.empty() } as any))).toThrow('Invalid state');
    });

    it('merges two empty states and returns zero-change receipt', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      (graph as any)._cachedState = createEmptyState();
      const otherState = createEmptyState();

      const { state, receipt } = graph.join(otherState);

      expect(state).toBeDefined();
      expect(receipt.nodesAdded).toBe(0);
      expect(receipt.nodesRemoved).toBe(0);
      expect(receipt.edgesAdded).toBe(0);
      expect(receipt.edgesRemoved).toBe(0);
      expect(receipt.propsChanged).toBe(0);
      expect(receipt.frontierMerged).toBe(false);
    });

    it('merges a state with nodes into empty and reports additions', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      (graph as any)._cachedState = createEmptyState();

      const otherState = createEmptyState();
      const dot = Dot.create('writer-2', 1);
      otherState.nodeAlive.add('user:alice', dot);

      const { receipt } = graph.join(otherState);

      expect(receipt.nodesAdded).toBe(1);
      expect(receipt.nodesRemoved).toBe(0);
    });

    // ── B108 cache coherence regression tests ──────────────────────────────

    it('sets _stateDirty = false and _materializedGraph is not null after join()', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      (graph as any)._cachedState = createEmptyState();
      (graph as any)._stateDirty = false;

      const otherState = createEmptyState();
      const dot = Dot.create('writer-2', 1);
      otherState.nodeAlive.add('user:alice', dot);

      graph.join(otherState);

      expect((graph as any)._stateDirty).toBe(false);
      expect((graph)._materializedGraph).not.toBeNull();
      expect((graph as any)._materializedGraph?.state).toBeDefined();
      expect((graph as any)._materializedGraph?.adjacency).toBeDefined();
      expect((graph as any)._materializedGraph?.stateHash).toBeNull();
    });

    it('preserves merged state — _ensureFreshState() does not throw or rematerialize', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
        autoMaterialize: false,
      });

      (graph as any)._cachedState = createEmptyState();
      (graph as any)._stateDirty = false;

      const otherState = createEmptyState();
      const dot = Dot.create('writer-2', 1);
      otherState.nodeAlive.add('user:alice', dot);

      graph.join(otherState);

      // _ensureFreshState should NOT throw E_STALE_STATE
      await expect((graph)._ensureFreshState()).resolves.toBeUndefined();
    });

    it('builds adjacency so traversal works without rematerialization', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const baseState = createEmptyState();
      const dotA = Dot.create('writer-1', 1);
      const dotB = Dot.create('writer-1', 2);
      baseState.nodeAlive.add('user:alice', dotA);
      baseState.nodeAlive.add('user:bob', dotB);
      const edgeDot = Dot.create('writer-1', 3);
      baseState.edgeAlive.add('user:alice\0user:bob\0knows', edgeDot);
      (graph as any)._cachedState = baseState;
      (graph as any)._stateDirty = false;

      const otherState = createEmptyState();
      const dotC = Dot.create('writer-2', 1);
      otherState.nodeAlive.add('user:alice', dotC);
      otherState.nodeAlive.add('user:bob', dotC);
      const edgeDot2 = Dot.create('writer-2', 2);
      otherState.edgeAlive.add('user:alice\0user:bob\0knows', edgeDot2);

      graph.join(otherState);

      const adj = (graph as any)._materializedGraph?.adjacency;
      expect(adj.outgoing.has('user:alice')).toBe(true);
      expect(adj.incoming.has('user:bob')).toBe(true);
    });

    it('clears _cachedViewHash after join()', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      (graph as any)._cachedState = createEmptyState();
      (graph as any)._stateDirty = false;
      (graph)._cachedViewHash = 'stale-hash-value';

      const otherState = createEmptyState();
      graph.join(otherState);

      expect((graph)._cachedViewHash).toBeNull();
    });

    it('updates _versionVector from merged frontier', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const baseState = createEmptyState();
      baseState.observedFrontier.set('writer-1', 3);
      (graph as any)._cachedState = baseState;
      (graph as any)._stateDirty = false;

      const otherState = createEmptyState();
      otherState.observedFrontier.set('writer-2', 5);

      graph.join(otherState);

      expect((graph)._versionVector.get('writer-1')).toBe(3);
      expect((graph)._versionVector.get('writer-2')).toBe(5);
    });
  });

  // --------------------------------------------------------------------------
  // 3b. _onPatchCommitted dirty path clears _cachedViewHash (B108)
  // --------------------------------------------------------------------------
  describe('_onPatchCommitted dirty path', () => {
    it('clears _cachedViewHash when taking the dirty path', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      // No cached state → dirty path
      (graph)._cachedViewHash = 'stale-hash';

      await (graph as any)._onPatchCommitted('writer-1', {});

      expect((graph)._cachedViewHash).toBeNull();
      expect((graph as any)._stateDirty).toBe(true);
    });
  });

  describe('_onPatchCommitted eager path', () => {
    it('passes computed diff to _setMaterializedState when audit is disabled', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      (graph as any)._cachedState = createEmptyState();
      (graph as any)._stateDirty = false;
      (graph as any)._provenanceIndex = null;
      (graph as any)._lastFrontier = null;

      const setStateSpy = vi
        .spyOn(graph, ('_setMaterializedState' as any))
        .mockResolvedValue(({} as any));

      const committedPatch = {
        schema: 2,
        writer: 'writer-1',
        lamport: 1,
        context: { 'writer-1': 1 },
        ops: [
          {
            type: 'NodeAdd',
            node: 'user:alice',
            dot: Dot.create('writer-1', 1),
          },
        ],
      };

      await (graph as any)._onPatchCommitted('writer-1', {
        patch: committedPatch,
        sha: 'a'.repeat(40),
      });

      expect(setStateSpy).toHaveBeenCalledTimes(1);
      const [, options] = (setStateSpy.mock.calls[0] as [unknown, any]);
      expect(options).toBeDefined();
      expect(options.diff).toBeDefined();
      expect(options.diff.nodesAdded).toContain('user:alice');
    });

    it('passes diff:null to _setMaterializedState when audit is enabled', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      (graph as any)._cachedState = createEmptyState();
      (graph as any)._stateDirty = false;
      (graph as any)._provenanceIndex = null;
      (graph as any)._lastFrontier = null;
      const commitSpy = vi.fn().mockResolvedValue(undefined);
      (graph as any)._auditService = { commit: commitSpy };

      const setStateSpy = vi
        .spyOn(graph, ('_setMaterializedState' as any))
        .mockResolvedValue(({} as any));

      const committedPatch = {
        schema: 2,
        writer: 'writer-1',
        lamport: 2,
        context: { 'writer-1': 2 },
        ops: [
          {
            type: 'NodeAdd',
            node: 'user:bob',
            dot: Dot.create('writer-1', 2),
          },
        ],
      };

      await (graph as any)._onPatchCommitted('writer-1', {
        patch: committedPatch,
        sha: 'b'.repeat(40),
      });

      expect(setStateSpy).toHaveBeenCalledTimes(1);
      const [, options] = (setStateSpy.mock.calls[0] as unknown[]);
      expect(options).toEqual({ diff: null });
      expect(commitSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('_setMaterializedState diff argument compatibility', () => {
    it('accepts legacy positional diff argument', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const state = createEmptyState();
      const diff = {
        nodesAdded: ['user:alice'],
        nodesRemoved: [],
        edgesAdded: [],
        edgesRemoved: [],
        propsChanged: [],
      };

      const buildViewSpy = vi
        .spyOn(graph, ('_buildViewFromResult' as any))
        .mockImplementation(() => {});

      await (graph)._setMaterializedState(state, diff);

      expect(buildViewSpy).toHaveBeenCalledTimes(1);
      const [resultArg]: any[] = (buildViewSpy.mock.calls[0] as any) ?? [];
      expect(resultArg.diff).toBe(diff);
    });

    it('accepts options object with diff', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const state = createEmptyState();
      const diff = {
        nodesAdded: ['user:bob'],
        nodesRemoved: [],
        edgesAdded: [],
        edgesRemoved: [],
        propsChanged: [],
      };

      const buildViewSpy = vi
        .spyOn(graph, ('_buildViewFromResult' as any))
        .mockImplementation(() => {});

      await (graph)._setMaterializedState(state, { diff });

      expect(buildViewSpy).toHaveBeenCalledTimes(1);
      const [resultArg]: any[] = (buildViewSpy.mock.calls[0] as any) ?? [];
      expect(resultArg.diff).toBe(diff);
    });
  });

  // --------------------------------------------------------------------------
  // 4. maybeRunGC()
  // --------------------------------------------------------------------------
  describe('maybeRunGC', () => {
    it('returns ran: false when no cached state exists', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const result = graph.maybeRunGC();

      expect(result).toEqual({ ran: false, result: null, reasons: [] });
    });

    it('returns ran: false when GC policy thresholds are not met', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      // Set up a minimal cached state — empty state has no tombstones
      (graph as any)._cachedState = createEmptyState();

      const result = graph.maybeRunGC();

      expect(result.ran).toBe(false);
      expect(result.result).toBeNull();
      expect(result.reasons).toEqual([]);
    });

    it('runs GC when tombstone ratio threshold is exceeded', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
        gcPolicy: {
          tombstoneRatioThreshold: 0.0,
          entryCountThreshold: 0,
          minPatchesSinceCompaction: 0,
          maxTicksSinceCompaction: 0,
        },
      });

      // Set up state with a node that has a dot (so metrics show entries)
      const state = createEmptyState();
      const dot = Dot.create('writer-1', 1);
      state.nodeAlive.add('user:alice', dot);
      (graph as any)._cachedState = state;

      // Force high patchesSinceGC and time since GC to trigger thresholds
      (graph)._patchesSinceGC = 10000;
      (graph)._lastGCLamport = 0;

      const result = graph.maybeRunGC();

      expect(result.ran).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.reasons.length).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // 5. getGCMetrics()
  // --------------------------------------------------------------------------
  describe('getGCMetrics', () => {
    it('returns null when no cached state exists', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      expect(graph.getGCMetrics()).toBeNull();
    });

    it('returns metrics when cached state exists', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const state = createEmptyState();
      const dot = Dot.create('writer-1', 1);
      state.nodeAlive.add('user:alice', dot);
      (graph as any)._cachedState = state;

            const metrics = (graph.getGCMetrics()) as any;

      expect(metrics).not.toBeNull();
      expect(metrics.nodeCount).toBe(1);
      expect(metrics.edgeCount).toBe(0);
      expect(metrics.tombstoneCount).toBe(0);
      expect(metrics.tombstoneRatio).toBe(0);
    });

    it('includes patchesSinceCompaction and lastCompactionLamport', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      (graph as any)._cachedState = createEmptyState();
      (graph)._patchesSinceGC = 42;
      (graph)._lastGCLamport = 1234567890;

            const metrics = (graph.getGCMetrics()) as any;

      expect(metrics.patchesSinceCompaction).toBe(42);
      expect(metrics.lastCompactionLamport).toBe(1234567890);
    });
  });

  // --------------------------------------------------------------------------
  // 6. gcPolicy getter
  // --------------------------------------------------------------------------
  describe('get gcPolicy', () => {
    it('returns default GC policy when none provided', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

            const policy = (graph.gcPolicy) as any;

      expect(policy.enabled).toBe(false);
      expect(policy.tombstoneRatioThreshold).toBe(0.3);
      expect(policy.entryCountThreshold).toBe(50000);
      expect(policy.minPatchesSinceCompaction).toBe(1000);
      expect(policy.maxTicksSinceCompaction).toBe(10000);
      expect(policy.compactOnCheckpoint).toBe(true);
    });

    it('returns custom GC policy when provided', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
        gcPolicy: {
          enabled: true,
          tombstoneRatioThreshold: 0.5,
        },
      });

            const policy = (graph.gcPolicy) as any;

      expect(policy.enabled).toBe(true);
      expect(policy.tombstoneRatioThreshold).toBe(0.5);
      // Other defaults remain
      expect(policy.entryCountThreshold).toBe(50000);
    });

    it('returns an immutable policy (mutations do not affect the graph)', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const policy1 = graph.gcPolicy;

      // GCPolicy instances are Object.frozen in the constructor, so
      // any attempt to mutate the returned instance throws under
      // strict mode (which modules run in by default).
      expect(() => {
        (policy1 as any).enabled = true;
      }).toThrow(TypeError);

      const policy2 = graph.gcPolicy;
      expect(policy2.enabled).toBe(false);
      expect(policy2.tombstoneRatioThreshold).toBe(0.3);
    });
  });

  // --------------------------------------------------------------------------
  // 7. syncNeeded()
  // --------------------------------------------------------------------------
  describe('syncNeeded', () => {
    it('returns false when local and remote frontiers match', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const writerSha = 'a'.repeat(40);

      // discoverWriters returns one writer
      persistence.listRefs.mockResolvedValue(['refs/warp/test-graph/writers/writer-1']);
      persistence.readRef.mockResolvedValue(writerSha);

      const remoteFrontier = new Map([['writer-1', writerSha]]);
      const needed = await graph.syncNeeded(remoteFrontier);

      expect(needed).toBe(false);
    });

    it('returns true when remote has a writer not in local', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      // Local has no writers
      persistence.listRefs.mockResolvedValue([]);

      const remoteFrontier = new Map([['writer-2', 'b'.repeat(40)]]);
      const needed = await graph.syncNeeded(remoteFrontier);

      expect(needed).toBe(true);
    });

    it('returns true when local has a writer not in remote', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const writerSha = 'a'.repeat(40);
      persistence.listRefs.mockResolvedValue(['refs/warp/test-graph/writers/writer-1']);
      persistence.readRef.mockResolvedValue(writerSha);

      const remoteFrontier = new Map();
      const needed = await graph.syncNeeded(remoteFrontier);

      expect(needed).toBe(true);
    });

    it('returns true when same writer has different SHAs', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const localSha = 'a'.repeat(40);
      const remoteSha = 'b'.repeat(40);

      persistence.listRefs.mockResolvedValue(['refs/warp/test-graph/writers/writer-1']);
      persistence.readRef.mockResolvedValue(localSha);

      const remoteFrontier = new Map([['writer-1', remoteSha]]);
      const needed = await graph.syncNeeded(remoteFrontier);

      expect(needed).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 8. getPropertyCount()
  // --------------------------------------------------------------------------
  describe('getPropertyCount', () => {
    it('throws E_NO_STATE when no cached state exists', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
        autoMaterialize: false,
      });

      await expect(graph.getPropertyCount()).rejects.toMatchObject({ code: 'E_NO_STATE' });
    });

    it('returns 0 for empty state', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      (graph as any)._cachedState = createEmptyState();

      const count = await graph.getPropertyCount();

      expect(count).toBe(0);
    });

    it('returns correct count when properties exist', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const state = createEmptyState();
      state.nodeAlive.add('user:alice', Dot.create('writer-1', 1));
      state.nodeAlive.add('user:bob', Dot.create('writer-1', 2));
      state.mutatePropLWW('user:alice\0name', ('writer-1:1' as any), 'Alice');
      state.mutatePropLWW('user:alice\0age', ('writer-1:2' as any), 30);
      state.mutatePropLWW('user:bob\0name', ('writer-1:3' as any), 'Bob');
      (graph as any)._cachedState = state;

      const count = await graph.getPropertyCount();

      expect(count).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // 9. createWormhole()
  // --------------------------------------------------------------------------
  describe('createWormhole', () => {
    it('delegates to WormholeService with correct arguments', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const fromSha = 'a'.repeat(40);
      const toSha = 'b'.repeat(40);
      const patchOid = 'c'.repeat(40);

      // createWormhole walks the commit chain from toSha back to fromSha.
      // We need to mock the commit chain for the WormholeService.
      // The service calls persistence.getNodeInfo for each commit.
      const mockPatch = createMockPatch({
        sha: toSha,
        graphName: 'test-graph',
        writerId: 'writer-1',
        lamport: 2,
        patchOid,
        ops: [{ type: 'NodeAdd', node: 'user:alice', dot: 'writer-1:2' }],
        parentSha: fromSha,
      });

      const rootPatch = createMockPatch({
        sha: fromSha,
        graphName: 'test-graph',
        writerId: 'writer-1',
        lamport: 1,
        patchOid: 'd'.repeat(40),
        ops: [],
        parentSha: null,
      });

      persistence.getNodeInfo
        .mockResolvedValueOnce(mockPatch.nodeInfo)  // toSha
        .mockResolvedValueOnce(rootPatch.nodeInfo);  // fromSha

      persistence.readBlob
        .mockResolvedValueOnce(mockPatch.patchBuffer)
        .mockResolvedValueOnce(rootPatch.patchBuffer);

      const wormhole = await graph.createWormhole(fromSha, toSha);

      expect(wormhole).toBeDefined();
      expect(wormhole.patchCount).toBeGreaterThanOrEqual(0);
    });
  });

  // --------------------------------------------------------------------------
  // 10. loadPatchBySha()
  // --------------------------------------------------------------------------
  describe('loadPatchBySha', () => {
    it('loads and decodes a patch by SHA', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const sha = 'a'.repeat(40);
      const patchOid = 'b'.repeat(40);

      const mockPatch = createMockPatch({
        sha,
        graphName: 'test-graph',
        writerId: 'writer-1',
        lamport: 1,
        patchOid,
        ops: [{ type: 'NodeAdd', node: 'user:alice', dot: { writerId: 'writer-1', counter: 1 } }],
      });

      persistence.getNodeInfo.mockResolvedValue(mockPatch.nodeInfo);
      persistence.readBlob.mockResolvedValue(mockPatch.patchBuffer);

      const patch = (await graph.loadPatchBySha(sha) as any);

      expect(patch).toBeDefined();
      expect(patch.schema).toBe(2);
      expect(patch.writer).toBe('writer-1');
      expect(patch.lamport).toBe(1);
      expect(patch.ops).toHaveLength(1);
      expect(patch.ops[0].type).toBe('NodeAdd');
      expect(patch.ops[0].node).toBe('user:alice');
    });

    it('throws when commit is not a patch', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const sha = 'a'.repeat(40);

      // Return a checkpoint message instead of a patch
      persistence.getNodeInfo.mockResolvedValue({
        sha,
        message: `warp:checkpoint\n\neg-kind: checkpoint\neg-graph: test-graph\neg-state-hash: ${'c'.repeat(64)}\neg-frontier-oid: ${'d'.repeat(40)}\neg-schema: 2`,
        parents: [],
      });

      await expect(graph.loadPatchBySha(sha)).rejects.toThrow(`Commit ${sha} is not a patch`);
    });

    it('throws when getNodeInfo fails', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const sha = 'a'.repeat(40);
      persistence.getNodeInfo.mockRejectedValue(new Error('not found'));

      await expect(graph.loadPatchBySha(sha)).rejects.toThrow('not found');
    });
  });

  // --------------------------------------------------------------------------
  // 11. temporal getter
  // --------------------------------------------------------------------------
  describe('get temporal', () => {
    it('returns a TemporalQuery instance', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const temporal = graph.temporal;

      expect(temporal).toBeDefined();
      expect(typeof temporal.always).toBe('function');
      expect(typeof temporal.eventually).toBe('function');
    });

    it('returns the same instance on subsequent accesses (lazy singleton)', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const temporal1 = graph.temporal;
      const temporal2 = graph.temporal;

      expect(temporal1).toBe(temporal2);
    });

    it('temporal.eventually exercises loadAllPatches callback', async () => {
      const patchOid = 'e'.repeat(40);
      const sha1 = 'a'.repeat(40);

      const mockPatch = createMockPatch({
        sha: sha1,
        graphName: 'test-graph',
        writerId: 'writer-1',
        lamport: 1,
        patchOid,
        ops: [{ type: 'NodeAdd', node: 'user:alice', dot: Dot.create('writer-1', 1) }],
      });

      persistence.listRefs.mockResolvedValue(['refs/warp/test-graph/writers/writer-1']);
      persistence.readRef.mockResolvedValue(sha1);
      persistence.getNodeInfo
        .mockResolvedValueOnce(mockPatch.nodeInfo)
        .mockResolvedValueOnce({ ...mockPatch.nodeInfo, parents: [] });
      persistence.readBlob.mockResolvedValue(mockPatch.patchBuffer);

      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
        autoMaterialize: false,
      });

      // Eventually: did user:alice ever exist?
      const result = await graph.temporal.eventually('user:alice', () => true);
      expect(result).toBe(true);
    });

    it('temporal.always exercises loadAllPatches and returns false for empty history', async () => {
      persistence.listRefs.mockResolvedValue([]);

      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
        autoMaterialize: false,
      });

      // Always: does a non-existent node satisfy the predicate?
      // With no patches, always returns false (node never exists)
      const result = await graph.temporal.always('user:ghost', () => true);
      expect(result).toBe(false);
    });

    it('temporal checkpoint loader returns null when no checkpoint exists', async () => {
      persistence.listRefs.mockResolvedValue([]);

      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
        autoMaterialize: false,
      });

      const loadLatestCheckpointSpy = vi
        .spyOn((graph), '_loadLatestCheckpoint')
        .mockResolvedValue(null);

      const result = await graph.temporal.always('user:ghost', () => true, { since: 1 });

      expect(result).toBe(false);
      expect(loadLatestCheckpointSpy).toHaveBeenCalledOnce();
    });

    it('temporal checkpoint loader computes maxLamport when a checkpoint exists', async () => {
      persistence.listRefs.mockResolvedValue([]);

      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
        autoMaterialize: false,
      });

      const checkpointState = createEmptyState();
      const loadLatestCheckpointSpy = vi
        .spyOn((graph), '_loadLatestCheckpoint')
        .mockResolvedValue({ state: checkpointState } as any);
      const maxLamportSpy = vi
        .spyOn((graph), '_maxLamportFromState')
        .mockReturnValue(1);

      const result = await graph.temporal.always('user:ghost', () => true, { since: 1 });

      expect(result).toBe(false);
      expect(loadLatestCheckpointSpy).toHaveBeenCalledOnce();
      expect(maxLamportSpy).toHaveBeenCalledWith(checkpointState);
    });
  });

  // --------------------------------------------------------------------------
  // 12. _extractTrustedWriters
  // --------------------------------------------------------------------------
  describe('_extractTrustedWriters', () => {
    it('extracts trusted writer IDs from assessment', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const assessment = {
        trust: {
          explanations: [
            { writerId: 'alice', trusted: true },
            { writerId: 'bob', trusted: false },
            { writerId: 'charlie', trusted: true },
          ],
        },
      };

      const result = (graph)._extractTrustedWriters(assessment);

      expect(result.trusted).toBeInstanceOf(Set);
      expect(result.trusted.size).toBe(2);
      expect(result.trusted.has('alice')).toBe(true);
      expect(result.trusted.has('charlie')).toBe(true);
      expect(result.trusted.has('bob')).toBe(false);
    });

    it('returns empty set when no writers are trusted', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const assessment = {
        trust: {
          explanations: [
            { writerId: 'alice', trusted: false },
            { writerId: 'bob', trusted: false },
          ],
        },
      };

      const result = (graph)._extractTrustedWriters(assessment);

      expect(result.trusted.size).toBe(0);
    });

    it('returns empty set for empty explanations', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const result = (graph)._extractTrustedWriters({
        trust: { explanations: [] },
      });

      expect(result.trusted.size).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 13. _maxLamportFromState
  // --------------------------------------------------------------------------
  describe('_maxLamportFromState', () => {
    it('returns 0 for empty frontier', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const state = createEmptyState();
      const result = (graph)._maxLamportFromState(state);

      expect(result).toBe(0);
    });

    it('returns the maximum Lamport value from the frontier', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const state = createEmptyState();
      state.observedFrontier.set('w1', 3);
      state.observedFrontier.set('w2', 10);
      state.observedFrontier.set('w3', 7);

      const result = (graph)._maxLamportFromState(state);

      expect(result).toBe(10);
    });

    it('handles single writer frontier', async () => {
      const graph = await openRuntimeHostProduct({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const state = createEmptyState();
      state.observedFrontier.set('w1', 42);

      const result = (graph)._maxLamportFromState(state);

      expect(result).toBe(42);
    });
  });
});
