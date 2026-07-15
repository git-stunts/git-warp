/**
 * Tests for Writer SPEC (WARP schema:2 only).
 *
 * @see src/domain/warp/Writer.js
 * @see src/domain/warp/PatchSession.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Writer, WriterError } from '../../../../src/domain/warp/Writer.ts';
import { PatchSession } from '../../../../src/domain/warp/PatchSession.ts';
import { buildWriterRef, validateWriterId } from '../../../../src/domain/utils/RefLayout.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { encodeEdgeKey } from '../../../../src/domain/services/JoinReducer.ts';
import {
  DEFAULT_COMMIT_MESSAGE_CODEC,
  encodePatchMessage,
} from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { RecordingPatchJournal } from '../services/PatchBuilderTestHarness.ts';

/**
 * Creates a minimal mock persistence adapter.
 */
function createMockPersistence() {
  const persistence = {
    readRef: vi.fn(),
    updateRef: vi.fn(),
    compareAndSwapRef: vi.fn(),
    showNode: vi.fn(),
    getNodeInfo: vi.fn(),
    writeBlob: vi.fn(),
    writeTree: vi.fn(),
    commitNodeWithTree: vi.fn(),
    readBlob: vi.fn(),
  };
  persistence.compareAndSwapRef.mockImplementation(async (ref, newOid, expectedOid) => {
    const actualOid = await persistence.readRef(ref);
    if (actualOid !== expectedOid) {
      throw new Error(`CAS mismatch for ${ref}`);
    }
    persistence.readRef.mockResolvedValue(newOid);
  });
  return persistence;
}

/**
 * Creates a semantic journal that records published patches.
 * @param {ReturnType<typeof createMockPersistence>} persistence
 * @returns {RecordingPatchJournal}
 */
function createPatchJournal(persistence) {
  return new WriterFixtureJournal(persistence);
}

class WriterFixtureJournal extends RecordingPatchJournal {
  readonly _persistence;

  constructor(persistence) {
    super(persistence);
    this._persistence = persistence;
    this.sha = 'b'.repeat(40);
  }

  override async appendPatch(request) {
    const published = await super.appendPatch(request);
    await this._persistence.compareAndSwapRef(
      request.targetRef,
      published.sha,
      request.expectedHead,
    );
    return published;
  }
}

/**
 * Creates a mock patch commit message.
 */
function createPatchMessage(lamport = 1) {
  return encodePatchMessage({
    graph: 'events',
    writer: 'alice',
    lamport,
    patchOid: 'a'.repeat(40),
    schema: 2,
  });
}

