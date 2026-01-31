import { describe, it, expect, vi, beforeEach } from 'vitest';
import PatchBuilder from '../../../../src/domain/services/PatchBuilder.js';
import { decode } from '../../../../src/infrastructure/codecs/CborCodec.js';
import { decodePatchMessage } from '../../../../src/domain/services/WarpMessageCodec.js';

// Test fixtures
const VALID_OID = 'a'.repeat(40);

/**
 * Creates a mock persistence adapter for testing.
 * @returns {Object} Mock persistence adapter
 */
function createMockPersistence() {
  return {
    readRef: vi.fn(),
    showNode: vi.fn(),
    writeBlob: vi.fn(),
    writeTree: vi.fn(),
    commitNodeWithTree: vi.fn(),
    updateRef: vi.fn(),
  };
}

describe('PatchBuilder', () => {
  let persistence;
  let builder;

  beforeEach(() => {
    persistence = createMockPersistence();
    builder = new PatchBuilder({
      persistence,
      graphName: 'events',
      writerId: 'node-1',
    });
  });

  describe('fluent chaining', () => {
    it('addNode returns this for chaining', () => {
      const result = builder.addNode('user:alice');
      expect(result).toBe(builder);
    });

    it('removeNode returns this for chaining', () => {
      const result = builder.removeNode('user:alice');
      expect(result).toBe(builder);
    });

    it('addEdge returns this for chaining', () => {
      const result = builder.addEdge('user:alice', 'user:bob', 'follows');
      expect(result).toBe(builder);
    });

    it('removeEdge returns this for chaining', () => {
      const result = builder.removeEdge('user:alice', 'user:bob', 'follows');
      expect(result).toBe(builder);
    });

    it('setProperty returns this for chaining', () => {
      const result = builder.setProperty('user:alice', 'name', 'Alice');
      expect(result).toBe(builder);
    });

    it('supports method chaining', () => {
      const result = builder
        .addNode('user:alice')
        .addNode('user:bob')
        .addEdge('user:alice', 'user:bob', 'follows')
        .setProperty('user:alice', 'name', 'Alice');

      expect(result).toBe(builder);
      expect(builder.operationCount).toBe(4);
    });
  });

  describe('operationCount', () => {
    it('starts at 0', () => {
      expect(builder.operationCount).toBe(0);
    });

    it('increments with each operation', () => {
      builder.addNode('a');
      expect(builder.operationCount).toBe(1);

      builder.addNode('b');
      expect(builder.operationCount).toBe(2);

      builder.addEdge('a', 'b', 'link');
      expect(builder.operationCount).toBe(3);
    });
  });

  describe('commit', () => {
    beforeEach(() => {
      // Set up default mock responses
      persistence.readRef.mockResolvedValue(null); // No previous patch
      persistence.writeBlob.mockResolvedValue(VALID_OID);
      persistence.writeTree.mockResolvedValue(VALID_OID);
      persistence.commitNodeWithTree.mockResolvedValue(VALID_OID);
      persistence.updateRef.mockResolvedValue(undefined);
    });

    it('rejects empty patches', async () => {
      await expect(builder.commit()).rejects.toThrow('Cannot commit empty patch');
    });

    it('creates a patch commit for first patch', async () => {
      builder.addNode('user:alice');

      const commitSha = await builder.commit();

      expect(commitSha).toBe(VALID_OID);
      expect(persistence.writeBlob).toHaveBeenCalled();
      expect(persistence.writeTree).toHaveBeenCalled();
      expect(persistence.commitNodeWithTree).toHaveBeenCalled();
      expect(persistence.updateRef).toHaveBeenCalled();
    });

    it('writes CBOR-encoded patch blob', async () => {
      builder.addNode('user:alice');

      await builder.commit();

      // Verify writeBlob was called with a Buffer
      expect(persistence.writeBlob).toHaveBeenCalledTimes(1);
      const blobContent = persistence.writeBlob.mock.calls[0][0];
      expect(Buffer.isBuffer(blobContent)).toBe(true);

      // Decode and verify patch structure
      const patch = decode(blobContent);
      expect(patch.schema).toBe(1);
      expect(patch.writer).toBe('node-1');
      expect(patch.lamport).toBe(1);
      expect(patch.ops).toHaveLength(1);
      expect(patch.ops[0]).toEqual({ type: 'NodeAdd', node: 'user:alice' });
    });

    it('creates tree with patch.cbor entry', async () => {
      builder.addNode('user:alice');

      await builder.commit();

      expect(persistence.writeTree).toHaveBeenCalledTimes(1);
      const treeEntries = persistence.writeTree.mock.calls[0][0];
      expect(treeEntries).toHaveLength(1);
      expect(treeEntries[0]).toMatch(/^100644 blob [a-f0-9]{40}\tpatch\.cbor$/);
    });

    it('creates commit with correct message format', async () => {
      builder.addNode('user:alice');

      await builder.commit();

      const commitCall = persistence.commitNodeWithTree.mock.calls[0][0];
      expect(commitCall.treeOid).toBe(VALID_OID);
      expect(commitCall.parents).toEqual([]);

      // Verify commit message can be decoded
      const decoded = decodePatchMessage(commitCall.message);
      expect(decoded.kind).toBe('patch');
      expect(decoded.graph).toBe('events');
      expect(decoded.writer).toBe('node-1');
      expect(decoded.lamport).toBe(1);
      expect(decoded.patchOid).toBe(VALID_OID);
    });

    it('updates writer ref to new commit', async () => {
      builder.addNode('user:alice');

      await builder.commit();

      expect(persistence.updateRef).toHaveBeenCalledWith(
        'refs/empty-graph/events/writers/node-1',
        VALID_OID
      );
    });

    it('first patch has no parents', async () => {
      builder.addNode('user:alice');

      await builder.commit();

      const commitCall = persistence.commitNodeWithTree.mock.calls[0][0];
      expect(commitCall.parents).toEqual([]);
    });
  });

  describe('lamport increment', () => {
    const FIRST_COMMIT_SHA = 'b'.repeat(40);
    const SECOND_COMMIT_SHA = 'c'.repeat(40);

    beforeEach(() => {
      persistence.writeBlob.mockResolvedValue(VALID_OID);
      persistence.writeTree.mockResolvedValue(VALID_OID);
      persistence.updateRef.mockResolvedValue(undefined);
    });

    it('starts lamport at 1 for first patch', async () => {
      persistence.readRef.mockResolvedValue(null);
      persistence.commitNodeWithTree.mockResolvedValue(FIRST_COMMIT_SHA);

      builder.addNode('user:alice');
      await builder.commit();

      const blobContent = persistence.writeBlob.mock.calls[0][0];
      const patch = decode(blobContent);
      expect(patch.lamport).toBe(1);
    });

    it('increments lamport for subsequent patches', async () => {
      // First patch exists with lamport 5
      persistence.readRef.mockResolvedValue(FIRST_COMMIT_SHA);
      persistence.showNode.mockResolvedValue(`empty-graph:patch

eg-kind: patch
eg-graph: events
eg-writer: node-1
eg-lamport: 5
eg-patch-oid: ${VALID_OID}
eg-schema: 1`);
      persistence.commitNodeWithTree.mockResolvedValue(SECOND_COMMIT_SHA);

      builder.addNode('user:bob');
      await builder.commit();

      const blobContent = persistence.writeBlob.mock.calls[0][0];
      const patch = decode(blobContent);
      expect(patch.lamport).toBe(6);
    });

    it('uses previous commit as parent when it exists', async () => {
      persistence.readRef.mockResolvedValue(FIRST_COMMIT_SHA);
      persistence.showNode.mockResolvedValue(`empty-graph:patch

eg-kind: patch
eg-graph: events
eg-writer: node-1
eg-lamport: 1
eg-patch-oid: ${VALID_OID}
eg-schema: 1`);
      persistence.commitNodeWithTree.mockResolvedValue(SECOND_COMMIT_SHA);

      builder.addNode('user:bob');
      await builder.commit();

      const commitCall = persistence.commitNodeWithTree.mock.calls[0][0];
      expect(commitCall.parents).toEqual([FIRST_COMMIT_SHA]);
    });
  });

  describe('operation types', () => {
    beforeEach(() => {
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue(VALID_OID);
      persistence.writeTree.mockResolvedValue(VALID_OID);
      persistence.commitNodeWithTree.mockResolvedValue(VALID_OID);
      persistence.updateRef.mockResolvedValue(undefined);
    });

    it('creates correct NodeAdd operation', async () => {
      builder.addNode('user:alice');
      await builder.commit();

      const blobContent = persistence.writeBlob.mock.calls[0][0];
      const patch = decode(blobContent);
      expect(patch.ops[0]).toEqual({ type: 'NodeAdd', node: 'user:alice' });
    });

    it('creates correct NodeTombstone operation', async () => {
      builder.removeNode('user:alice');
      await builder.commit();

      const blobContent = persistence.writeBlob.mock.calls[0][0];
      const patch = decode(blobContent);
      expect(patch.ops[0]).toEqual({ type: 'NodeTombstone', node: 'user:alice' });
    });

    it('creates correct EdgeAdd operation', async () => {
      builder.addEdge('user:alice', 'user:bob', 'follows');
      await builder.commit();

      const blobContent = persistence.writeBlob.mock.calls[0][0];
      const patch = decode(blobContent);
      expect(patch.ops[0]).toEqual({
        type: 'EdgeAdd',
        from: 'user:alice',
        to: 'user:bob',
        label: 'follows',
      });
    });

    it('creates correct EdgeTombstone operation', async () => {
      builder.removeEdge('user:alice', 'user:bob', 'follows');
      await builder.commit();

      const blobContent = persistence.writeBlob.mock.calls[0][0];
      const patch = decode(blobContent);
      expect(patch.ops[0]).toEqual({
        type: 'EdgeTombstone',
        from: 'user:alice',
        to: 'user:bob',
        label: 'follows',
      });
    });

    it('creates correct PropSet operation with inline value', async () => {
      builder.setProperty('user:alice', 'name', 'Alice');
      await builder.commit();

      const blobContent = persistence.writeBlob.mock.calls[0][0];
      const patch = decode(blobContent);
      expect(patch.ops[0]).toEqual({
        type: 'PropSet',
        node: 'user:alice',
        key: 'name',
        value: { type: 'inline', value: 'Alice' },
      });
    });

    it('handles various property value types', async () => {
      builder
        .setProperty('node', 'string', 'hello')
        .setProperty('node', 'number', 42)
        .setProperty('node', 'boolean', true)
        .setProperty('node', 'null', null)
        .setProperty('node', 'array', [1, 2, 3])
        .setProperty('node', 'object', { key: 'value' });

      await builder.commit();

      const blobContent = persistence.writeBlob.mock.calls[0][0];
      const patch = decode(blobContent);
      expect(patch.ops).toHaveLength(6);

      expect(patch.ops[0].value).toEqual({ type: 'inline', value: 'hello' });
      expect(patch.ops[1].value).toEqual({ type: 'inline', value: 42 });
      expect(patch.ops[2].value).toEqual({ type: 'inline', value: true });
      expect(patch.ops[3].value).toEqual({ type: 'inline', value: null });
      expect(patch.ops[4].value).toEqual({ type: 'inline', value: [1, 2, 3] });
      expect(patch.ops[5].value).toEqual({ type: 'inline', value: { key: 'value' } });
    });
  });

  describe('complex patches', () => {
    beforeEach(() => {
      persistence.readRef.mockResolvedValue(null);
      persistence.writeBlob.mockResolvedValue(VALID_OID);
      persistence.writeTree.mockResolvedValue(VALID_OID);
      persistence.commitNodeWithTree.mockResolvedValue(VALID_OID);
      persistence.updateRef.mockResolvedValue(undefined);
    });

    it('preserves operation order', async () => {
      builder
        .addNode('a')
        .addNode('b')
        .addEdge('a', 'b', 'link')
        .setProperty('a', 'name', 'A')
        .removeEdge('a', 'b', 'link')
        .removeNode('b');

      await builder.commit();

      const blobContent = persistence.writeBlob.mock.calls[0][0];
      const patch = decode(blobContent);

      expect(patch.ops).toHaveLength(6);
      expect(patch.ops[0].type).toBe('NodeAdd');
      expect(patch.ops[1].type).toBe('NodeAdd');
      expect(patch.ops[2].type).toBe('EdgeAdd');
      expect(patch.ops[3].type).toBe('PropSet');
      expect(patch.ops[4].type).toBe('EdgeTombstone');
      expect(patch.ops[5].type).toBe('NodeTombstone');
    });
  });
});
