import { describe, it, expect, beforeEach } from 'vitest';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import QueryError from '../../../src/domain/errors/QueryError.ts';
import {
  E_NO_STATE_MSG,
  E_STALE_STATE_MSG,
  READINGS_AND_OPTICS_DOC_PATH,
} from '../../../src/domain/services/controllers/QueryStateMessages.ts';
import { createMockPersistence } from '../../helpers/warpGraphTestUtils.ts';

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
    let persistence;
    let graph;

  beforeEach(async () => {
    persistence = createMockPersistence();
    graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'test',
      writerId: 'writer-1',
      autoMaterialize: false,
    });
  });

  // ── E_NO_STATE ─────────────────────────────────────────────────────────

  describe('E_NO_STATE — query without a live reading basis', () => {
    it('hasNode throws QueryError with code E_NO_STATE', async () => {
      try {
        await graph.hasNode('test:x');
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(QueryError);
        expect((err as any).code).toBe('E_NO_STATE');
      }
    });

    it('getNodes throws QueryError with code E_NO_STATE', async () => {
      try {
        await graph.getNodes();
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(QueryError);
        expect((err as any).code).toBe('E_NO_STATE');
      }
    });

    it('getEdges throws QueryError with code E_NO_STATE', async () => {
      try {
        await graph.getEdges();
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(QueryError);
        expect((err as any).code).toBe('E_NO_STATE');
      }
    });

    it('getNodeProps throws QueryError with code E_NO_STATE', async () => {
      try {
        await graph.getNodeProps('test:x');
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(QueryError);
        expect((err as any).code).toBe('E_NO_STATE');
      }
    });

    it('neighbors throws QueryError with code E_NO_STATE', async () => {
      try {
        await graph.neighbors('test:x');
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(QueryError);
        expect((err as any).code).toBe('E_NO_STATE');
      }
    });

    it('error message includes recovery hint mentioning readings', async () => {
      await expect(graph.hasNode('test:x')).rejects.toThrow('No live reading basis');
      await expect(graph.hasNode('test:x')).rejects.toThrow('graph.query.worldline()');
    });

    it('error message links to readings and optics docs', async () => {
      await expect(graph.hasNode('test:x')).rejects.toThrow(READINGS_AND_OPTICS_DOC_PATH);
    });

    it('error message matches expected recovery hint text', async () => {
      await expect(graph.hasNode('test:x')).rejects.toMatchObject({ message: E_NO_STATE_MSG });
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
      (graph)._stateDirty = true;

      try {
        await graph.hasNode('test:node');
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(QueryError);
        expect((err as any).code).toBe('E_STALE_STATE');
      }
    });

    it('throws QueryError with code E_STALE_STATE when _stateDirty is manually set', async () => {
      await graph.materialize();
      (graph)._stateDirty = true;

      try {
        await graph.getNodes();
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(QueryError);
        expect((err as any).code).toBe('E_STALE_STATE');
      }
    });

    it('error message includes recovery hint mentioning reading refresh', async () => {
      await graph.materialize();
      (graph)._stateDirty = true;

      await expect(graph.hasNode('test:x')).rejects.toThrow('live reading basis is stale');
      await expect(graph.hasNode('test:x')).rejects.toThrow('re-read through graph.query');
    });

    it('error message links to readings and optics docs', async () => {
      await graph.materialize();
      (graph)._stateDirty = true;

      await expect(graph.hasNode('test:x')).rejects.toThrow(READINGS_AND_OPTICS_DOC_PATH);
    });

    it('error message matches expected recovery hint text', async () => {
      await graph.materialize();
      (graph)._stateDirty = true;

      await expect(graph.hasNode('test:x')).rejects.toMatchObject({ message: E_STALE_STATE_MSG });
    });
  });

  // ── Programmatic matching ──────────────────────────────────────────────

  describe('Programmatic error code matching', () => {
    it('catch (e) { if ((e as any).code === "E_NO_STATE") } works for no-state errors', async () => {
      let matched = false;

      try {
        await graph.hasNode('test:x');
      } catch (e) {
        if ((e as any).code === 'E_NO_STATE') {
          matched = true;
        }
      }

      expect(matched).toBe(true);
    });

    it('catch (e) { if ((e as any).code === "E_STALE_STATE") } works for stale-state errors', async () => {
      await graph.materialize();
      (graph)._stateDirty = true;

      let matched = false;

      try {
        await graph.getNodes();
      } catch (e) {
        if ((e as any).code === 'E_STALE_STATE') {
          matched = true;
        }
      }

      expect(matched).toBe(true);
    });

    it('E_NO_STATE and E_STALE_STATE are distinguishable', async () => {
      const codes: any[] = [];

      // Trigger E_NO_STATE
      try {
        await graph.hasNode('test:x');
      } catch (e) {
        codes.push((e as any).code);
      }

      // Trigger E_STALE_STATE
      await graph.materialize();
      (graph)._stateDirty = true;

      try {
        await graph.hasNode('test:x');
      } catch (e) {
        codes.push((e as any).code);
      }

      expect(codes).toEqual(['E_NO_STATE', 'E_STALE_STATE']);
    });

    it('error code is available via .code property on the thrown object', async () => {
      try {
        await graph.hasNode('test:x');
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(typeof (e as any).code).toBe('string');
        expect((e as any).code).toBeTruthy();
      }
    });
  });

  // ── autoMaterialize prevents both errors ───────────────────────────────

  describe('autoMaterialize: true prevents both E_NO_STATE and E_STALE_STATE', () => {
        let autoGraph;

    beforeEach(async () => {
      const autoPersistence = createMockPersistence();
      autoGraph = await openRuntimeHostProduct({
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

      const nodes = await autoGraph.getNodes();
      expect(Array.isArray(nodes)).toBe(true);
      expect(autoGraph._stateDirty).toBe(false);
      expect(autoGraph._cachedState).not.toBeNull();
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
      } catch (err) {
        expect((err as any).name).toBe('QueryError');
        expect((err as any).code).toBe('E_NO_STATE');
        expect(typeof (err as any).message).toBe('string');
        expect((err as any).context).toBeDefined();
      }
    });

    it('E_STALE_STATE error has name, code, message, and context properties', async () => {
      await graph.materialize();
      (graph)._stateDirty = true;

      try {
        await graph.hasNode('test:x');
        expect.unreachable('should have thrown');
      } catch (err) {
        expect((err as any).name).toBe('QueryError');
        expect((err as any).code).toBe('E_STALE_STATE');
        expect(typeof (err as any).message).toBe('string');
        expect((err as any).context).toBeDefined();
      }
    });

    it('E_NO_STATE error has a stack trace', async () => {
      try {
        await graph.hasNode('test:x');
        expect.unreachable('should have thrown');
      } catch (err) {
        expect((err as any).stack).toBeDefined();
        expect((err as any).stack.length).toBeGreaterThan(0);
      }
    });

    it('E_STALE_STATE error has a stack trace', async () => {
      await graph.materialize();
      (graph)._stateDirty = true;

      try {
        await graph.hasNode('test:x');
        expect.unreachable('should have thrown');
      } catch (err) {
        expect((err as any).stack).toBeDefined();
        expect((err as any).stack.length).toBeGreaterThan(0);
      }
    });
  });
});
