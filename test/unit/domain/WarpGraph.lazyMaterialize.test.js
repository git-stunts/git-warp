/**
 * AP/LAZY/2 — Guard query methods with auto-materialize.
 *
 * When autoMaterialize === true and _cachedState is null or _stateDirty === true,
 * query methods should call materialize() before returning results.
 * When autoMaterialize === false, preserve current behavior (throw if no cached state).
 *
 * Tests cover:
 *   1. Fresh open + query with autoMaterialize -> results returned
 *   2. Dirty state + query -> auto-rematerializes -> fresh results
 *   3. autoMaterialize off + null state -> throws
 *   4. autoMaterialize off + materialize -> current behavior unchanged
 *   5. All query methods respect autoMaterialize
 *   6. query().run() works with autoMaterialize
 *   7. Concurrent auto-materialize calls (stretch goal)
 *   8. traverse methods work with autoMaterialize
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import QueryError from '../../../src/domain/errors/QueryError.js';
import { encodePatchMessage } from '../../../src/domain/services/WarpMessageCodec.js';
import { createEmptyStateV5, encodeEdgeKey, encodePropKey } from '../../../src/domain/services/JoinReducer.js';
import { orsetAdd } from '../../../src/domain/crdt/ORSet.js';
import { createDot } from '../../../src/domain/crdt/Dot.js';
import { createMockPersistence } from '../../helpers/warpGraphTestUtils.js';

const FAKE_BLOB_OID = 'a'.repeat(40);
const FAKE_TREE_OID = 'b'.repeat(40);
const FAKE_COMMIT_SHA = 'c'.repeat(40);

/**
 * Configure mock persistence so a first-time writer commit succeeds.
 */
