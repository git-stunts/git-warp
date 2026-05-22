import { describe, it, expect, vi } from 'vitest';
import { PatchBuilder } from '../../../../src/domain/services/PatchBuilder.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { encodeEdgeKey } from '../../../../src/domain/services/KeyCodec.ts';
import { CborPatchJournalAdapter } from '../../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';

/**
 * Creates a mock blob storage with configurable OID return.
 * @param {{ storeOid?: string }} [opts]
 * @returns {any}
 */
function createMockBlobStorage(opts: { storeOid?: string } = {}) {
  const oid = opts.storeOid || 'd'.repeat(40);
  return {
    store: vi.fn().mockResolvedValue(oid),
    retrieve: vi.fn(),
    storeStream: vi.fn().mockResolvedValue(oid),
    retrieveStream: vi.fn(),
  };
}

/**
 * Creates a mock persistence adapter for testing.
 * @param {Object} [overrides]
 * @returns {any}
 */
function createMockPersistence(overrides = {}) {
  const refs = new Map();
  const readRef = vi.fn(async (ref) => refs.get(ref) || null);
  return {
    readRef,
    showNode: vi.fn(),
    writeBlob: vi.fn().mockResolvedValue('d'.repeat(40)),
    writeTree: vi.fn().mockResolvedValue('e'.repeat(40)),
    commitNodeWithTree: vi.fn().mockResolvedValue('f'.repeat(40)),
    updateRef: vi.fn(async (ref, sha) => {
      refs.set(ref, sha);
    }),
    compareAndSwapRef: vi.fn(async (ref, newOid, expectedOid) => {
      const current = refs.get(ref) || null;
      if (current !== expectedOid) {
        throw new Error(`CAS mismatch on ${ref}`);
      }
      refs.set(ref, newOid);
      readRef.mockImplementation(async (nextRef) => refs.get(nextRef) || null);
    }),
    ...overrides,
  };
}

/**
 * Creates a mock V5 state for testing.
 * @returns {any}
 */