describe('Writer (WARP schema:2)', () => {
  let persistence;
  let versionVector;
  let getCurrentState;

  beforeEach(() => {
    persistence = createMockPersistence();
    versionVector = VersionVector.empty();
    getCurrentState = vi.fn(() => null);
  });

  it('test fixture compareAndSwapRef rejects expected-head mismatches', async () => {
    const currentSha = 'a'.repeat(40);
    const nextSha = 'b'.repeat(40);
    persistence.readRef.mockResolvedValue(currentSha);

    await expect(
      persistence.compareAndSwapRef('refs/warp/events/writers/alice', nextSha, null)
    ).rejects.toThrow('CAS mismatch');
  });

  describe('constructor', () => {
    it('validates writerId using existing ref-safety rules', () => {
      expect(() => validateWriterId('alice')).not.toThrow();
      expect(() => validateWriterId('a/b')).toThrow(); // slash rejected
    });

    it('throws on invalid writerId', () => {
      expect(() => new Writer((({
        persistence,
        graphName: 'events',
        writerId: 'a/b',
        versionVector,
        getCurrentState,
      }) as any))).toThrow('Invalid writer ID');
    });

    it('throws when patchJournal is missing', () => {
      expect(() => new Writer((({
        persistence,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      }) as any))).toThrow('patchJournal is required');
    });

    it('accepts valid writerId', () => {
      const writer = new Writer({
        persistence,
        patchJournal: createPatchJournal(persistence),
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });
      expect(writer.writerId).toBe('alice');
      expect(writer.graphName).toBe('events');
    });
  });

  describe('ref paths', () => {
    it('uses refs/warp/<graph>/writers/<writerId> for writer chain tip', () => {
      const ref = buildWriterRef('events', 'alice');
      expect(ref).toBe('refs/warp/events/writers/alice');
    });
  });

  describe('head()', () => {
    it('returns null when no commits exist', async () => {
      persistence.readRef.mockResolvedValue(null);

      const writer = new Writer({
        persistence,
        patchJournal: createPatchJournal(persistence),
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const head = await writer.head();
      expect(head).toBeNull();
      expect(persistence.readRef).toHaveBeenCalledWith('refs/warp/events/writers/alice');
    });

    it('returns SHA when commits exist', async () => {
      const sha = 'a'.repeat(40);
      persistence.readRef.mockResolvedValue(sha);

      const writer = new Writer({
        persistence,
        patchJournal: createPatchJournal(persistence),
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const head = await writer.head();
      expect(head).toBe(sha);
    });
  });

  describe('beginPatch()', () => {
    it('reads current writer head and captures it as expectedOld', async () => {
      const oldHead = 'a'.repeat(40);
      persistence.readRef.mockResolvedValue(oldHead);
      persistence.showNode.mockResolvedValue(createPatchMessage(5));

      const writer = new Writer({
        persistence,
        patchJournal: createPatchJournal(persistence),
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const patch = await writer.beginPatch();

      expect(persistence.readRef).toHaveBeenCalledWith('refs/warp/events/writers/alice');
      expect(patch._expectedOldHeadForTest).toBe(oldHead);
    });

    it('returns a PatchSession', async () => {
      persistence.readRef.mockResolvedValue(null);

      const writer = new Writer({
        persistence,
        patchJournal: createPatchJournal(persistence),
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const patch = await writer.beginPatch();
      expect(patch).toBeInstanceOf(PatchSession);
    });

    it('captures null as expectedOld for first commit', async () => {
      persistence.readRef.mockResolvedValue(null);

      const writer = new Writer({
        persistence,
        patchJournal: createPatchJournal(persistence),
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const patch = await writer.beginPatch();
      expect(patch._expectedOldHeadForTest).toBeNull();
    });
  });

  describe('PatchSession fluent API', () => {
    it('supports chaining operations', async () => {
      persistence.readRef.mockResolvedValue(null);

      const writer = new Writer({
        persistence,
        patchJournal: createPatchJournal(persistence),
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const patch = await writer.beginPatch();

      const result = patch
        .addNode('n1')
        .addNode('n2')
        .addEdge('n1', 'n2', 'links')
        .setProperty('n1', 'name', 'Node 1');

      expect(result).toBe(patch); // Returns self for chaining
      expect(patch.opCount).toBe(4);
    });

    it('tracks operation count', async () => {
      persistence.readRef.mockResolvedValue(null);

      const writer = new Writer({
        persistence,
        patchJournal: createPatchJournal(persistence),
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const patch = await writer.beginPatch();
      expect(patch.opCount).toBe(0);

      patch.addNode('n1');
      expect(patch.opCount).toBe(1);

      patch.addEdge('n1', 'n2', 'x');
      expect(patch.opCount).toBe(2);
    });
  });

  describe('commit()', () => {
    it('rejects empty patches (EMPTY_PATCH)', async () => {
      persistence.readRef.mockResolvedValue(null);

      const writer = new Writer({
        persistence,
        patchJournal: createPatchJournal(persistence),
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const patch = await writer.beginPatch();

      await expect(patch.commit()).rejects.toMatchObject({ code: 'EMPTY_PATCH' });
    });

    it('publishes with parent = previous writer head', async () => {
      const oldHead = 'a'.repeat(40);
      const newSha = 'b'.repeat(40);

      persistence.readRef.mockResolvedValue(oldHead);
      persistence.showNode.mockResolvedValue(createPatchMessage(5));
      persistence.writeBlob.mockResolvedValue('c'.repeat(40));
      persistence.writeTree.mockResolvedValue('d'.repeat(40));
      persistence.commitNodeWithTree.mockResolvedValue(newSha);
      persistence.updateRef.mockResolvedValue(undefined);

      const patchJournal = createPatchJournal(persistence);
      const writer = new Writer({
        persistence,
        patchJournal,
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const patch = await writer.beginPatch();
      patch.addNode('x');
      const sha = await patch.commit();

      expect(sha).toBe(newSha);

      expect(patchJournal.requests).toHaveLength(1);
      expect(patchJournal.requests[0]).toMatchObject({
        graph: 'events',
        writer: 'alice',
        targetRef: 'refs/warp/events/writers/alice',
        expectedHead: oldHead,
        parent: oldHead,
      });
    });

    it('publishes a first patch with no parent', async () => {
      const newSha = 'b'.repeat(40);

      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue('c'.repeat(40));
      persistence.writeTree.mockResolvedValue('d'.repeat(40));
      persistence.commitNodeWithTree.mockResolvedValue(newSha);
      persistence.updateRef.mockResolvedValue(undefined);

      const patchJournal = createPatchJournal(persistence);
      const writer = new Writer({
        persistence,
        patchJournal,
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const patch = await writer.beginPatch();
      patch.addNode('x');
      await patch.commit();

      expect(patchJournal.requests[0]).toMatchObject({
        expectedHead: null,
        parent: null,
      });
    });

    it('delegates atomic publication coordinates to the patch journal', async () => {
      const newSha = 'b'.repeat(40);

      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue('c'.repeat(40));
      persistence.writeTree.mockResolvedValue('d'.repeat(40));
      persistence.commitNodeWithTree.mockResolvedValue(newSha);
      const patchJournal = createPatchJournal(persistence);
      const writer = new Writer({
        persistence,
        patchJournal,
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const patch = await writer.beginPatch();
      patch.addNode('x');
      await patch.commit();

      expect(patchJournal.requests[0]).toMatchObject({
        targetRef: 'refs/warp/events/writers/alice',
        expectedHead: null,
        parent: null,
      });
    });

    it('prevents double commit', async () => {
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue('c'.repeat(40));
      persistence.writeTree.mockResolvedValue('d'.repeat(40));
      persistence.commitNodeWithTree.mockResolvedValue('b'.repeat(40));
      persistence.updateRef.mockResolvedValue(undefined);

      const writer = new Writer({
        persistence,
        patchJournal: createPatchJournal(persistence),
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const patch = await writer.beginPatch();
      patch.addNode('x');
      await patch.commit();

      // Second commit should fail
      await expect(patch.commit()).rejects.toThrow('already committed');
    });

    it('prevents adding operations after commit', async () => {
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue('c'.repeat(40));
      persistence.writeTree.mockResolvedValue('d'.repeat(40));
      persistence.commitNodeWithTree.mockResolvedValue('b'.repeat(40));
      persistence.updateRef.mockResolvedValue(undefined);

      const writer = new Writer({
        persistence,
        patchJournal: createPatchJournal(persistence),
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const patch = await writer.beginPatch();
      patch.addNode('x');
      await patch.commit();

      // Adding more ops should fail
      expect(() => patch.addNode('y')).toThrow('already committed');
    });
  });

  describe('CAS (Compare-And-Swap) semantics', () => {
    it('fails with WRITER_REF_ADVANCED when ref moved since beginPatch', async () => {
      const oldHead = 'a'.repeat(40);
      const movedHead = 'x'.repeat(40);

      // First call returns oldHead (for beginPatch)
      // Second call returns movedHead (simulating concurrent commit)
      persistence.readRef
        .mockResolvedValueOnce(oldHead)
        .mockResolvedValueOnce(movedHead);
      persistence.showNode.mockResolvedValue(createPatchMessage(5));

      const writer = new Writer({
        persistence,
        patchJournal: createPatchJournal(persistence),
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const patch = await writer.beginPatch();
      patch.addNode('x');

      await expect(patch.commit()).rejects.toMatchObject({ code: 'WRITER_REF_ADVANCED' });
    });

    it('concurrent patches from same writerId: second commit must fail', async () => {
      const oldHead = 'a'.repeat(40);
      const newSha1 = 'b'.repeat(40);
      const newSha2 = 'c'.repeat(40);

      // Setup: both patches see same head at begin time
      persistence.showNode.mockResolvedValue(createPatchMessage(5));

      // Sequence of readRef calls:
      // 1. p1 beginPatch -> oldHead
      // 2. p2 beginPatch -> oldHead
      // 3. p1 commit PatchBuilder preflight CAS check -> oldHead
      // 4. p1 final compareAndSwapRef compare -> oldHead
      // 5. p1 visibility check after CAS -> newSha1
      // 6. p2 commit PatchBuilder preflight CAS check -> newSha1 (fails here)
      persistence.readRef
        .mockResolvedValueOnce(oldHead)  // p1 beginPatch
        .mockResolvedValueOnce(oldHead)  // p2 beginPatch
        .mockResolvedValueOnce(oldHead)  // p1 commit PatchBuilder preflight
        .mockResolvedValueOnce(oldHead)  // p1 final compareAndSwapRef compare
        .mockResolvedValueOnce(newSha1)  // p1 visibility check after CAS
        .mockResolvedValueOnce(newSha1); // p2 commit PatchBuilder preflight (fails)

      persistence.writeBlob.mockResolvedValue('d'.repeat(40));
      persistence.writeTree.mockResolvedValue('e'.repeat(40));
      persistence.commitNodeWithTree
        .mockResolvedValueOnce(newSha1)
        .mockResolvedValueOnce(newSha2);
      persistence.updateRef.mockResolvedValue(undefined);

      const writer = new Writer({
        persistence,
        patchJournal: createPatchJournal(persistence),
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const p1 = await writer.beginPatch();
      const p2 = await writer.beginPatch();

      p1.addNode('n1');
      p2.addNode('n2');

      // First commit succeeds
      await expect(p1.commit()).resolves.toBe(newSha1);

      // Second commit fails (ref advanced)
      await expect(p2.commit()).rejects.toMatchObject({ code: 'WRITER_REF_ADVANCED' });
    });

    it('error message includes expected and actual SHAs', async () => {
      const oldHead = 'a'.repeat(40);
      const movedHead = 'x'.repeat(40);

      persistence.readRef
        .mockResolvedValueOnce(oldHead)
        .mockResolvedValueOnce(movedHead);
      persistence.showNode.mockResolvedValue(createPatchMessage(5));

      const writer = new Writer({
        persistence,
        patchJournal: createPatchJournal(persistence),
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const patch = await writer.beginPatch();
      patch.addNode('x');

      try {
        await patch.commit();
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as any).message).toContain(oldHead);
        expect((err as any).message).toContain(movedHead);
        expect((err as any).message).toContain('beginPatch()');
      }
    });
  });

  describe('commitPatch() convenience method', () => {
    it('builds and commits in one call', async () => {
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue('c'.repeat(40));
      persistence.writeTree.mockResolvedValue('d'.repeat(40));
      persistence.commitNodeWithTree.mockResolvedValue('b'.repeat(40));
      persistence.updateRef.mockResolvedValue(undefined);

      const writer = new Writer({
        persistence,
        patchJournal: createPatchJournal(persistence),
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const sha = await writer.commitPatch(p => {
        p.addNode('user:alice');
        p.setProperty('user:alice', 'name', 'Alice');
      });

      expect(sha).toBe('b'.repeat(40));
    });

    it('supports async builder function', async () => {
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue('c'.repeat(40));
      persistence.writeTree.mockResolvedValue('d'.repeat(40));
      persistence.commitNodeWithTree.mockResolvedValue('b'.repeat(40));
      persistence.updateRef.mockResolvedValue(undefined);

      const writer = new Writer({
        persistence,
        patchJournal: createPatchJournal(persistence),
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const sha = await writer.commitPatch(async p => {
        await Promise.resolve();
        p.addNode('user:alice');
      });

      expect(sha).toBe('b'.repeat(40));
    });
  });

  describe('commitPatch() reentrancy guard', () => {
    it('throws COMMIT_IN_PROGRESS when nested inside callback', async () => {
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue('c'.repeat(40));
      persistence.writeTree.mockResolvedValue('d'.repeat(40));
      persistence.commitNodeWithTree.mockResolvedValue('b'.repeat(40));
      persistence.updateRef.mockResolvedValue(undefined);

      const writer = new Writer({
        persistence,
        patchJournal: createPatchJournal(persistence),
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      await expect(
        writer.commitPatch(async (p) => {
          p.addNode('user:alice');
          // Nested commitPatch should throw
          await writer.commitPatch(p2 => { p2.addNode('user:bob'); });
        })
      ).rejects.toMatchObject({ code: 'COMMIT_IN_PROGRESS' });
    });

    it('resets guard after sync throw in callback', async () => {
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue('c'.repeat(40));
      persistence.writeTree.mockResolvedValue('d'.repeat(40));
      persistence.commitNodeWithTree.mockResolvedValue('b'.repeat(40));
      persistence.updateRef.mockResolvedValue(undefined);

      const writer = new Writer({
        persistence,
        patchJournal: createPatchJournal(persistence),
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      // First call: callback throws
      await expect(
        writer.commitPatch(() => { throw new Error('sync boom'); })
      ).rejects.toThrow('sync boom');

      // Second call should work (guard reset)
      const sha = await writer.commitPatch(p => { p.addNode('x'); });
      expect(sha).toBe('b'.repeat(40));
    });

    it('resets guard after async reject in callback', async () => {
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue('c'.repeat(40));
      persistence.writeTree.mockResolvedValue('d'.repeat(40));
      persistence.commitNodeWithTree.mockResolvedValue('b'.repeat(40));
      persistence.updateRef.mockResolvedValue(undefined);

      const writer = new Writer({
        persistence,
        patchJournal: createPatchJournal(persistence),
        commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      // First call: callback rejects
      await expect(
        writer.commitPatch(async () => { throw new Error('async boom'); })
      ).rejects.toThrow('async boom');

      // Second call should work (guard reset)
      const sha = await writer.commitPatch(p => { p.addNode('y'); });
      expect(sha).toBe('b'.repeat(40));
    });
  });

  describe('WriterError', () => {
    it('has correct name and code properties', () => {
      const err = new WriterError('test message', { code: 'TEST_CODE' });
      expect(err.name).toBe('WriterError');
      expect(err.code).toBe('TEST_CODE');
      expect(err.message).toBe('test message');
    });

    it('preserves cause', () => {
      const cause = new Error('original');
      const err = new WriterError('wrapped error', { code: 'WRAPPED', cause });
      expect(err.cause).toBe(cause);
    });

    it('is instanceof Error', () => {
      const err = new WriterError('msg', { code: 'CODE' });
      expect(err instanceof Error).toBe(true);
      expect(err instanceof WriterError).toBe(true);
    });
  });
});
