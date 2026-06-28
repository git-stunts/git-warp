import { describe, it, expect } from 'vitest';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { encodeEdgeKey } from '../../../../src/domain/services/JoinReducer.ts';
import { decodePatchMessage } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { requirePatchOp } from '../PatchOperationAssertions.ts';
import {
  createPatchBuilder,
  createPatchBuilderMockPersistence as createMockPersistence,
  createPatchJournal,
  decodeWrittenPatch,
} from './PatchBuilderTestHarness.ts';

describe('PatchBuilder commit', () => {
  describe('commit()', () => {
    it('commits a patch and returns the commit SHA', async () => {
      const persistence = createMockPersistence();
      const builder = createPatchBuilder({
        persistence,
        patchJournal: createPatchJournal(persistence),
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      });

      builder.addNode('x');
      const sha = await builder.commit();

      expect(sha).toBe('c'.repeat(40));
      expect(persistence.writeBlob).toHaveBeenCalledOnce();
      expect(persistence.writeTree).toHaveBeenCalledOnce();
      expect(persistence.commitNodeWithTree).toHaveBeenCalledOnce();
      expect(persistence.compareAndSwapRef).toHaveBeenCalledWith(
        'refs/warp/test-graph/writers/writer1',
        'c'.repeat(40),
        null,
      );
    });

    it('throws error for empty patch', async () => {
      const persistence = createMockPersistence();
      const builder = createPatchBuilder({
        persistence,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      });

      await expect(builder.commit()).rejects.toThrow('Cannot commit empty patch');
    });

    it('creates commit with schema:2 in trailers', async () => {
      const persistence = createMockPersistence();
      const builder = createPatchBuilder({
        persistence,
        patchJournal: createPatchJournal(persistence),
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      });

      builder.addNode('x');
      await builder.commit();

      // Check the commit message passed to commitNodeWithTree
      const commitCall = persistence.commitNodeWithTree.mock.calls[0]![0];
      const decoded = decodePatchMessage(commitCall.message);

      expect(decoded.schema).toBe(2);
      expect(decoded.writer).toBe('writer1');
      expect(decoded.graph).toBe('test-graph');
      expect(decoded.lamport).toBe(1);
    });

    it('increments lamport when continuing from existing ref', async () => {
      const persistence = createMockPersistence();
      const existingSha = 'd'.repeat(40);
      const existingPatchOid = 'e'.repeat(40);
      // Simulate existing ref with lamport 5
      persistence.readRef.mockResolvedValue(existingSha);
      persistence.showNode.mockResolvedValue(
        `warp:patch\n\neg-kind: patch\neg-graph: test-graph\neg-writer: writer1\neg-lamport: 5\neg-patch-oid: ${existingPatchOid}\neg-schema: 2`
      );

      const builder = createPatchBuilder({
        persistence,
        patchJournal: createPatchJournal(persistence),
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1, // Constructor lamport is 1, but commit should use 6
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
        expectedParentSha: existingSha, // Race detection: expected parent matches current ref
      });

      builder.addNode('x');
      await builder.commit();

      // Check the commit has lamport 6 (5 + 1)
      const commitCall = persistence.commitNodeWithTree.mock.calls[0]![0];
      const decoded = decodePatchMessage(commitCall.message);
      expect(decoded.lamport).toBe(6);

      // Parent should be the existing commit
      expect(commitCall.parents).toEqual([existingSha]);
    });

    it('creates tree with patch.cbor blob', async () => {
      const persistence = createMockPersistence();
      const builder = createPatchBuilder({
        persistence,
        patchJournal: createPatchJournal(persistence),
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      });

      builder.addNode('x');
      await builder.commit();

      // Check writeTree was called with correct format
      const treeCall = persistence.writeTree.mock.calls[0]![0];
      expect(treeCall).toHaveLength(1);
      expect(treeCall[0]).toMatch(/^100644 blob [a-f0-9]+\tpatch\.cbor$/);
    });

    it('writes patch blob with CBOR encoding', async () => {
      const persistence = createMockPersistence();
      const patchJournal = createPatchJournal(persistence);
      const vv = VersionVector.empty();
      vv.set('otherWriter', 3);

      const builder = createPatchBuilder({
        persistence,
        patchJournal,
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: vv,
        getCurrentState: () => null,
      });

      builder.addNode('x').setProperty('x', 'name', 'X');
      await builder.commit();

      // Decode the blob that was written
      const patch = decodeWrittenPatch(persistence);

      expect(patch.schema).toBe(2);
      expect(patch.writer).toBe('writer1');
      expect(patch.lamport).toBe(1);
      expect(patch.ops).toHaveLength(2);
      expect(requirePatchOp(patch, 0)).toMatchObject({ type: 'NodeAdd' });
      expect(requirePatchOp(patch, 1)).toMatchObject({ type: 'PropSet' });
      // Context should be serialized version vector
      expect(patch.context).toBeDefined();
    });

    it('first commit has no parents', async () => {
      const persistence = createMockPersistence();
      // No existing ref
      persistence.readRef.mockResolvedValue(null);

      const builder = createPatchBuilder({
        persistence,
        patchJournal: createPatchJournal(persistence),
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      });

      builder.addNode('x');
      await builder.commit();

      const commitCall = persistence.commitNodeWithTree.mock.calls[0]![0];
      expect(commitCall.parents).toEqual([]);
    });
  });

  describe('use-after-commit guard', () => {
    async function createCommittedBuilder() {
      const persistence = createMockPersistence();
      const builder = createPatchBuilder({
        persistence,
        patchJournal: createPatchJournal(persistence),
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      });
      builder.addNode('x');
      await builder.commit();
      return { builder, persistence };
    }

    it('throws after commit when calling addNode', async () => {
      const { builder } = await createCommittedBuilder();
      expect(() => builder.addNode('y')).toThrow('PatchBuilder already committed — create a new builder');
    });

    it('throws after commit when calling removeNode', async () => {
      const { builder } = await createCommittedBuilder();
      expect(() => builder.removeNode('x')).toThrow('PatchBuilder already committed — create a new builder');
    });

    it('throws after commit when calling addEdge', async () => {
      const { builder } = await createCommittedBuilder();
      expect(() => builder.addEdge('a', 'b', 'rel')).toThrow('PatchBuilder already committed — create a new builder');
    });

    it('throws after commit when calling removeEdge', async () => {
      const { builder } = await createCommittedBuilder();
      expect(() => builder.removeEdge('a', 'b', 'rel')).toThrow('PatchBuilder already committed — create a new builder');
    });

    it('throws after commit when calling setProperty', async () => {
      const { builder } = await createCommittedBuilder();
      expect(() => builder.setProperty('x', 'name', 'Alice')).toThrow('PatchBuilder already committed — create a new builder');
    });

    it('throws after commit when calling setEdgeProperty', async () => {
      const { builder } = await createCommittedBuilder();
      expect(() => builder.setEdgeProperty('a', 'b', 'rel', 'since', '2026-01-01')).toThrow('PatchBuilder already committed — create a new builder');
    });

    it('throws after commit when calling attachContent', async () => {
      const { builder, persistence } = await createCommittedBuilder();
      const initialWriteBlobCalls = persistence.writeBlob.mock.calls.length;
      await expect(builder.attachContent('x', 'payload')).rejects.toThrow('PatchBuilder already committed — create a new builder');
      expect(persistence.writeBlob).toHaveBeenCalledTimes(initialWriteBlobCalls);
    });

    it('throws after commit when calling attachEdgeContent', async () => {
      const { builder, persistence } = await createCommittedBuilder();
      const initialWriteBlobCalls = persistence.writeBlob.mock.calls.length;
      await expect(builder.attachEdgeContent('a', 'b', 'rel', 'payload')).rejects.toThrow('PatchBuilder already committed — create a new builder');
      expect(persistence.writeBlob).toHaveBeenCalledTimes(initialWriteBlobCalls);
    });

    it('throws after commit when calling commit again', async () => {
      const { builder } = await createCommittedBuilder();
      await expect(builder.commit()).rejects.toThrow('PatchBuilder already committed — create a new builder');
    });

    it('throws during an in-flight commit when mutating or committing again', async () => {
      let releaseReadRef: (value: string | null) => void = () => {};
      const readRefPromise: Promise<string | null> = new Promise((resolve) => {
        releaseReadRef = resolve;
      });
      const persistence = createMockPersistence();
      persistence.readRef.mockImplementation(() => readRefPromise);
      const builder = createPatchBuilder({
        persistence,
        patchJournal: createPatchJournal(persistence),
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      });

      builder.addNode('x');
      const pendingCommit = builder.commit();

      expect(() => builder.addNode('y')).toThrow('PatchBuilder already committed — create a new builder');
      await expect(builder.commit()).rejects.toThrow('PatchBuilder already committed — create a new builder');

      releaseReadRef(null);
      await expect(pendingCommit).resolves.toBe('c'.repeat(40));
    });

    it('allows reading ops/reads/writes/versionVector after commit', async () => {
      const persistence = createMockPersistence();
      const builder = createPatchBuilder({
        persistence,
        patchJournal: createPatchJournal(persistence),
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      });

      builder.addEdge('user:alice', 'user:bob', 'follows');
      await builder.commit();

      const edgeKey = encodeEdgeKey('user:alice', 'user:bob', 'follows');
      expect(builder.ops).toHaveLength(1);
      expect(builder.reads.has('user:alice')).toBe(true);
      expect(builder.reads.has('user:bob')).toBe(true);
      expect(builder.writes.has(edgeKey)).toBe(true);
      expect(builder.versionVector.get('writer1')).toBe(1);
    });

    it('does NOT set _committed on failed commit (CAS ref advance throws)', async () => {
      const persistence = createMockPersistence();
      persistence.compareAndSwapRef.mockRejectedValueOnce(new Error('simulated compareAndSwapRef failure'));
      const builder = createPatchBuilder({
        persistence,
        patchJournal: createPatchJournal(persistence),
        graphName: 'test-graph',
        writerId: 'writer1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
      });

      builder.addNode('x');
      await expect(builder.commit()).rejects.toThrow('simulated compareAndSwapRef failure');
      await expect(builder.commit()).resolves.toBe('c'.repeat(40));
    });
  });

});
