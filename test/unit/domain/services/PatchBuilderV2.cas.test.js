import { describe, it, expect, vi } from 'vitest';
import { PatchBuilderV2 } from '../../../../src/domain/services/PatchBuilderV2.js';
import { WriterError } from '../../../../src/domain/warp/Writer.js';
import { createVersionVector } from '../../../../src/domain/crdt/VersionVector.js';

/**
 * Creates a mock persistence adapter for CAS testing.
 *
 * @param {Object} [overrides] - Method overrides
 * @returns {Object} Mock persistence adapter
 */
/** @returns {any} */
function createMockPersistence(overrides = {}) {
  return {
    readRef: vi.fn().mockResolvedValue(null),
    showNode: vi.fn(),
    writeBlob: vi.fn().mockResolvedValue('a'.repeat(40)),
    writeTree: vi.fn().mockResolvedValue('b'.repeat(40)),
    commitNodeWithTree: vi.fn().mockResolvedValue('c'.repeat(40)),
    updateRef: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('PatchBuilderV2 CAS conflict detection', () => {
  // ---------------------------------------------------------------
  // CAS conflict: ref advanced between createPatch and commit
  // ---------------------------------------------------------------
  describe('when writer ref advances between createPatch and commit', () => {
    it('throws WriterError with code WRITER_CAS_CONFLICT', async () => {
      const expectedParent = 'a'.repeat(40);
      const advancedSha = 'f'.repeat(40);

      const persistence = createMockPersistence({
        // Simulate ref having advanced to a different SHA
        readRef: vi.fn().mockResolvedValue(advancedSha),
      });

      const builder = new PatchBuilderV2({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
        expectedParentSha: expectedParent,
      });

      builder.addNode('x');

      await expect(builder.commit()).rejects.toThrow(WriterError);
      await expect(
        // Re-create builder since the first commit consumed the rejection
        new PatchBuilderV2({
          persistence,
          graphName: 'test-graph',
          writerId: 'writer1',
          lamport: 1,
          versionVector: createVersionVector(),
          getCurrentState: () => null,
          expectedParentSha: expectedParent,
        })
          .addNode('x')
          .commit()
      ).rejects.toMatchObject({ code: 'WRITER_CAS_CONFLICT' });
    });

    it('includes expectedSha and actualSha properties on the error', async () => {
      const expectedParent = 'a'.repeat(40);
      const advancedSha = 'f'.repeat(40);

      const persistence = createMockPersistence({
        readRef: vi.fn().mockResolvedValue(advancedSha),
      });

      const builder = new PatchBuilderV2({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
        expectedParentSha: expectedParent,
      });

      builder.addNode('x');

      try {
        await builder.commit();
        expect.unreachable('commit() should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err).toBeInstanceOf(WriterError);
        expect(err.expectedSha).toBe(expectedParent);
        expect(err.actualSha).toBe(advancedSha);
      }
    });

    it('error message contains recovery hint', async () => {
      const expectedParent = 'a'.repeat(40);
      const advancedSha = 'f'.repeat(40);

      const persistence = createMockPersistence({
        readRef: vi.fn().mockResolvedValue(advancedSha),
      });

      const builder = new PatchBuilderV2({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
        expectedParentSha: expectedParent,
      });

      builder.addNode('x');

      await expect(builder.commit()).rejects.toThrow(
        'Commit failed: writer ref was updated by another process. Re-materialize and retry.'
      );
    });

    it('handles null expectedParentSha vs non-null actual ref', async () => {
      const advancedSha = 'f'.repeat(40);

      const persistence = createMockPersistence({
        readRef: vi.fn().mockResolvedValue(advancedSha),
      });

      const builder = new PatchBuilderV2({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
        expectedParentSha: null, // Writer expected no prior commits
      });

      builder.addNode('x');

      try {
        await builder.commit();
        expect.unreachable('commit() should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err).toBeInstanceOf(WriterError);
        expect(err.code).toBe('WRITER_CAS_CONFLICT');
        expect(err.expectedSha).toBeNull();
        expect(err.actualSha).toBe(advancedSha);
      }
    });

    it('handles non-null expectedParentSha vs null actual ref', async () => {
      const expectedParent = 'a'.repeat(40);

      const persistence = createMockPersistence({
        // Ref was deleted / does not exist
        readRef: vi.fn().mockResolvedValue(null),
      });

      const builder = new PatchBuilderV2({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
        expectedParentSha: expectedParent,
      });

      builder.addNode('x');

      try {
        await builder.commit();
        expect.unreachable('commit() should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err).toBeInstanceOf(WriterError);
        expect(err.code).toBe('WRITER_CAS_CONFLICT');
        expect(err.expectedSha).toBe(expectedParent);
        expect(err.actualSha).toBeNull();
      }
    });
  });

  // ---------------------------------------------------------------
  // No CAS conflict: normal commits still succeed
  // ---------------------------------------------------------------
  describe('when no CAS conflict occurs', () => {
    it('succeeds when expectedParentSha matches current ref (both null)', async () => {
      const persistence = createMockPersistence({
        readRef: vi.fn().mockResolvedValue(null),
      });

      const builder = new PatchBuilderV2({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
        expectedParentSha: null,
      });

      builder.addNode('x');
      const sha = await builder.commit();

      expect(sha).toBe('c'.repeat(40));
      expect(persistence.commitNodeWithTree).toHaveBeenCalledOnce();
      expect(persistence.updateRef).toHaveBeenCalledOnce();
    });

    it('succeeds when expectedParentSha matches current ref (both same SHA)', async () => {
      const parentSha = 'd'.repeat(40);
      const patchOid = 'e'.repeat(40);

      const persistence = createMockPersistence({
        readRef: vi.fn().mockResolvedValue(parentSha),
        showNode: vi.fn().mockResolvedValue(
          `warp:patch\n\neg-kind: patch\neg-graph: test-graph\neg-writer: writer1\neg-lamport: 3\neg-patch-oid: ${patchOid}\neg-schema: 2`
        ),
      });

      const builder = new PatchBuilderV2({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
        expectedParentSha: parentSha,
      });

      builder.addNode('x');
      const sha = await builder.commit();

      expect(sha).toBe('c'.repeat(40));
      expect(persistence.commitNodeWithTree).toHaveBeenCalledOnce();
    });
  });
});