function createMockState() {
  return {
    nodeAlive: ORSet.empty(),
    edgeAlive: ORSet.empty(),
    prop: new Map(),
    observedFrontier: VersionVector.empty(),
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

describe('PatchBuilder content attachment', () => {
  describe('attachContent()', () => {
    it('writes blob and sets content reference metadata properties', async () => {
      const state = createMockState();
      state.nodeAlive.add('node:1', Dot.create('w1', 1));
      const persistence = createMockPersistence();
      const blobStorage = createMockBlobStorage({ storeOid: 'abc123' });
      const builder = new PatchBuilder((({
        persistence,
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
        blobStorage,
      }) as any));

      await builder.attachContent('node:1', 'hello world');

      expect(blobStorage.store).toHaveBeenCalledWith('hello world', { slug: 'g/node:1', mime: null, size: 11 });
      const patch = builder.build();
      expect(patch.ops).toHaveLength(3);
      expect(patch.ops).toContainEqual(expect.objectContaining({
        type: 'PropSet',
        node: 'node:1',
        key: '_content',
        value: 'abc123',
      }));
      expect(patch.ops).toContainEqual(expect.objectContaining({
        type: 'PropSet',
        node: 'node:1',
        key: '_content.size',
        value: 11,
      }));
      expect(patch.ops).toContainEqual(expect.objectContaining({
        type: 'PropSet',
        node: 'node:1',
        key: '_content.mime',
        value: null,
      }));
    });

    it('accepts optional content metadata and persists it alongside the blob oid', async () => {
      const state = createMockState();
      state.nodeAlive.add('node:1', Dot.create('w1', 1));
      const persistence = createMockPersistence();
      const blobStorage = createMockBlobStorage({ storeOid: 'abc123' });
      const builder = new PatchBuilder((({
        persistence,
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
        blobStorage,
      }) as any));

      await builder.attachContent('node:1', 'hello world', {
        mime: 'text/plain',
        size: 11,
      });

      const patch = builder.build();
      expect(patch.ops).toContainEqual(expect.objectContaining({
        key: '_content.mime',
        value: 'text/plain',
      }));
      expect(patch.ops).toContainEqual(expect.objectContaining({
        key: '_content.size',
        value: 11,
      }));
    });

    it('tracks blob OID in _contentBlobs', async () => {
      const state = createMockState();
      state.nodeAlive.add('node:1', Dot.create('w1', 1));
      const persistence = createMockPersistence();
      const blobStorage = createMockBlobStorage({ storeOid: 'abc123' });
      const builder = new PatchBuilder((({
        persistence,
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
        blobStorage,
      }) as any));

      await builder.attachContent('node:1', 'content');

      expect((builder as any)._contentBlobs).toEqual(['abc123']);
    });

    it('returns the builder for chaining', async () => {
      const state = createMockState();
      state.nodeAlive.add('node:1', Dot.create('w1', 1));
      const persistence = createMockPersistence();
      const blobStorage = createMockBlobStorage();
      const builder = new PatchBuilder((({
        persistence,
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
        blobStorage,
      }) as any));

      const result = await builder.attachContent('node:1', 'content');
      expect(result).toBe(builder);
    });

    it('propagates blob storage errors', async () => {
      const state = createMockState();
      state.nodeAlive.add('node:1', Dot.create('w1', 1));
      const persistence = createMockPersistence();
      const blobStorage = createMockBlobStorage();
      blobStorage.store = vi.fn().mockRejectedValue(new Error('disk full'));
      const builder = new PatchBuilder((({
        persistence,
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
        blobStorage,
      }) as any));

      await expect(builder.attachContent('node:1', 'x')).rejects.toThrow('disk full');
    });

    it('does not write blobs for unknown nodes', async () => {
      const persistence = createMockPersistence();
      const builder = new PatchBuilder((({
        persistence,
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => createMockState(),
      }) as any));

      await expect(builder.attachContent('missing:node', 'content'))
        .rejects.toThrow("Cannot attach content to unknown node 'missing:node': add the node first");
      expect(persistence.writeBlob).not.toHaveBeenCalled();
      expect((builder as any)._contentBlobs).toEqual([]);
    });

    it('rejects mismatched size metadata before writing the blob', async () => {
      const state = createMockState();
      state.nodeAlive.add('node:1', Dot.create('w1', 1));
      const persistence = createMockPersistence();
      const blobStorage = createMockBlobStorage();
      const builder = new PatchBuilder((({
        persistence,
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
        blobStorage,
      }) as any));

      await expect(builder.attachContent('node:1', 'hello', { size: 9 }))
        .rejects.toThrow('content metadata size 9 does not match actual byte size 5');
      expect(blobStorage.store).not.toHaveBeenCalled();
      expect((builder as any)._contentBlobs).toEqual([]);
    });
  });

  describe('clearContent()', () => {
    it('sets reserved content registers to null without writing a blob', () => {
      const state = createMockState();
      state.nodeAlive.add('node:1', Dot.create('w1', 1));
      const persistence = createMockPersistence();
      const builder = new PatchBuilder((({
        persistence,
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
      }) as any));

      const result = builder.clearContent('node:1');

      expect(result).toBe(builder);
      expect(persistence.writeBlob).not.toHaveBeenCalled();
      expect((builder as any)._contentBlobs).toEqual([]);
      const patch = builder.build();
      expect(patch.ops).toHaveLength(3);
      expect(patch.ops).toContainEqual(expect.objectContaining({
        type: 'PropSet',
        node: 'node:1',
        key: '_content',
        value: null,
      }));
      expect(patch.ops).toContainEqual(expect.objectContaining({
        type: 'PropSet',
        node: 'node:1',
        key: '_content.size',
        value: null,
      }));
      expect(patch.ops).toContainEqual(expect.objectContaining({
        type: 'PropSet',
        node: 'node:1',
        key: '_content.mime',
        value: null,
      }));
    });

    it('rejects unknown nodes without writing a blob', () => {
      const persistence = createMockPersistence();
      const builder = new PatchBuilder((({
        persistence,
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => createMockState(),
      }) as any));

      expect(() => builder.clearContent('missing:node'))
        .toThrow("Cannot attach content to unknown node 'missing:node': add the node first");
      expect(persistence.writeBlob).not.toHaveBeenCalled();
      expect((builder as any)._contentBlobs).toEqual([]);
    });
  });

  describe('attachEdgeContent()', () => {
    it('writes blob and sets content reference metadata on the edge', async () => {
      const state = createMockState();
      const edgeKey = encodeEdgeKey('a', 'b', 'rel');
      state.edgeAlive.add(edgeKey, Dot.create('w1', 1));

      const persistence = createMockPersistence();
      const blobStorage = createMockBlobStorage({ storeOid: 'def456' });
      const builder = new PatchBuilder((({
        persistence,
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
        blobStorage,
      }) as any));

      await builder.attachEdgeContent('a', 'b', 'rel', Buffer.from('binary'));

      expect(blobStorage.store).toHaveBeenCalledWith(Buffer.from('binary'), { slug: 'g/a/b/rel', mime: null, size: 6 });
      const patch = builder.build();
      expect(patch.ops).toHaveLength(3);
      expect(patch.ops).toContainEqual(expect.objectContaining({
        type: 'PropSet',
        key: '_content',
        value: 'def456',
      }));
      expect(patch.ops).toContainEqual(expect.objectContaining({
        type: 'PropSet',
        key: '_content.size',
        value: 6,
      }));
      expect(patch.ops).toContainEqual(expect.objectContaining({
        type: 'PropSet',
        key: '_content.mime',
        value: null,
      }));
      // Schema should be 3 (edge properties present)
      expect(patch.schema).toBe(3);
    });

    it('tracks blob OID in _contentBlobs', async () => {
      const state = createMockState();
      state.edgeAlive.add(encodeEdgeKey('a', 'b', 'rel'), Dot.create('w1', 1));

      const persistence = createMockPersistence();
      const blobStorage = createMockBlobStorage({ storeOid: 'def456' });
      const builder = new PatchBuilder((({
        persistence,
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
        blobStorage,
      }) as any));

      await builder.attachEdgeContent('a', 'b', 'rel', 'content');

      expect((builder as any)._contentBlobs).toEqual(['def456']);
    });

    it('returns the builder for chaining', async () => {
      const state = createMockState();
      state.edgeAlive.add(encodeEdgeKey('a', 'b', 'rel'), Dot.create('w1', 1));

      const persistence = createMockPersistence();
      const blobStorage = createMockBlobStorage();
      const builder = new PatchBuilder((({
        persistence,
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
        blobStorage,
      }) as any));

      const result = await builder.attachEdgeContent('a', 'b', 'rel', 'x');
      expect(result).toBe(builder);
    });

    it('does not pollute _contentBlobs when edge does not exist', async () => {
      const persistence = createMockPersistence({
        writeBlob: vi.fn().mockResolvedValue('def456'),
      });
      const builder = new PatchBuilder((({
        persistence,
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => createMockState(),
      }) as any));

      await expect(
        builder.attachEdgeContent('no', 'such', 'edge', 'content')
      ).rejects.toThrow();
      expect(persistence.writeBlob).not.toHaveBeenCalled();
      expect((builder as any)._contentBlobs).toEqual([]);
    });
  });

  describe('clearEdgeContent()', () => {
    it('sets reserved edge content registers to null without writing a blob', () => {
      const state = createMockState();
      const edgeKey = encodeEdgeKey('a', 'b', 'rel');
      state.edgeAlive.add(edgeKey, Dot.create('w1', 1));
      const persistence = createMockPersistence();
      const builder = new PatchBuilder((({
        persistence,
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
      }) as any));

      const result = builder.clearEdgeContent('a', 'b', 'rel');

      expect(result).toBe(builder);
      expect(persistence.writeBlob).not.toHaveBeenCalled();
      expect((builder as any)._contentBlobs).toEqual([]);
      const patch = builder.build();
      expect(patch.ops).toHaveLength(3);
      expect(patch.ops).toContainEqual(expect.objectContaining({
        type: 'PropSet',
        key: '_content',
        value: null,
      }));
      expect(patch.ops).toContainEqual(expect.objectContaining({
        type: 'PropSet',
        key: '_content.size',
        value: null,
      }));
      expect(patch.ops).toContainEqual(expect.objectContaining({
        type: 'PropSet',
        key: '_content.mime',
        value: null,
      }));
      expect(patch.schema).toBe(3);
    });

    it('rejects unknown edges without writing a blob', () => {
      const persistence = createMockPersistence();
      const builder = new PatchBuilder((({
        persistence,
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => createMockState(),
      }) as any));

      expect(() => builder.clearEdgeContent('no', 'such', 'edge')).toThrow();
      expect(persistence.writeBlob).not.toHaveBeenCalled();
      expect((builder as any)._contentBlobs).toEqual([]);
    });
  });

  describe('multiple attachments in one patch', () => {
    it('tracks multiple blob OIDs', async () => {
      const state = createMockState();
      state.nodeAlive.add('node:1', Dot.create('w1', 1));
      state.nodeAlive.add('node:2', Dot.create('w1', 2));
      let callCount = 0;
      const blobStorage = createMockBlobStorage();
      blobStorage.store = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(`blob${callCount}`);
      });
      const persistence = createMockPersistence();
      const builder = new PatchBuilder((({
        persistence,
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
        blobStorage,
      }) as any));

      await builder.attachContent('node:1', 'first');
      await builder.attachContent('node:2', 'second');

      expect((builder as any)._contentBlobs).toEqual(['blob1', 'blob2']);
      expect(blobStorage.store).toHaveBeenCalledTimes(2);
    });
  });

  describe('attachContent() with streaming input', () => {
    it('accepts an AsyncIterable<Uint8Array> as content', async () => {
      const state = createMockState();
      state.nodeAlive.add('node:1', Dot.create('w1', 1));
      const blobStorage = {
        store: vi.fn().mockResolvedValue('cas-oid-1'),
        retrieve: vi.fn(),
        storeStream: vi.fn().mockResolvedValue('cas-stream-oid'),
        retrieveStream: vi.fn(),
      };
      const builder = new PatchBuilder((({
        persistence: createMockPersistence(),
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
        blobStorage,
      }) as any));

      async function* source() {
        yield new TextEncoder().encode('hello ');
        yield new TextEncoder().encode('world');
      }

      await builder.attachContent('node:1', source(), { size: 11 });

      // Should call storeStream, not store
      expect(blobStorage.storeStream).toHaveBeenCalledOnce();
      expect(blobStorage.store).not.toHaveBeenCalled();
      const patch = builder.build();
      expect(patch.ops).toContainEqual(expect.objectContaining({
        type: 'PropSet',
        node: 'node:1',
        key: '_content',
        value: 'cas-stream-oid',
      }));
    });

    it('accepts a ReadableStream<Uint8Array> as content', async () => {
      const state = createMockState();
      state.nodeAlive.add('node:1', Dot.create('w1', 1));
      const blobStorage = {
        store: vi.fn().mockResolvedValue('cas-oid-1'),
        retrieve: vi.fn(),
        storeStream: vi.fn().mockResolvedValue('cas-rs-oid'),
        retrieveStream: vi.fn(),
      };
      const builder = new PatchBuilder((({
        persistence: createMockPersistence(),
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
        blobStorage,
      }) as any));

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('rs content'));
          controller.close();
        },
      });

      await builder.attachContent('node:1', stream, { size: 10 });

      expect(blobStorage.storeStream).toHaveBeenCalledOnce();
    });
  });

  describe('attachEdgeContent() with streaming input', () => {
    it('accepts an AsyncIterable<Uint8Array> as content', async () => {
      const state = createMockState();
      state.edgeAlive.add(encodeEdgeKey('a', 'b', 'rel'), Dot.create('w1', 1));
      const blobStorage = {
        store: vi.fn().mockResolvedValue('cas-oid-1'),
        retrieve: vi.fn(),
        storeStream: vi.fn().mockResolvedValue('cas-edge-stream-oid'),
        retrieveStream: vi.fn(),
      };
      const builder = new PatchBuilder((({
        persistence: createMockPersistence(),
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
        blobStorage,
      }) as any));

      async function* source() {
        yield new TextEncoder().encode('edge ');
        yield new TextEncoder().encode('data');
      }

      await builder.attachEdgeContent('a', 'b', 'rel', source(), { size: 9 });

      expect(blobStorage.storeStream).toHaveBeenCalledOnce();
      expect(blobStorage.store).not.toHaveBeenCalled();
    });
  });

  describe('attachContent() with blobStorage', () => {
    it('uses blobStorage.store() when blobStorage is provided', async () => {
      const state = createMockState();
      state.nodeAlive.add('node:1', Dot.create('w1', 1));
      const blobStorage = {
        store: vi.fn().mockResolvedValue('cas-tree-oid'),
        retrieve: vi.fn(),
      };
      const persistence = createMockPersistence();
      const builder = new PatchBuilder((({
        persistence,
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
        blobStorage,
      }) as any));

      await builder.attachContent('node:1', 'hello world');

      expect(blobStorage.store).toHaveBeenCalledWith('hello world', {
        slug: 'g/node:1',
        mime: null,
        size: 11,
      });
      expect(persistence.writeBlob).not.toHaveBeenCalled();
      const patch = builder.build();
      expect(patch.ops).toContainEqual(expect.objectContaining({
        type: 'PropSet',
        node: 'node:1',
        key: '_content',
        value: 'cas-tree-oid',
      }));
    });

    it('throws NO_BLOB_STORAGE when blobStorage is not provided', async () => {
      const state = createMockState();
      state.nodeAlive.add('node:1', Dot.create('w1', 1));
      const persistence = createMockPersistence();
      const builder = new PatchBuilder((({
        persistence,
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
      }) as any));

      await expect(builder.attachContent('node:1', 'hello'))
        .rejects.toThrow('Cannot attach content without blob storage');
      expect(persistence.writeBlob).not.toHaveBeenCalled();
    });
  });

  describe('no raw writeBlob fallback (OG-014)', () => {
    it('throws when blobStorage is absent and content is attached', async () => {
      // OG-014 mandates that CAS is mandatory. Once implemented,
      // attachContent without blobStorage should throw, not silently
      // fall back to persistence.writeBlob().
      const state = createMockState();
      state.nodeAlive.add('node:1', Dot.create('w1', 1));
      const persistence = createMockPersistence();
      const builder = new PatchBuilder((({
        persistence,
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
        // blobStorage intentionally omitted
      }) as any));

      // Should throw because there is no blob storage to handle content
      await expect(builder.attachContent('node:1', 'hello'))
        .rejects.toThrow();
      expect(persistence.writeBlob).not.toHaveBeenCalled();
    });
  });

  describe('attachEdgeContent() with blobStorage', () => {
    it('uses blobStorage.store() when blobStorage is provided', async () => {
      const state = createMockState();
      state.edgeAlive.add(encodeEdgeKey('a', 'b', 'rel'), Dot.create('w1', 1));

      const blobStorage = {
        store: vi.fn().mockResolvedValue('cas-edge-tree-oid'),
        retrieve: vi.fn(),
      };
      const persistence = createMockPersistence();
      const builder = new PatchBuilder((({
        persistence,
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
        blobStorage,
      }) as any));

      await builder.attachEdgeContent('a', 'b', 'rel', 'edge-data');

      expect(blobStorage.store).toHaveBeenCalledWith('edge-data', {
        slug: 'g/a/b/rel',
        mime: null,
        size: 9,
      });
      expect(persistence.writeBlob).not.toHaveBeenCalled();
    });
  });

  describe('commit() with content blobs', () => {
    it('includes _content_<oid> entries in tree when content blobs exist', async () => {
      const contentOid = 'a'.repeat(40);
      const patchBlobOid = 'b'.repeat(40);
      const blobStorage = createMockBlobStorage({ storeOid: contentOid });
      const persistence = createMockPersistence({
        writeBlob: vi.fn().mockResolvedValue(patchBlobOid), // commit() CBOR blob only
        writeTree: vi.fn().mockResolvedValue('c'.repeat(40)),
      });
      const builder = new PatchBuilder((({
        persistence,
        patchJournal: createPatchJournal(persistence),
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
        expectedParentSha: null,
        blobStorage,
      }) as any));

      builder.addNode('n1');
      await builder.attachContent('n1', 'hello');
      await builder.commit();

      // writeTree should be called with both patch.cbor and _content_<oid>
      const treeEntries = persistence.writeTree.mock.calls[0]![0];
      expect(treeEntries).toHaveLength(2);
      expect(treeEntries[0]).toBe(`100644 blob ${patchBlobOid}\tpatch.cbor`);
      expect(treeEntries[1]).toBe(`040000 tree ${contentOid}\t_content_${contentOid}`);
    });

    it('creates single-entry tree when no content blobs', async () => {
      const persistence = createMockPersistence();
      const builder = new PatchBuilder((({
        persistence,
        patchJournal: createPatchJournal(persistence),
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
        expectedParentSha: null,
      }) as any));

      builder.addNode('n1');
      await builder.commit();

      const treeEntries = persistence.writeTree.mock.calls[0]![0];
      expect(treeEntries).toHaveLength(1);
      expect(treeEntries[0]).toContain('patch.cbor');
    });

    it('includes multiple _content_<oid> entries for multiple attachments', async () => {
      const contentA = '1'.repeat(40);
      const contentB = '2'.repeat(40);
      const patchBlob = '3'.repeat(40);
      let storeIdx = 0;
      const storeOids = [contentA, contentB];
      const blobStorage = createMockBlobStorage();
      blobStorage.store = vi.fn().mockImplementation(() =>
        Promise.resolve(storeOids[storeIdx++]));
      const persistence = createMockPersistence({
        writeBlob: vi.fn().mockResolvedValue(patchBlob), // CBOR blob only
        writeTree: vi.fn().mockResolvedValue('4'.repeat(40)),
      });
      const builder = new PatchBuilder((({
        persistence,
        patchJournal: createPatchJournal(persistence),
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
        expectedParentSha: null,
        blobStorage,
      }) as any));

      builder.addNode('n1').addNode('n2');
      await builder.attachContent('n1', 'first');
      await builder.attachContent('n2', 'second');
      await builder.commit();

      const treeEntries = persistence.writeTree.mock.calls[0]![0];
      expect(treeEntries).toHaveLength(3);
      expect(treeEntries[0]).toContain('patch.cbor');
      expect(treeEntries[1]).toBe(`040000 tree ${contentA}\t_content_${contentA}`);
      expect(treeEntries[2]).toBe(`040000 tree ${contentB}\t_content_${contentB}`);
    });

    it('deduplicates tree entries when same content is attached to multiple nodes', async () => {
      const sharedOid = 'a'.repeat(40);
      const patchBlob = 'b'.repeat(40);
      const blobStorage = createMockBlobStorage({ storeOid: sharedOid });
      const persistence = createMockPersistence({
        writeBlob: vi.fn().mockResolvedValue(patchBlob), // CBOR blob only
        writeTree: vi.fn().mockResolvedValue('c'.repeat(40)),
      });
      const builder = new PatchBuilder((({
        persistence,
        patchJournal: createPatchJournal(persistence),
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
        expectedParentSha: null,
        blobStorage,
      }) as any));

      builder.addNode('n1').addNode('n2');
      await builder.attachContent('n1', 'same-data');
      await builder.attachContent('n2', 'same-data');
      await builder.commit();

      const treeEntries = persistence.writeTree.mock.calls[0]![0];
      expect(treeEntries).toHaveLength(2);
      expect(treeEntries[0]).toContain('patch.cbor');
      expect(treeEntries[1]).toBe(`040000 tree ${sharedOid}\t_content_${sharedOid}`);
    });
  });
});
