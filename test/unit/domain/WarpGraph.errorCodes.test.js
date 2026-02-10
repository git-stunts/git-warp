import { describe, it, expect, vi, beforeEach } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import QueryError from '../../../src/domain/errors/QueryError.js';
import { encodePatchMessage } from '../../../src/domain/services/WarpMessageCodec.js';
import { createMockPersistence } from '../../helpers/warpGraphTestUtils.js';

/**
 * HS/ERR/2 — Error codes and recovery hints for state-related errors.
 *
 * Verifies that _ensureFreshState() throws QueryError with:
 *   - E_NO_STATE when _cachedState is null and autoMaterialize is off
 *   - E_STALE_STATE when _stateDirty is true and autoMaterialize is off
 *
 * Each error carries a recovery hint in its .message property.
 * autoMaterialize: true prevents both errors by transparently materializing.
 */

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

describe('HS/ERR/2: Error codes and recovery hints for state-related errors', () => {
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
    });
  });

  // ── E_NO_STATE ─────────────────────────────────────────────────────────

  describe('E_NO_STATE — query without prior materialize()', () => {
    it('hasNode throws QueryError with code E_NO_STATE', async () => {
      try {
        await graph.hasNode('test:x');
        expect.unreachable('should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err).toBeInstanceOf(QueryError);
        expect(err.code).toBe('E_NO_STATE');
      }
    });

    it('getNodes throws QueryError with code E_NO_STATE', async () => {
      try {
        await graph.getNodes();
        expect.unreachable('should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err).toBeInstanceOf(QueryError);
        expect(err.code).toBe('E_NO_STATE');
      }
    });

    it('getEdges throws QueryError with code E_NO_STATE', async () => {
      try {
        await graph.getEdges();
        expect.unreachable('should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err).toBeInstanceOf(QueryError);
        expect(err.code).toBe('E_NO_STATE');
      }
    });

    it('getNodeProps throws QueryError with code E_NO_STATE', async () => {
      try {
        await graph.getNodeProps('test:x');
        expect.unreachable('should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err).toBeInstanceOf(QueryError);
        expect(err.code).toBe('E_NO_STATE');
      }
    });

    it('neighbors throws QueryError with code E_NO_STATE', async () => {
      try {
        await graph.neighbors('test:x');
        expect.unreachable('should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err).toBeInstanceOf(QueryError);
        expect(err.code).toBe('E_NO_STATE');
      }
    });

    it('error message includes recovery hint mentioning materialize()', async () => {
      try {
        await graph.hasNode('test:x');
        expect.unreachable('should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err.message).toContain('materialize()');
      }
    });

    it('error message includes recovery hint mentioning autoMaterialize', async () => {
      try {
        await graph.hasNode('test:x');
        expect.unreachable('should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err.message).toContain('autoMaterialize');
      }
    });

    it('error message matches expected recovery hint text', async () => {
      try {
        await graph.hasNode('test:x');
        expect.unreachable('should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err.message).toBe(
          'No cached state. Call materialize() to load initial state, or pass autoMaterialize: true to WarpGraph.open().',
        );
      }
    });
  });

  // ── E_STALE_STATE ──────────────────────────────────────────────────────

  describe('E_STALE_STATE — query after dirty state', () => {
    it('throws QueryError with code E_STALE_STATE after commit with cached state', async () => {
      // Materialize first so _cachedState exists, then commit eagerly,
      // then manually dirty the flag to simulate stale-after-write
      // (normally eager apply keeps it clean, but if cache was absent
      // at commit time, the flag is set and _cachedState remains null
      // which hits E_NO_STATE instead).
      await graph.materialize();
      mockFirstCommit(persistence);
      await (await graph.createPatch()).addNode('test:node').commit();

      // Force dirty to simulate the stale-after-write scenario
      /** @type {any} */ (graph)._stateDirty = true;

      try {
        await graph.hasNode('test:node');
        expect.unreachable('should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err).toBeInstanceOf(QueryError);
        expect(err.code).toBe('E_STALE_STATE');
      }
    });

    it('throws QueryError with code E_STALE_STATE when _stateDirty is manually set', async () => {
      await graph.materialize();
      /** @type {any} */ (graph)._stateDirty = true;

      try {
        await graph.getNodes();
        expect.unreachable('should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err).toBeInstanceOf(QueryError);
        expect(err.code).toBe('E_STALE_STATE');
      }
    });

    it('error message includes recovery hint mentioning materialize()', async () => {
      await graph.materialize();
      /** @type {any} */ (graph)._stateDirty = true;

      try {
        await graph.hasNode('test:x');
        expect.unreachable('should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err.message).toContain('materialize()');
      }
    });

    it('error message includes recovery hint mentioning autoMaterialize', async () => {
      await graph.materialize();
      /** @type {any} */ (graph)._stateDirty = true;

      try {
        await graph.hasNode('test:x');
        expect.unreachable('should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err.message).toContain('autoMaterialize');
      }
    });

    it('error message matches expected recovery hint text', async () => {
      await graph.materialize();
      /** @type {any} */ (graph)._stateDirty = true;

      try {
        await graph.hasNode('test:x');
        expect.unreachable('should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err.message).toBe(
          'Cached state is stale. Call materialize() to refresh, or enable autoMaterialize.',
        );
      }
    });
  });

  // ── Programmatic matching ──────────────────────────────────────────────

  describe('Programmatic error code matching', () => {
    it('catch (e) { if (e.code === "E_NO_STATE") } works for no-state errors', async () => {
      let matched = false;

      try {
        await graph.hasNode('test:x');
      } catch (/** @type {any} */ e) {
        if (e.code === 'E_NO_STATE') {
          matched = true;
        }
      }

      expect(matched).toBe(true);
    });

    it('catch (e) { if (e.code === "E_STALE_STATE") } works for stale-state errors', async () => {
      await graph.materialize();
      /** @type {any} */ (graph)._stateDirty = true;

      let matched = false;

      try {
        await graph.getNodes();
      } catch (/** @type {any} */ e) {
        if (e.code === 'E_STALE_STATE') {
          matched = true;
        }
      }

      expect(matched).toBe(true);
    });

    it('E_NO_STATE and E_STALE_STATE are distinguishable', async () => {
      const codes = [];

      // Trigger E_NO_STATE
      try {
        await graph.hasNode('test:x');
      } catch (/** @type {any} */ e) {
        codes.push(e.code);
      }

      // Trigger E_STALE_STATE
      await graph.materialize();
      /** @type {any} */ (graph)._stateDirty = true;

      try {
        await graph.hasNode('test:x');
      } catch (/** @type {any} */ e) {
        codes.push(e.code);
      }

      expect(codes).toEqual(['E_NO_STATE', 'E_STALE_STATE']);
    });

    it('error code is available via .code property on the thrown object', async () => {
      try {
        await graph.hasNode('test:x');
        expect.unreachable('should have thrown');
      } catch (/** @type {any} */ e) {
        expect(typeof e.code).toBe('string');
        expect(e.code).toBeTruthy();
      }
    });
  });

  // ── autoMaterialize prevents both errors ───────────────────────────────

  describe('autoMaterialize: true prevents both E_NO_STATE and E_STALE_STATE', () => {
    /** @type {any} */
    let autoGraph;

    beforeEach(async () => {
      const autoPersistence = createMockPersistence();
      autoGraph = await WarpGraph.open({
        persistence: autoPersistence,
        graphName: 'test',
        writerId: 'writer-1',
        autoMaterialize: true,
      });
    });

    it('does not throw E_NO_STATE when _cachedState is null', async () => {
      expect(autoGraph._cachedState).toBe(null);

      // Should not throw — auto-materialize kicks in
      const nodes = await autoGraph.getNodes();
      expect(nodes).toEqual([]);
    });

    it('does not throw E_STALE_STATE when _stateDirty is true', async () => {
      await autoGraph.materialize();
      autoGraph._stateDirty = true;

      // Should not throw — auto-materialize kicks in
      const spy = vi.spyOn(autoGraph, 'materialize');
      const nodes = await autoGraph.getNodes();
      expect(spy).toHaveBeenCalled();
      expect(Array.isArray(nodes)).toBe(true);
    });

    it('hasNode works transparently without explicit materialize()', async () => {
      const result = await autoGraph.hasNode('test:x');
      expect(result).toBe(false);
    });

    it('getEdges works transparently without explicit materialize()', async () => {
      const edges = await autoGraph.getEdges();
      expect(edges).toEqual([]);
    });

    it('getNodeProps works transparently without explicit materialize()', async () => {
      const props = await autoGraph.getNodeProps('test:x');
      expect(props).toBe(null);
    });

    it('neighbors works transparently without explicit materialize()', async () => {
      const result = await autoGraph.neighbors('test:x');
      expect(result).toEqual([]);
    });
  });

  // ── Error shape ────────────────────────────────────────────────────────

  describe('Error object shape', () => {
    it('E_NO_STATE error has name, code, message, and context properties', async () => {
      try {
        await graph.hasNode('test:x');
        expect.unreachable('should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err.name).toBe('QueryError');
        expect(err.code).toBe('E_NO_STATE');
        expect(typeof err.message).toBe('string');
        expect(err.context).toBeDefined();
      }
    });

    it('E_STALE_STATE error has name, code, message, and context properties', async () => {
      await graph.materialize();
      /** @type {any} */ (graph)._stateDirty = true;

      try {
        await graph.hasNode('test:x');
        expect.unreachable('should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err.name).toBe('QueryError');
        expect(err.code).toBe('E_STALE_STATE');
        expect(typeof err.message).toBe('string');
        expect(err.context).toBeDefined();
      }
    });

    it('E_NO_STATE error has a stack trace', async () => {
      try {
        await graph.hasNode('test:x');
        expect.unreachable('should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err.stack).toBeDefined();
        expect(err.stack.length).toBeGreaterThan(0);
      }
    });

    it('E_STALE_STATE error has a stack trace', async () => {
      await graph.materialize();
      /** @type {any} */ (graph)._stateDirty = true;

      try {
        await graph.hasNode('test:x');
        expect.unreachable('should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err.stack).toBeDefined();
        expect(err.stack.length).toBeGreaterThan(0);
      }
    });
  });
});
