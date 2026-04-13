import { describe, it, expect, vi } from 'vitest';
import { PatchBuilder } from '../../../../src/domain/services/PatchBuilder.ts';
import { WriterError } from '../../../../src/domain/warp/Writer.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { CborPatchJournalAdapter } from '../../../../src/infrastructure/adapters/CborPatchJournalAdapter.js';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.js';

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

/**
 * Creates a CborPatchJournalAdapter wired to the given persistence's blob ops.
 * @param {ReturnType<typeof createMockPersistence>} persistence
 * @returns {CborPatchJournalAdapter}
 */
function createPatchJournal(persistence) {
  return new CborPatchJournalAdapter({
    codec: new CborCodec(),
    blobPort: persistence,
  });
}

describe('PatchBuilder CAS conflict detection', () => {
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

      const builder = new PatchBuilder({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
        expectedParentSha: expectedParent,
      });

      builder.addNode('x');

      await expect(builder.commit()).rejects.toThrow(WriterError);
      await expect(
        // Re-create builder since the first commit consumed the rejection
        new PatchBuilder({
          persistence,
          graphName: 'test-graph',
          writerId: 'writer1',
          lamport: 1,
          versionVector: VersionVector.empty(),
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

      const builder = new PatchBuilder({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
        expectedParentSha: expectedParent,
      });

      builder.addNode('x');

      try {
        await builder.commit();
        expect.unreachable('commit() should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err).toBeInstanceOf(WriterError);
        expect((err as any).expectedSha).toBe(expectedParent);
        expect((err as any).actualSha).toBe(advancedSha);
      }
    });

    it('error message contains recovery hint', async () => {
      const expectedParent = 'a'.repeat(40);
      const advancedSha = 'f'.repeat(40);

      const persistence = createMockPersistence({
        readRef: vi.fn().mockResolvedValue(advancedSha),
      });

      const builder = new PatchBuilder({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
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

      const builder = new PatchBuilder({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
        expectedParentSha: null, // Writer expected no prior commits
      });

      builder.addNode('x');

      try {
        await builder.commit();
        expect.unreachable('commit() should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err).toBeInstanceOf(WriterError);
        expect((err as any).code).toBe('WRITER_CAS_CONFLICT');
        expect((err as any).expectedSha).toBeNull();
        expect((err as any).actualSha).toBe(advancedSha);
      }
    });

    it('handles non-null expectedParentSha vs null actual ref', async () => {
      const expectedParent = 'a'.repeat(40);

      const persistence = createMockPersistence({
        // Ref was deleted / does not exist
        readRef: vi.fn().mockResolvedValue(null),
      });

      const builder = new PatchBuilder({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
        expectedParentSha: expectedParent,
      });

      builder.addNode('x');

      try {
        await builder.commit();
        expect.unreachable('commit() should have thrown');
      } catch (/** @type {any} */ err) {
        expect(err).toBeInstanceOf(WriterError);
        expect((err as any).code).toBe('WRITER_CAS_CONFLICT');
        expect((err as any).expectedSha).toBe(expectedParent);
        expect((err as any).actualSha).toBeNull();
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

      const builder = new PatchBuilder({
        persistence,
        patchJournal: createPatchJournal(persistence),
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
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

      const builder = new PatchBuilder({
        persistence,
        patchJournal: createPatchJournal(persistence),
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
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
