import { describe, it, expect, vi } from 'vitest';
import { PatchBuilderV2 } from '../../../../src/domain/services/PatchBuilderV2.js';
import { createVersionVector } from '../../../../src/domain/crdt/VersionVector.js';
import { createORSet, orsetAdd } from '../../../../src/domain/crdt/ORSet.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';
import { encodeEdgeKey } from '../../../../src/domain/services/KeyCodec.js';

/**
 * Creates a mock persistence adapter for testing.
 * @param {Object} [overrides]
 * @returns {any}
 */
function createMockPersistence(overrides = {}) {
  return {
    readRef: vi.fn().mockResolvedValue(null),
    showNode: vi.fn(),
    writeBlob: vi.fn().mockResolvedValue('d'.repeat(40)),
    writeTree: vi.fn().mockResolvedValue('e'.repeat(40)),
    commitNodeWithTree: vi.fn().mockResolvedValue('f'.repeat(40)),
    updateRef: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Creates a mock V5 state for testing.
 * @returns {any}
 */
function createMockState() {
  return {
    nodeAlive: createORSet(),
    edgeAlive: createORSet(),
    prop: new Map(),
    observedFrontier: createVersionVector(),
  };
}

describe('PatchBuilderV2 content attachment', () => {
  describe('attachContent()', () => {
    it('writes blob and sets _content property', async () => {
      const persistence = createMockPersistence({
        writeBlob: vi.fn().mockResolvedValue('abc123'),
      });
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        writerId: 'w1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      await builder.attachContent('node:1', 'hello world');

      expect(persistence.writeBlob).toHaveBeenCalledWith('hello world');
      const patch = builder.build();
      expect(patch.ops).toHaveLength(1);
      expect(patch.ops[0]).toMatchObject({
        type: 'PropSet',
        node: 'node:1',
        key: '_content',
        value: 'abc123',
      });
    });

    it('tracks blob OID in _contentBlobs', async () => {
      const persistence = createMockPersistence({
        writeBlob: vi.fn().mockResolvedValue('abc123'),
      });
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        writerId: 'w1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      await builder.attachContent('node:1', 'content');

      expect(builder._contentBlobs).toEqual(['abc123']);
    });

    it('returns the builder for chaining', async () => {
      const persistence = createMockPersistence();
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        writerId: 'w1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      const result = await builder.attachContent('node:1', 'content');
      expect(result).toBe(builder);
    });

    it('propagates writeBlob errors', async () => {
      const persistence = createMockPersistence({
        writeBlob: vi.fn().mockRejectedValue(new Error('disk full')),
      });
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        writerId: 'w1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      await expect(builder.attachContent('node:1', 'x')).rejects.toThrow('disk full');
    });
  });

  describe('attachEdgeContent()', () => {
    it('writes blob and sets _content edge property', async () => {
      const state = createMockState();
      const edgeKey = encodeEdgeKey('a', 'b', 'rel');
      orsetAdd(state.edgeAlive, edgeKey, createDot('w1', 1));

      const persistence = createMockPersistence({
        writeBlob: vi.fn().mockResolvedValue('def456'),
      });
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        writerId: 'w1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => state,
      }));

      await builder.attachEdgeContent('a', 'b', 'rel', Buffer.from('binary'));

      expect(persistence.writeBlob).toHaveBeenCalledWith(Buffer.from('binary'));
      const patch = builder.build();
      expect(patch.ops).toHaveLength(1);
      expect(patch.ops[0]).toMatchObject({
        type: 'PropSet',
        key: '_content',
        value: 'def456',
      });
      // Schema should be 3 (edge properties present)
      expect(patch.schema).toBe(3);
    });

    it('tracks blob OID in _contentBlobs', async () => {
      const state = createMockState();
      orsetAdd(state.edgeAlive, encodeEdgeKey('a', 'b', 'rel'), createDot('w1', 1));

      const persistence = createMockPersistence({
        writeBlob: vi.fn().mockResolvedValue('def456'),
      });
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        writerId: 'w1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => state,
      }));

      await builder.attachEdgeContent('a', 'b', 'rel', 'content');

      expect(builder._contentBlobs).toEqual(['def456']);
    });

    it('returns the builder for chaining', async () => {
      const state = createMockState();
      orsetAdd(state.edgeAlive, encodeEdgeKey('a', 'b', 'rel'), createDot('w1', 1));

      const persistence = createMockPersistence();
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        writerId: 'w1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => state,
      }));

      const result = await builder.attachEdgeContent('a', 'b', 'rel', 'x');
      expect(result).toBe(builder);
    });

    it('does not pollute _contentBlobs when edge does not exist', async () => {
      const persistence = createMockPersistence({
        writeBlob: vi.fn().mockResolvedValue('def456'),
      });
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        writerId: 'w1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => createMockState(),
      }));

      await expect(
        builder.attachEdgeContent('no', 'such', 'edge', 'content')
      ).rejects.toThrow();
      expect(builder._contentBlobs).toEqual([]);
    });
  });

  describe('multiple attachments in one patch', () => {
    it('tracks multiple blob OIDs', async () => {
      let callCount = 0;
      const persistence = createMockPersistence({
        writeBlob: vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve(`blob${callCount}`);
        }),
      });
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        writerId: 'w1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
      }));

      await builder.attachContent('node:1', 'first');
      await builder.attachContent('node:2', 'second');

      expect(builder._contentBlobs).toEqual(['blob1', 'blob2']);
      expect(persistence.writeBlob).toHaveBeenCalledTimes(2);
    });
  });

  describe('commit() with content blobs', () => {
    it('includes _content_<oid> entries in tree when content blobs exist', async () => {
      const contentOid = 'a'.repeat(40);
      const patchBlobOid = 'b'.repeat(40);
      const persistence = createMockPersistence({
        writeBlob: vi.fn()
          .mockResolvedValueOnce(contentOid) // attachContent writeBlob
          .mockResolvedValueOnce(patchBlobOid), // commit() CBOR blob
        writeTree: vi.fn().mockResolvedValue('c'.repeat(40)),
      });
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
        expectedParentSha: null,
      }));

      builder.addNode('n1');
      await builder.attachContent('n1', 'hello');
      await builder.commit();

      // writeTree should be called with both patch.cbor and _content_<oid>
      const treeEntries = persistence.writeTree.mock.calls[0][0];
      expect(treeEntries).toHaveLength(2);
      expect(treeEntries[0]).toBe(`100644 blob ${patchBlobOid}\tpatch.cbor`);
      expect(treeEntries[1]).toBe(`100644 blob ${contentOid}\t_content_${contentOid}`);
    });

    it('creates single-entry tree when no content blobs', async () => {
      const persistence = createMockPersistence();
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
        expectedParentSha: null,
      }));

      builder.addNode('n1');
      await builder.commit();

      const treeEntries = persistence.writeTree.mock.calls[0][0];
      expect(treeEntries).toHaveLength(1);
      expect(treeEntries[0]).toContain('patch.cbor');
    });

    it('includes multiple _content_<oid> entries for multiple attachments', async () => {
      let blobIdx = 0;
      const contentA = '1'.repeat(40);
      const contentB = '2'.repeat(40);
      const patchBlob = '3'.repeat(40);
      const blobOids = [contentA, contentB, patchBlob];
      const persistence = createMockPersistence({
        writeBlob: vi.fn().mockImplementation(() =>
          Promise.resolve(blobOids[blobIdx++])),
        writeTree: vi.fn().mockResolvedValue('4'.repeat(40)),
      });
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
        expectedParentSha: null,
      }));

      builder.addNode('n1').addNode('n2');
      await builder.attachContent('n1', 'first');
      await builder.attachContent('n2', 'second');
      await builder.commit();

      const treeEntries = persistence.writeTree.mock.calls[0][0];
      expect(treeEntries).toHaveLength(3);
      expect(treeEntries[0]).toContain('patch.cbor');
      expect(treeEntries[1]).toBe(`100644 blob ${contentA}\t_content_${contentA}`);
      expect(treeEntries[2]).toBe(`100644 blob ${contentB}\t_content_${contentB}`);
    });

    it('deduplicates tree entries when same content is attached to multiple nodes', async () => {
      const sharedOid = 'a'.repeat(40);
      const patchBlob = 'b'.repeat(40);
      let callCount = 0;
      const blobOids = [sharedOid, sharedOid, patchBlob];
      const persistence = createMockPersistence({
        writeBlob: vi.fn().mockImplementation(() =>
          Promise.resolve(blobOids[callCount++])),
        writeTree: vi.fn().mockResolvedValue('c'.repeat(40)),
      });
      const builder = new PatchBuilderV2(/** @type {any} */ ({
        persistence,
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: createVersionVector(),
        getCurrentState: () => null,
        expectedParentSha: null,
      }));

      builder.addNode('n1').addNode('n2');
      await builder.attachContent('n1', 'same-data');
      await builder.attachContent('n2', 'same-data');
      await builder.commit();

      const treeEntries = persistence.writeTree.mock.calls[0][0];
      expect(treeEntries).toHaveLength(2);
      expect(treeEntries[0]).toContain('patch.cbor');
      expect(treeEntries[1]).toBe(`100644 blob ${sharedOid}\t_content_${sharedOid}`);
    });
  });
});
