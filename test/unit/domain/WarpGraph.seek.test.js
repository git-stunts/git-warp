import { describe, it, expect, vi, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { encode } from '../../../src/infrastructure/codecs/CborCodec.js';
import { encodePatchMessage } from '../../../src/domain/services/WarpMessageCodec.js';
import { createMockPersistence } from '../../helpers/warpGraphTestUtils.js';

/**
 * Creates a minimal schema:2 patch object.
 */
function createPatch(/** @type {any} */ writer, /** @type {any} */ lamport, /** @type {any} */ nodeId) {
  return {
    schema: 2,
    writer,
    lamport,
    context: { [writer]: lamport },
    ops: [{ type: 'NodeAdd', node: nodeId, dot: { writer, counter: lamport } }],
  };
}

/**
 * A fake 40-char hex SHA for use in tests.
 */
function fakeSha(/** @type {any} */ label) {
  const hex = Buffer.from(String(label)).toString('hex');
  return hex.padEnd(40, 'a').slice(0, 40);
}

/**
 * Sets up persistence mocks for multiple writers at once.
 * Each writer gets `count` patches with lamport 1..count.
 *
 * @param {any} persistence - Mock persistence
 * @param {any} writerSpecs - { writerId: count, ... }
 * @param {string} [graphName='test']
 * @returns {any} writerTips - { writerId: tipSha, ... }
 */
function setupMultiWriterPersistence(persistence, writerSpecs, graphName = 'test') {
  const nodeInfoMap = new Map();
  const blobMap = new Map();
  const writerTips = {};

  for (const [writer, count] of Object.entries(writerSpecs)) {
    const shas = [];
    for (let i = 1; i <= count; i++) {
      shas.push(fakeSha(`${writer}${i}`));
    }
    /** @type {any} */ (writerTips)[writer] = shas[0];

    // shas[0] = tip (newest, highest lamport)
    // shas[count-1] = oldest (lamport=1)
    for (let j = 0; j < count; j++) {
      const lamport = count - j; // tip has highest lamport
      const patchOid = fakeSha(`blob-${writer}-${lamport}`);
      const message = encodePatchMessage({
        graph: graphName,
        writer,
        lamport,
        patchOid,
        schema: 2,
      });
      const parents = j < count - 1 ? [shas[j + 1]] : [];
      nodeInfoMap.set(shas[j], { message, parents });

      const patch = createPatch(writer, lamport, `n:${writer}:${lamport}`);
      blobMap.set(patchOid, encode(patch));
    }
  }

  const writerRefs = Object.keys(writerSpecs).map(
    (w) => `refs/warp/${graphName}/writers/${w}`
  );

  persistence.getNodeInfo.mockImplementation((/** @type {any} */ sha) => {
    const info = nodeInfoMap.get(sha);
    if (info) {
      return Promise.resolve(info);
    }
    return Promise.resolve({ message: '', parents: [] });
  });

  persistence.readBlob.mockImplementation((/** @type {any} */ oid) => {
    const buf = blobMap.get(oid);
    if (buf) {
      return Promise.resolve(buf);
    }
    return Promise.resolve(Buffer.alloc(0));
  });

  persistence.readRef.mockImplementation((/** @type {any} */ ref) => {
    if (ref === `refs/warp/${graphName}/checkpoints/head`) {
      return Promise.resolve(null);
    }
    for (const [writer, tip] of Object.entries(writerTips)) {
      if (ref === `refs/warp/${graphName}/writers/${writer}`) {
        return Promise.resolve(tip);
      }
    }
    return Promise.resolve(null);
  });

  persistence.listRefs.mockImplementation((/** @type {any} */ prefix) => {
    if (prefix.startsWith(`refs/warp/${graphName}/writers`)) {
      return Promise.resolve(writerRefs);
    }
    return Promise.resolve([]);
  });

  return writerTips;
}

describe('WarpGraph.seek (time-travel)', () => {
  /** @type {any} */
  let persistence;

  beforeEach(() => {
    persistence = createMockPersistence();
  });

  // --------------------------------------------------------------------------
  // discoverTicks()
  // --------------------------------------------------------------------------

  describe('discoverTicks()', () => {
    it('returns correct sorted ticks for a multi-writer graph', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'w1',
      });

      setupMultiWriterPersistence(persistence, { alice: 3, bob: 2 });

      const result = await graph.discoverTicks();

      expect(result.ticks).toEqual([1, 2, 3]);
      expect(result.maxTick).toBe(3);
    });

    it('returns empty result for a graph with no writers', async () => {
      persistence.listRefs.mockResolvedValue([]);
      persistence.readRef.mockResolvedValue(null);

      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'w1',
      });

      const result = await graph.discoverTicks();

      expect(result.ticks).toEqual([]);
      expect(result.maxTick).toBe(0);
      expect(result.perWriter.size).toBe(0);
    });

    it('returns per-writer breakdown', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'w1',
      });

      const tips = setupMultiWriterPersistence(persistence, { alice: 2, bob: 3 });

      const result = await graph.discoverTicks();

      expect(/** @type {any} */ (result).perWriter.get('alice').ticks).toEqual([1, 2]);
      expect(/** @type {any} */ (result).perWriter.get('bob').ticks).toEqual([1, 2, 3]);
      expect(/** @type {any} */ (result).perWriter.get('alice').tipSha).toBe(tips.alice);
    });
  });

  // --------------------------------------------------------------------------
  // materialize({ ceiling })
  // --------------------------------------------------------------------------

  describe('materialize({ ceiling })', () => {
    it('includes only patches at or below the ceiling', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'w1',
      });

      setupMultiWriterPersistence(persistence, { alice: 3 });

      const state = /** @type {any} */ (await graph.materialize({ ceiling: 2 }));

      const nodeIds = [...state.nodeAlive.entries.keys()];
      expect(nodeIds).toHaveLength(2);
      expect(nodeIds).toContain('n:alice:1');
      expect(nodeIds).toContain('n:alice:2');
      expect(nodeIds).not.toContain('n:alice:3');
    });

    it('ceiling of 0 returns empty state', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'w1',
      });

      setupMultiWriterPersistence(persistence, { alice: 3 });

      const state = /** @type {any} */ (await graph.materialize({ ceiling: 0 }));

      expect(state.nodeAlive.entries.size).toBe(0);
    });

    it('ceiling above maxTick yields same as full materialization', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'w1',
      });

      setupMultiWriterPersistence(persistence, { alice: 3 });

      const fullState = /** @type {any} */ (await graph.materialize());
      const fullNodes = [...fullState.nodeAlive.entries.keys()].sort();

      // Force cache invalidation for second call
      /** @type {any} */ (graph)._stateDirty = true;
      /** @type {any} */ (graph)._cachedCeiling = null;
      const ceilingState = /** @type {any} */ (await graph.materialize({ ceiling: 999 }));
      const ceilingNodes = [...ceilingState.nodeAlive.entries.keys()].sort();

      expect(ceilingNodes).toEqual(fullNodes);
    });

    it('multi-writer ceiling includes correct cross-writer patches', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'w1',
      });

      setupMultiWriterPersistence(persistence, { alice: 2, bob: 3 });

      const state = /** @type {any} */ (await graph.materialize({ ceiling: 2 }));

      const nodeIds = [...state.nodeAlive.entries.keys()].sort();
      // alice:1, alice:2, bob:1, bob:2 = 4 nodes
      expect(nodeIds).toHaveLength(4);
      expect(nodeIds).toContain('n:alice:1');
      expect(nodeIds).toContain('n:alice:2');
      expect(nodeIds).toContain('n:bob:1');
      expect(nodeIds).toContain('n:bob:2');
      expect(nodeIds).not.toContain('n:bob:3');
    });

    it('cache invalidation: different ceilings produce different states', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'w1',
      });

      setupMultiWriterPersistence(persistence, { alice: 3 });

      const stateA = /** @type {any} */ (await graph.materialize({ ceiling: 1 }));
      const nodesA = stateA.nodeAlive.entries.size;

      const stateB = /** @type {any} */ (await graph.materialize({ ceiling: 3 }));
      const nodesB = stateB.nodeAlive.entries.size;

      expect(nodesA).toBe(1);
      expect(nodesB).toBe(3);
    });

    it('cache hit: same ceiling returns cached state without re-materialize', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'w1',
      });

      setupMultiWriterPersistence(persistence, { alice: 3 });

      await graph.materialize({ ceiling: 2 });
      const callCountAfterFirst = persistence.getNodeInfo.mock.calls.length;

      await graph.materialize({ ceiling: 2 });
      const callCountAfterSecond = persistence.getNodeInfo.mock.calls.length;

      // Should not have made additional persistence calls (cache hit)
      expect(callCountAfterSecond).toBe(callCountAfterFirst);
    });

    it('_seekCeiling is used when no explicit ceiling is passed', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'w1',
      });

      setupMultiWriterPersistence(persistence, { alice: 3 });

      /** @type {any} */ (graph)._seekCeiling = 1;
      const state = /** @type {any} */ (await graph.materialize());

      expect(state.nodeAlive.entries.size).toBe(1);
    });

    it('explicit ceiling overrides _seekCeiling', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'w1',
      });

      setupMultiWriterPersistence(persistence, { alice: 3 });

      /** @type {any} */ (graph)._seekCeiling = 1;
      const state = /** @type {any} */ (await graph.materialize({ ceiling: 3 }));

      expect(state.nodeAlive.entries.size).toBe(3);
    });

    it('skips auto-checkpoint when ceiling is active', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'w1',
        checkpointPolicy: { every: 1 },
      });

      setupMultiWriterPersistence(persistence, { alice: 3 });

      const spy = vi.spyOn(graph, 'createCheckpoint').mockResolvedValue(fakeSha('ckpt'));

      await graph.materialize({ ceiling: 2 });

      expect(spy).not.toHaveBeenCalled();
    });

    it('cache hit with collectReceipts bypasses cache and returns real receipts', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'w1',
      });

      setupMultiWriterPersistence(persistence, { alice: 3 });

      // First call: populate the ceiling cache
      await graph.materialize({ ceiling: 2 });
      const callCountAfterFirst = persistence.getNodeInfo.mock.calls.length;

      // Second call: same ceiling but with receipts — must NOT use cache
      const result = /** @type {any} */ (await graph.materialize({ ceiling: 2, receipts: true }));

      expect(result.state).toBeDefined();
      expect(Array.isArray(result.receipts)).toBe(true);
      // Must have re-materialized (not returned empty receipts from cache)
      const callCountAfterSecond = persistence.getNodeInfo.mock.calls.length;
      expect(callCountAfterSecond).toBeGreaterThan(callCountAfterFirst);
    });

    it('cache is invalidated when frontier advances at the same ceiling', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'w1',
      });

      // Start with one writer
      setupMultiWriterPersistence(persistence, { alice: 3 });

      const stateA = /** @type {any} */ (await graph.materialize({ ceiling: 2 }));
      expect(stateA.nodeAlive.entries.size).toBe(2); // alice:1, alice:2

      // A new writer appears — frontier changes
      setupMultiWriterPersistence(persistence, { alice: 3, bob: 3 });

      const stateB = /** @type {any} */ (await graph.materialize({ ceiling: 2 }));
      // Must see 4 nodes (alice:1, alice:2, bob:1, bob:2), not stale 2
      expect(stateB.nodeAlive.entries.size).toBe(4);
    });

    it('explicit ceiling: null overrides _seekCeiling and materializes latest', async () => {
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'w1',
      });

      setupMultiWriterPersistence(persistence, { alice: 3 });

      /** @type {any} */ (graph)._seekCeiling = 1;
      // Passing ceiling: null should clear the ceiling, giving us all 3 nodes
      const state = /** @type {any} */ (await graph.materialize({ ceiling: null }));

      expect(state.nodeAlive.entries.size).toBe(3);
    });
  });
});
