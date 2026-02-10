import { describe, it, expect, vi, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { encode } from '../../../src/infrastructure/codecs/CborCodec.js';
import { encodePatchMessage } from '../../../src/domain/services/WarpMessageCodec.js';
import { createEmptyStateV5 } from '../../../src/domain/services/JoinReducer.js';
import { createORSet, orsetAdd } from '../../../src/domain/crdt/ORSet.js';
import { createDot } from '../../../src/domain/crdt/Dot.js';
import { createVersionVector } from '../../../src/domain/crdt/VersionVector.js';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.js';

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
function createMockPatch({ sha, graphName, writerId, lamport, patchOid, ops, parentSha = null, context = null }) {
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

describe('WarpGraph coverage gaps', () => {
  /** @type {any} */
  let persistence;

  beforeEach(() => {
    persistence = createMockPersistence();
  });

  // --------------------------------------------------------------------------
  // 1. seekCache getter
  // --------------------------------------------------------------------------
  describe('get seekCache', () => {
    it('returns null when no seek cache is set', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      expect(graph.seekCache).toBeNull();
    });

    it('returns the seek cache passed at construction', async () => {
      /** @type {any} */
      const mockCache = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
      const graph = await WarpGraph.open({
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
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      expect(graph.seekCache).toBeNull();

      /** @type {any} */
      const mockCache = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
      graph.setSeekCache(mockCache);

      expect(graph.seekCache).toBe(mockCache);
    });

    it('replaces an existing seek cache', async () => {
      /** @type {any} */
      const cache1 = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
      /** @type {any} */
      const cache2 = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };

      const graph = await WarpGraph.open({
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
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const otherState = createEmptyStateV5();

      expect(() => graph.join(otherState)).toThrow('No cached state');
    });

    it('throws when otherState is null', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      /** @type {any} */ (graph)._cachedState = createEmptyStateV5();

      expect(() => graph.join(/** @type {any} */ (null))).toThrow('Invalid state');
    });

    it('throws when otherState is missing nodeAlive', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      /** @type {any} */ (graph)._cachedState = createEmptyStateV5();

      expect(() => graph.join(/** @type {any} */ ({ edgeAlive: createORSet() }))).toThrow('Invalid state');
    });

    it('throws when otherState is missing edgeAlive', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      /** @type {any} */ (graph)._cachedState = createEmptyStateV5();

      expect(() => graph.join(/** @type {any} */ ({ nodeAlive: createORSet() }))).toThrow('Invalid state');
    });

    it('merges two empty states and returns zero-change receipt', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      /** @type {any} */ (graph)._cachedState = createEmptyStateV5();
      const otherState = createEmptyStateV5();

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
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      /** @type {any} */ (graph)._cachedState = createEmptyStateV5();

      const otherState = createEmptyStateV5();
      const dot = createDot('writer-2', 1);
      orsetAdd(otherState.nodeAlive, 'user:alice', dot);

      const { receipt } = graph.join(otherState);

      expect(receipt.nodesAdded).toBe(1);
      expect(receipt.nodesRemoved).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 4. maybeRunGC()
  // --------------------------------------------------------------------------
  describe('maybeRunGC', () => {
    it('returns ran: false when no cached state exists', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const result = graph.maybeRunGC();

      expect(result).toEqual({ ran: false, result: null, reasons: [] });
    });

    it('returns ran: false when GC policy thresholds are not met', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      // Set up a minimal cached state — empty state has no tombstones
      /** @type {any} */ (graph)._cachedState = createEmptyStateV5();

      const result = graph.maybeRunGC();

      expect(result.ran).toBe(false);
      expect(result.result).toBeNull();
      expect(result.reasons).toEqual([]);
    });

    it('runs GC when tombstone ratio threshold is exceeded', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
        gcPolicy: {
          tombstoneRatioThreshold: 0.0,
          entryCountThreshold: 0,
          minPatchesSinceCompaction: 0,
          maxTimeSinceCompaction: 0,
        },
      });

      // Set up state with a node that has a dot (so metrics show entries)
      const state = createEmptyStateV5();
      const dot = createDot('writer-1', 1);
      orsetAdd(state.nodeAlive, 'user:alice', dot);
      /** @type {any} */ (graph)._cachedState = state;

      // Force high patchesSinceGC and time since GC to trigger thresholds
      /** @type {any} */ (graph)._patchesSinceGC = 10000;
      /** @type {any} */ (graph)._lastGCTime = 0;

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
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      expect(graph.getGCMetrics()).toBeNull();
    });

    it('returns metrics when cached state exists', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const state = createEmptyStateV5();
      const dot = createDot('writer-1', 1);
      orsetAdd(state.nodeAlive, 'user:alice', dot);
      /** @type {any} */ (graph)._cachedState = state;

      /** @type {any} */
      const metrics = graph.getGCMetrics();

      expect(metrics).not.toBeNull();
      expect(metrics.nodeEntries).toBe(1);
      expect(metrics.edgeEntries).toBe(0);
      expect(metrics.totalEntries).toBe(1);
      expect(metrics.tombstoneRatio).toBe(0);
    });

    it('includes patchesSinceCompaction and lastCompactionTime', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      /** @type {any} */ (graph)._cachedState = createEmptyStateV5();
      /** @type {any} */ (graph)._patchesSinceGC = 42;
      /** @type {any} */ (graph)._lastGCTime = 1234567890;

      /** @type {any} */
      const metrics = graph.getGCMetrics();

      expect(metrics.patchesSinceCompaction).toBe(42);
      expect(metrics.lastCompactionTime).toBe(1234567890);
    });
  });

  // --------------------------------------------------------------------------
  // 6. gcPolicy getter
  // --------------------------------------------------------------------------
  describe('get gcPolicy', () => {
    it('returns default GC policy when none provided', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      /** @type {any} */
      const policy = graph.gcPolicy;

      expect(policy.enabled).toBe(false);
      expect(policy.tombstoneRatioThreshold).toBe(0.3);
      expect(policy.entryCountThreshold).toBe(50000);
      expect(policy.minPatchesSinceCompaction).toBe(1000);
      expect(policy.maxTimeSinceCompaction).toBe(86400000);
      expect(policy.compactOnCheckpoint).toBe(true);
    });

    it('returns custom GC policy when provided', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
        gcPolicy: {
          enabled: true,
          tombstoneRatioThreshold: 0.5,
        },
      });

      /** @type {any} */
      const policy = graph.gcPolicy;

      expect(policy.enabled).toBe(true);
      expect(policy.tombstoneRatioThreshold).toBe(0.5);
      // Other defaults remain
      expect(policy.entryCountThreshold).toBe(50000);
    });

    it('returns a defensive copy (mutations do not affect the graph)', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      /** @type {any} */
      const policy1 = graph.gcPolicy;
      policy1.enabled = true;
      policy1.tombstoneRatioThreshold = 0.99;

      /** @type {any} */
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
      const graph = await WarpGraph.open({
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
      const graph = await WarpGraph.open({
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
      const graph = await WarpGraph.open({
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
      const graph = await WarpGraph.open({
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
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      await expect(graph.getPropertyCount()).rejects.toThrow('No cached state');
    });

    it('returns 0 for empty state', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      /** @type {any} */ (graph)._cachedState = createEmptyStateV5();

      const count = await graph.getPropertyCount();

      expect(count).toBe(0);
    });

    it('returns correct count when properties exist', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const state = createEmptyStateV5();
      state.prop.set('user:alice\0name', { value: 'Alice', eventId: /** @type {any} */ ('writer-1:1') });
      state.prop.set('user:alice\0age', { value: 30, eventId: /** @type {any} */ ('writer-1:2') });
      state.prop.set('user:bob\0name', { value: 'Bob', eventId: /** @type {any} */ ('writer-1:3') });
      /** @type {any} */ (graph)._cachedState = state;

      const count = await graph.getPropertyCount();

      expect(count).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // 9. createWormhole()
  // --------------------------------------------------------------------------
  describe('createWormhole', () => {
    it('delegates to WormholeService with correct arguments', async () => {
      const graph = await WarpGraph.open({
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
      const graph = await WarpGraph.open({
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
        ops: [{ type: 'NodeAdd', node: 'user:alice', dot: 'writer-1:1' }],
      });

      persistence.getNodeInfo.mockResolvedValue(mockPatch.nodeInfo);
      persistence.readBlob.mockResolvedValue(mockPatch.patchBuffer);

      const patch = /** @type {any} */ (await graph.loadPatchBySha(sha));

      expect(patch).toBeDefined();
      expect(patch.schema).toBe(2);
      expect(patch.writer).toBe('writer-1');
      expect(patch.lamport).toBe(1);
      expect(patch.ops).toHaveLength(1);
      expect(patch.ops[0].type).toBe('NodeAdd');
      expect(patch.ops[0].node).toBe('user:alice');
    });

    it('throws when commit is not a patch', async () => {
      const graph = await WarpGraph.open({
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
      const graph = await WarpGraph.open({
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
      const graph = await WarpGraph.open({
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
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer-1',
        crypto,
      });

      const temporal1 = graph.temporal;
      const temporal2 = graph.temporal;

      expect(temporal1).toBe(temporal2);
    });
  });
});