function mockFirstCommit(/** @type {any} */ persistence) {
  persistence.readRef.mockResolvedValue(null);
  persistence.writeBlob.mockResolvedValue(FAKE_BLOB_OID);
  persistence.writeTree.mockResolvedValue(FAKE_TREE_OID);
  persistence.commitNodeWithTree.mockResolvedValue(FAKE_COMMIT_SHA);
  persistence.updateRef.mockResolvedValue(undefined);
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Fresh open -> query with autoMaterialize -> results returned
// ────────────────────────────────────────────────────────────────────────────

describe('AP/LAZY/2: auto-materialize guards on query methods', () => {
  describe('1. Fresh open with autoMaterialize: true -> query returns results', () => {
    /** @type {any} */
    let persistence;
    /** @type {any} */
    let graph;

    beforeEach(async () => {
      persistence = createMockPersistence();
      graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: true,
      });
    });

    it('getNodes() returns empty array without explicit materialize()', async () => {
      const nodes = await graph.getNodes();
      expect(nodes).toEqual([]);
    });

    it('hasNode() returns false without explicit materialize()', async () => {
      const result = await graph.hasNode('test:x');
      expect(result).toBe(false);
    });

    it('getEdges() returns empty array without explicit materialize()', async () => {
      const edges = await graph.getEdges();
      expect(edges).toEqual([]);
    });

    it('getNodeProps() returns null for non-existent node without explicit materialize()', async () => {
      const props = await graph.getNodeProps('test:x');
      expect(props).toBe(null);
    });

    it('neighbors() returns empty array without explicit materialize()', async () => {
      const result = await graph.neighbors('test:x');
      expect(result).toEqual([]);
    });

    it('_cachedState is populated after first query triggers auto-materialize', async () => {
      expect(/** @type {any} */ (graph)._cachedState).toBe(null);
      await graph.getNodes();
      expect(/** @type {any} */ (graph)._cachedState).not.toBe(null);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 2. Dirty state -> query -> auto-rematerializes -> fresh results
  // ────────────────────────────────────────────────────────────────────────

  describe('2. Dirty state triggers auto-rematerialization on query', () => {
    /** @type {any} */
    let persistence;
    /** @type {any} */
    let graph;

    beforeEach(async () => {
      persistence = createMockPersistence();
      graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: true,
      });
    });

    it('eagerly applied commit keeps state clean, hasNode returns true', async () => {
      // First materialize (empty state)
      await graph.materialize();

      // Commit a node — with _cachedState present, eager apply works
      mockFirstCommit(persistence);
      await (await graph.createPatch()).addNode('test:node').commit();

      // State should still be fresh (eager re-materialize)
      expect(/** @type {any} */ (graph)._stateDirty).toBe(false);
      expect(await graph.hasNode('test:node')).toBe(true);
    });

    it('dirty state auto-rematerializes on hasNode query', async () => {
      // First materialize (empty state)
      await graph.materialize();

      // Commit a node eagerly
      mockFirstCommit(persistence);
      await (await graph.createPatch()).addNode('test:node').commit();

      // Manually mark dirty to simulate external change
      /** @type {any} */ (graph)._stateDirty = true;

      // Mock listRefs to return the writer ref for rematerialization
      const patchMessage = encodePatchMessage({
        graph: 'test',
        writer: 'writer-1',
        lamport: 1,
        patchOid: FAKE_BLOB_OID,
        schema: 2,
      });
      persistence.listRefs.mockResolvedValue([
        'refs/warp/test/writers/writer-1',
      ]);
      persistence.showNode.mockResolvedValue(patchMessage);
      persistence.readBlob.mockResolvedValue(
        // Empty patch ops — we just need the codec to not blow up
        Buffer.from([0x80]), // CBOR empty array
      );
      persistence.getNodeInfo.mockResolvedValue({
        parents: [],
        message: patchMessage,
      });

      // Query should trigger auto-rematerialize (not throw)
      const result = await graph.hasNode('test:node');
      expect(typeof result).toBe('boolean');
    });

    it('auto-materialize is triggered when _stateDirty is true', async () => {
      await graph.materialize();
      /** @type {any} */ (graph)._stateDirty = true;

      const materializeSpy = vi.spyOn(graph, 'materialize');

      await graph.getNodes();

      expect(materializeSpy).toHaveBeenCalled();
    });

    it('auto-materialize is triggered when _cachedState is null', async () => {
      // Don't call materialize — _cachedState is null
      const materializeSpy = vi.spyOn(graph, 'materialize');

      await graph.getNodes();

      expect(materializeSpy).toHaveBeenCalled();
    });

    it('auto-materialize is NOT triggered when state is clean', async () => {
      await graph.materialize();
      expect(/** @type {any} */ (graph)._stateDirty).toBe(false);
      expect(/** @type {any} */ (graph)._cachedState).not.toBe(null);

      const materializeSpy = vi.spyOn(graph, 'materialize');

      await graph.getNodes();

      expect(materializeSpy).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 3. autoMaterialize off -> null state -> throws
  // ────────────────────────────────────────────────────────────────────────

  describe('3. autoMaterialize: false -> null state -> throws', () => {
    /** @type {any} */
    let persistence;
    /** @type {any} */
    let graph;

    beforeEach(async () => {
      persistence = createMockPersistence();
      graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: false,
      });
    });

    it('hasNode throws without prior materialize()', async () => {
      await expect(graph.hasNode('test:x')).rejects.toThrow(QueryError);
    });

    it('getNodes throws without prior materialize()', async () => {
      await expect(graph.getNodes()).rejects.toThrow(QueryError);
    });

    it('getEdges throws without prior materialize()', async () => {
      await expect(graph.getEdges()).rejects.toThrow(QueryError);
    });

    it('getNodeProps throws without prior materialize()', async () => {
      await expect(graph.getNodeProps('test:x')).rejects.toThrow(QueryError);
    });

    it('neighbors throws without prior materialize()', async () => {
      await expect(graph.neighbors('test:x')).rejects.toThrow(QueryError);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 4. autoMaterialize off -> materialize -> current behavior unchanged
  // ────────────────────────────────────────────────────────────────────────

  describe('4. autoMaterialize: false -> explicit materialize -> normal query behavior', () => {
    /** @type {any} */
    let persistence;
    /** @type {any} */
    let graph;

    beforeEach(async () => {
      persistence = createMockPersistence();
      graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: false,
      });
    });

    it('getNodes works after explicit materialize()', async () => {
      await graph.materialize();
      const nodes = await graph.getNodes();
      expect(nodes).toEqual([]);
    });

    it('hasNode works after explicit materialize()', async () => {
      await graph.materialize();
      const result = await graph.hasNode('test:x');
      expect(result).toBe(false);
    });

    it('getEdges works after explicit materialize()', async () => {
      await graph.materialize();
      const edges = await graph.getEdges();
      expect(edges).toEqual([]);
    });

    it('getNodeProps returns null for absent node after materialize()', async () => {
      await graph.materialize();
      const props = await graph.getNodeProps('test:x');
      expect(props).toBe(null);
    });

    it('neighbors returns empty after materialize()', async () => {
      await graph.materialize();
      const result = await graph.neighbors('test:x');
      expect(result).toEqual([]);
    });

    it('querying state with data works after materialize + manual seed', async () => {
      await graph.materialize();
      const state = /** @type {any} */ (graph)._cachedState;
      orsetAdd(state.nodeAlive, 'test:alice', createDot('w1', 1));

      expect(await graph.hasNode('test:alice')).toBe(true);
      expect(await graph.getNodes()).toContain('test:alice');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 5. All query methods respect autoMaterialize
  // ────────────────────────────────────────────────────────────────────────

  describe('5. All query methods respect autoMaterialize: true', () => {
    /** @type {any} */
    let persistence;
    /** @type {any} */
    let graph;

    beforeEach(async () => {
      persistence = createMockPersistence();
      graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: true,
      });
    });

    it('hasNode auto-materializes and returns result', async () => {
      expect(/** @type {any} */ (graph)._cachedState).toBe(null);
      const result = await graph.hasNode('test:x');
      expect(result).toBe(false);
      expect(/** @type {any} */ (graph)._cachedState).not.toBe(null);
    });

    it('getNodeProps auto-materializes and returns result', async () => {
      expect(/** @type {any} */ (graph)._cachedState).toBe(null);
      const result = await graph.getNodeProps('test:x');
      expect(result).toBe(null);
      expect(/** @type {any} */ (graph)._cachedState).not.toBe(null);
    });

    it('neighbors auto-materializes and returns result', async () => {
      expect(/** @type {any} */ (graph)._cachedState).toBe(null);
      const result = await graph.neighbors('test:x');
      expect(result).toEqual([]);
      expect(/** @type {any} */ (graph)._cachedState).not.toBe(null);
    });

    it('getNodes auto-materializes and returns result', async () => {
      expect(/** @type {any} */ (graph)._cachedState).toBe(null);
      const result = await graph.getNodes();
      expect(result).toEqual([]);
      expect(/** @type {any} */ (graph)._cachedState).not.toBe(null);
    });

    it('getEdges auto-materializes and returns result', async () => {
      expect(/** @type {any} */ (graph)._cachedState).toBe(null);
      const result = await graph.getEdges();
      expect(result).toEqual([]);
      expect(/** @type {any} */ (graph)._cachedState).not.toBe(null);
    });

    it('all methods return consistent data from auto-materialized state', async () => {
      // First call triggers materialize; seed state for subsequent calls
      await graph.getNodes();
      const state = /** @type {any} */ (graph)._cachedState;

      // Seed data
      orsetAdd(state.nodeAlive, 'test:alice', createDot('w1', 1));
      orsetAdd(state.nodeAlive, 'test:bob', createDot('w1', 2));
      orsetAdd(state.edgeAlive, encodeEdgeKey('test:alice', 'test:bob', 'knows'), createDot('w1', 3));
      const propKey = encodePropKey('test:alice', 'name');
      state.prop.set(propKey, { value: 'Alice', lamport: 1, writerId: 'w1' });

      // All methods work without re-materializing (state is clean)
      expect(await graph.hasNode('test:alice')).toBe(true);
      expect(await graph.hasNode('test:bob')).toBe(true);
      expect(await graph.hasNode('test:nonexistent')).toBe(false);

      const nodes = await graph.getNodes();
      expect(nodes).toContain('test:alice');
      expect(nodes).toContain('test:bob');

      const edges = await graph.getEdges();
      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual({ from: 'test:alice', to: 'test:bob', label: 'knows', props: {} });

      const props = await graph.getNodeProps('test:alice');
      expect(props.get('name')).toBe('Alice');

      const outgoing = await graph.neighbors('test:alice', 'outgoing');
      expect(outgoing).toHaveLength(1);
      expect(outgoing[0].nodeId).toBe('test:bob');

      const incoming = await graph.neighbors('test:bob', 'incoming');
      expect(incoming).toHaveLength(1);
      expect(incoming[0].nodeId).toBe('test:alice');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 6. query().run() works with autoMaterialize
  // ────────────────────────────────────────────────────────────────────────

  describe('6. query().run() works with autoMaterialize: true', () => {
    /** @type {any} */
    let persistence;
    /** @type {any} */
    let graph;

    beforeEach(async () => {
      persistence = createMockPersistence();
      graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: true,
      });
    });

    it('query().match("*").run() does not throw on null state', async () => {
      const result = await graph.query().match('*').run();
      expect(result).toBeDefined();
      expect(result.nodes).toEqual([]);
    });

    it('query().match("test:*").run() does not throw on null state', async () => {
      const result = await graph.query().match('test:*').run();
      expect(result).toBeDefined();
      expect(result.nodes).toEqual([]);
    });

    it('query().run() returns data after auto-materialize + seed', async () => {
      // query().run() calls _materializeGraph() which calls materialize().
      // We need to mock materialize to return a pre-seeded state so it
      // does not get overwritten on each call (same pattern as queryBuilder tests).
      const state = createEmptyStateV5();
      orsetAdd(state.nodeAlive, 'test:alice', createDot('w1', 1));
      orsetAdd(state.nodeAlive, 'test:bob', createDot('w1', 2));
      orsetAdd(state.edgeAlive, encodeEdgeKey('test:alice', 'test:bob', 'follows'), createDot('w1', 3));

      /** @type {any} */ (graph)._cachedState = state;
      graph.materialize = vi.fn().mockResolvedValue(state);

      const result = await graph.query().match('test:alice').outgoing().run();
      expect(result.nodes).toEqual([{ id: 'test:bob' }]);
    });

    it('query().run() auto-materializes when state is null', async () => {
      expect(/** @type {any} */ (graph)._cachedState).toBe(null);
      const result = await graph.query().match('*').run();
      expect(/** @type {any} */ (graph)._cachedState).not.toBe(null);
      expect(result.nodes).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 7. Concurrent auto-materialize calls
  // ────────────────────────────────────────────────────────────────────────

  describe('7. Concurrent auto-materialize calls', () => {
    /** @type {any} */
    let persistence;
    /** @type {any} */
    let graph;

    beforeEach(async () => {
      persistence = createMockPersistence();
      graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: true,
      });
    });

    it('concurrent queries all resolve without errors', async () => {
      const [nodes, edges, hasNode, props, neighbors] = await Promise.all([
        graph.getNodes(),
        graph.getEdges(),
        graph.hasNode('test:x'),
        graph.getNodeProps('test:x'),
        graph.neighbors('test:x'),
      ]);

      expect(nodes).toEqual([]);
      expect(edges).toEqual([]);
      expect(hasNode).toBe(false);
      expect(props).toBe(null);
      expect(neighbors).toEqual([]);
    });

    it('materialize is called when state is null, regardless of concurrent callers', async () => {
      const materializeSpy = vi.spyOn(graph, 'materialize');

      await Promise.all([graph.getNodes(), graph.hasNode('test:x')]);

      // materialize should have been called (at least once, possibly twice
      // if there is no coalescing). The important thing is no errors.
      expect(materializeSpy).toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // 8. traverse methods work with autoMaterialize
  // ────────────────────────────────────────────────────────────────────────

  describe('8. traverse methods work with autoMaterialize: true', () => {
    /** @type {any} */
    let persistence;
    /** @type {any} */
    let graph;

    beforeEach(async () => {
      persistence = createMockPersistence();
      graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: true,
      });
    });

    it('traverse.bfs does not throw on null state (node not found is OK)', async () => {
      // bfs will auto-materialize, then throw NODE_NOT_FOUND for absent start node
      // which is the expected behavior — not a "no cached state" error
      await expect(graph.traverse.bfs('test:x')).rejects.toThrow('Start node not found');
    });

    it('traverse.dfs does not throw on null state (node not found is OK)', async () => {
      await expect(graph.traverse.dfs('test:x')).rejects.toThrow('Start node not found');
    });

    it('traverse.shortestPath does not throw on null state (node not found is OK)', async () => {
      await expect(
        graph.traverse.shortestPath('test:x', 'test:y'),
      ).rejects.toThrow('Start node not found');
    });

    it('traverse.connectedComponent does not throw on null state (node not found is OK)', async () => {
      await expect(
        graph.traverse.connectedComponent('test:x'),
      ).rejects.toThrow('Start node not found');
    });

    it('traverse.bfs works with seeded data after auto-materialize', async () => {
      // traverse._prepare() calls _materializeGraph() -> materialize(), so
      // we mock materialize to return a pre-seeded state (same pattern as traverse tests).
      const state = createEmptyStateV5();
      orsetAdd(state.nodeAlive, 'test:a', createDot('w1', 1));
      orsetAdd(state.nodeAlive, 'test:b', createDot('w1', 2));
      orsetAdd(state.nodeAlive, 'test:c', createDot('w1', 3));
      orsetAdd(state.edgeAlive, encodeEdgeKey('test:a', 'test:b', 'x'), createDot('w1', 4));
      orsetAdd(state.edgeAlive, encodeEdgeKey('test:b', 'test:c', 'x'), createDot('w1', 5));

      /** @type {any} */ (graph)._cachedState = state;
      graph.materialize = vi.fn().mockResolvedValue(state);

      const result = await graph.traverse.bfs('test:a', { dir: 'out' });
      expect(result).toEqual(['test:a', 'test:b', 'test:c']);
    });

    it('traverse.shortestPath works with seeded data after auto-materialize', async () => {
      const state = createEmptyStateV5();
      orsetAdd(state.nodeAlive, 'test:a', createDot('w1', 1));
      orsetAdd(state.nodeAlive, 'test:b', createDot('w1', 2));
      orsetAdd(state.edgeAlive, encodeEdgeKey('test:a', 'test:b', 'x'), createDot('w1', 3));

      /** @type {any} */ (graph)._cachedState = state;
      graph.materialize = vi.fn().mockResolvedValue(state);

      const result = await graph.traverse.shortestPath('test:a', 'test:b', { dir: 'out' });
      expect(result).toEqual({ found: true, path: ['test:a', 'test:b'], length: 1 });
    });

    it('traverse errors are NODE_NOT_FOUND, not "No cached state"', async () => {
      // The key behavior: with autoMaterialize on, the error should be about
      // the missing node, NOT about missing cached state
      try {
        await graph.traverse.bfs('test:missing');
        expect.fail('should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err.message).toContain('Start node not found');
        expect(err.message).not.toContain('No cached state');
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Edge cases
  // ────────────────────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('default autoMaterialize (undefined) behaves like true', async () => {
      const graph = await WarpGraph.open({
        persistence: createMockPersistence(),
        graphName: 'test',
        writerId: 'writer-1',
      });

      // With default autoMaterialize=true, hasNode should auto-materialize and resolve
      const result = await graph.hasNode('test:x');
      expect(result).toBe(false);
    });

    it('_ensureFreshState does not materialize when autoMaterialize is true and state is clean', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: true,
      });

      // First call materializes
      await graph.getNodes();
      expect(/** @type {any} */ (graph)._cachedState).not.toBe(null);
      expect(/** @type {any} */ (graph)._stateDirty).toBe(false);

      // Spy on materialize for subsequent call
      const spy = vi.spyOn(graph, 'materialize');
      await graph.getNodes();

      // Should NOT have called materialize (state is clean)
      expect(spy).not.toHaveBeenCalled();
    });

    it('_ensureFreshState materializes when autoMaterialize is true and _stateDirty', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: true,
      });

      await graph.materialize();
      /** @type {any} */ (graph)._stateDirty = true;

      const spy = vi.spyOn(graph, 'materialize');
      await graph.getNodes();

      expect(spy).toHaveBeenCalled();
    });

    it('_ensureFreshState materializes when autoMaterialize is true and _cachedState is null', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: true,
      });

      expect(/** @type {any} */ (graph)._cachedState).toBe(null);
      const spy = vi.spyOn(graph, 'materialize');
      await graph.hasNode('test:x');

      expect(spy).toHaveBeenCalled();
    });

    it('autoMaterialize false with dirty state throws', async () => {
      const persistence = createMockPersistence();
      const graph = await WarpGraph.open({
        persistence,
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: false,
      });

      await graph.materialize();
      /** @type {any} */ (graph)._stateDirty = true;

      await expect(graph.getNodes()).rejects.toThrow(QueryError);
    });
  });
});
