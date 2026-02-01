/**
 * Tests for Writer SPEC (WARP schema:2 only).
 *
 * @see src/domain/warp/Writer.js
 * @see src/domain/warp/PatchSession.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Writer, WriterError } from '../../../../src/domain/warp/Writer.js';
import { PatchSession } from '../../../../src/domain/warp/PatchSession.js';
import { buildWriterRef, validateWriterId } from '../../../../src/domain/utils/RefLayout.js';
import { createVersionVector } from '../../../../src/domain/crdt/VersionVector.js';
import { encodePatchMessage } from '../../../../src/domain/services/WarpMessageCodec.js';

/**
 * Creates a minimal mock persistence adapter.
 */
function createMockPersistence() {
  return {
    readRef: vi.fn(),
    updateRef: vi.fn(),
    showNode: vi.fn(),
    getNodeInfo: vi.fn(),
    writeBlob: vi.fn(),
    writeTree: vi.fn(),
    commitNodeWithTree: vi.fn(),
    readBlob: vi.fn(),
  };
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
    versionVector = createVersionVector();
    getCurrentState = vi.fn(() => null);
  });

  describe('constructor', () => {
    it('validates writerId using existing ref-safety rules', () => {
      expect(() => validateWriterId('alice')).not.toThrow();
      expect(() => validateWriterId('a/b')).toThrow(); // slash rejected
    });

    it('throws on invalid writerId', () => {
      expect(() => new Writer({
        persistence,
        graphName: 'events',
        writerId: 'a/b',
        versionVector,
        getCurrentState,
      })).toThrow('Invalid writer ID');
    });

    it('accepts valid writerId', () => {
      const writer = new Writer({
        persistence,
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
    it('uses refs/empty-graph/<graph>/writers/<writerId> for writer chain tip', () => {
      const ref = buildWriterRef('events', 'alice');
      expect(ref).toBe('refs/empty-graph/events/writers/alice');
    });
  });

  describe('head()', () => {
    it('returns null when no commits exist', async () => {
      persistence.readRef.mockResolvedValue(null);

      const writer = new Writer({
        persistence,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const head = await writer.head();
      expect(head).toBeNull();
      expect(persistence.readRef).toHaveBeenCalledWith('refs/empty-graph/events/writers/alice');
    });

    it('returns SHA when commits exist', async () => {
      const sha = 'a'.repeat(40);
      persistence.readRef.mockResolvedValue(sha);

      const writer = new Writer({
        persistence,
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
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const patch = await writer.beginPatch();

      expect(persistence.readRef).toHaveBeenCalledWith('refs/empty-graph/events/writers/alice');
      expect(patch._expectedOldHeadForTest).toBe(oldHead);
    });

    it('returns a PatchSession', async () => {
      persistence.readRef.mockResolvedValue(null);

      const writer = new Writer({
        persistence,
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
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const patch = await writer.beginPatch();

      await expect(patch.commit()).rejects.toMatchObject({ code: 'EMPTY_PATCH' });
    });

    it('creates commit with parent = previous writer head', async () => {
      const oldHead = 'a'.repeat(40);
      const newSha = 'b'.repeat(40);

      persistence.readRef.mockResolvedValue(oldHead);
      persistence.showNode.mockResolvedValue(createPatchMessage(5));
      persistence.writeBlob.mockResolvedValue('c'.repeat(40));
      persistence.writeTree.mockResolvedValue('d'.repeat(40));
      persistence.commitNodeWithTree.mockResolvedValue(newSha);
      persistence.updateRef.mockResolvedValue(undefined);

      const writer = new Writer({
        persistence,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const patch = await writer.beginPatch();
      patch.addNode('x');
      const sha = await patch.commit();

      expect(sha).toBe(newSha);

      // Verify commit was called with parent
      expect(persistence.commitNodeWithTree).toHaveBeenCalledWith(
        expect.objectContaining({
          parents: [oldHead],
        })
      );
    });

    it('first commit (no existing head) uses no parents', async () => {
      const newSha = 'b'.repeat(40);

      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue('c'.repeat(40));
      persistence.writeTree.mockResolvedValue('d'.repeat(40));
      persistence.commitNodeWithTree.mockResolvedValue(newSha);
      persistence.updateRef.mockResolvedValue(undefined);

      const writer = new Writer({
        persistence,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const patch = await writer.beginPatch();
      patch.addNode('x');
      await patch.commit();

      expect(persistence.commitNodeWithTree).toHaveBeenCalledWith(
        expect.objectContaining({
          parents: [],
        })
      );
    });

    it('updates writer ref after commit', async () => {
      const newSha = 'b'.repeat(40);

      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue('c'.repeat(40));
      persistence.writeTree.mockResolvedValue('d'.repeat(40));
      persistence.commitNodeWithTree.mockResolvedValue(newSha);
      persistence.updateRef.mockResolvedValue(undefined);

      const writer = new Writer({
        persistence,
        graphName: 'events',
        writerId: 'alice',
        versionVector,
        getCurrentState,
      });

      const patch = await writer.beginPatch();
      patch.addNode('x');
      await patch.commit();

      expect(persistence.updateRef).toHaveBeenCalledWith(
        'refs/empty-graph/events/writers/alice',
        newSha
      );
    });

    it('prevents double commit', async () => {
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue('c'.repeat(40));
      persistence.writeTree.mockResolvedValue('d'.repeat(40));
      persistence.commitNodeWithTree.mockResolvedValue('b'.repeat(40));
      persistence.updateRef.mockResolvedValue(undefined);

      const writer = new Writer({
        persistence,
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
      // 3. p1 commit PatchSession CAS check -> oldHead
      // 4. p1 commit PatchBuilderV2 CAS check -> oldHead
      // 5. (updateRef happens, ref is now newSha1)
      // 6. p2 commit PatchSession CAS check -> newSha1 (fails here)
      persistence.readRef
        .mockResolvedValueOnce(oldHead)  // p1 beginPatch
        .mockResolvedValueOnce(oldHead)  // p2 beginPatch
        .mockResolvedValueOnce(oldHead)  // p1 commit PatchSession
        .mockResolvedValueOnce(oldHead)  // p1 commit PatchBuilderV2
        .mockResolvedValueOnce(newSha1); // p2 commit PatchSession (fails)

      persistence.writeBlob.mockResolvedValue('d'.repeat(40));
      persistence.writeTree.mockResolvedValue('e'.repeat(40));
      persistence.commitNodeWithTree
        .mockResolvedValueOnce(newSha1)
        .mockResolvedValueOnce(newSha2);
      persistence.updateRef.mockResolvedValue(undefined);

      const writer = new Writer({
        persistence,
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
        expect(err.message).toContain(oldHead);
        expect(err.message).toContain(movedHead);
        expect(err.message).toContain('beginPatch()');
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

  describe('WriterError', () => {
    it('has correct name and code properties', () => {
      const err = new WriterError('TEST_CODE', 'test message');
      expect(err.name).toBe('WriterError');
      expect(err.code).toBe('TEST_CODE');
      expect(err.message).toBe('test message');
    });

    it('preserves cause', () => {
      const cause = new Error('original');
      const err = new WriterError('WRAPPED', 'wrapped error', cause);
      expect(err.cause).toBe(cause);
    });

    it('is instanceof Error', () => {
      const err = new WriterError('CODE', 'msg');
      expect(err instanceof Error).toBe(true);
      expect(err instanceof WriterError).toBe(true);
    });
  });
});

describe('PatchSession operations', () => {
  let persistence;
  let versionVector;
  let getCurrentState;

  beforeEach(() => {
    persistence = createMockPersistence();
    versionVector = createVersionVector();
    getCurrentState = vi.fn(() => null);
    persistence.readRef.mockResolvedValue(null);
  });

  it('addNode creates node-add op', async () => {
    const writer = new Writer({
      persistence,
      graphName: 'events',
      writerId: 'alice',
      versionVector,
      getCurrentState,
    });

    const patch = await writer.beginPatch();
    patch.addNode('user:alice');

    const built = patch.build();
    expect(built.ops).toHaveLength(1);
    expect(built.ops[0].type).toBe('NodeAdd');
    expect(built.ops[0].node).toBe('user:alice');
  });

  it('removeNode creates node-remove op', async () => {
    const writer = new Writer({
      persistence,
      graphName: 'events',
      writerId: 'alice',
      versionVector,
      getCurrentState,
    });

    const patch = await writer.beginPatch();
    patch.removeNode('user:alice');

    const built = patch.build();
    expect(built.ops).toHaveLength(1);
    expect(built.ops[0].type).toBe('NodeRemove');
    expect(built.ops[0].node).toBe('user:alice');
  });

  it('addEdge creates edge-add op', async () => {
    const writer = new Writer({
      persistence,
      graphName: 'events',
      writerId: 'alice',
      versionVector,
      getCurrentState,
    });

    const patch = await writer.beginPatch();
    patch.addEdge('n1', 'n2', 'links');

    const built = patch.build();
    expect(built.ops).toHaveLength(1);
    expect(built.ops[0].type).toBe('EdgeAdd');
    expect(built.ops[0].from).toBe('n1');
    expect(built.ops[0].to).toBe('n2');
    expect(built.ops[0].label).toBe('links');
  });

  it('removeEdge creates edge-remove op', async () => {
    const writer = new Writer({
      persistence,
      graphName: 'events',
      writerId: 'alice',
      versionVector,
      getCurrentState,
    });

    const patch = await writer.beginPatch();
    patch.removeEdge('n1', 'n2', 'links');

    const built = patch.build();
    expect(built.ops).toHaveLength(1);
    expect(built.ops[0].type).toBe('EdgeRemove');
  });

  it('setProperty creates prop-set op', async () => {
    const writer = new Writer({
      persistence,
      graphName: 'events',
      writerId: 'alice',
      versionVector,
      getCurrentState,
    });

    const patch = await writer.beginPatch();
    patch.setProperty('user:alice', 'name', 'Alice');

    const built = patch.build();
    expect(built.ops).toHaveLength(1);
    expect(built.ops[0].type).toBe('PropSet');
    expect(built.ops[0].node).toBe('user:alice');
    expect(built.ops[0].key).toBe('name');
    expect(built.ops[0].value).toBe('Alice');
  });

  it('supports various property value types', async () => {
    const writer = new Writer({
      persistence,
      graphName: 'events',
      writerId: 'alice',
      versionVector,
      getCurrentState,
    });

    const patch = await writer.beginPatch();
    patch.setProperty('n', 'str', 'hello');
    patch.setProperty('n', 'num', 42);
    patch.setProperty('n', 'bool', true);
    patch.setProperty('n', 'arr', [1, 2, 3]);
    patch.setProperty('n', 'obj', { x: 1 });

    const built = patch.build();
    expect(built.ops).toHaveLength(5);
    expect(built.ops[0].value).toBe('hello');
    expect(built.ops[1].value).toBe(42);
    expect(built.ops[2].value).toBe(true);
    expect(built.ops[3].value).toEqual([1, 2, 3]);
    expect(built.ops[4].value).toEqual({ x: 1 });
  });
});
