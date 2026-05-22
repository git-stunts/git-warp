import { describe, it, expect, vi } from 'vitest';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { encodeEdgeKey } from '../../../../src/domain/services/KeyCodec.ts';
import {
  createPatchBuilder,
  createPatchBuilderMockBlobStorage as createMockBlobStorage,
  createPatchBuilderMockPersistence as createMockPersistence,
  createPatchBuilderMockState as createMockState,
  createPatchJournal,
} from './PatchBuilderTestHarness.ts';

describe('PatchBuilder content persistence', () => {
  describe('attachContent() with blobStorage', () => {
    it('uses blobStorage.store() when blobStorage is provided', async () => {
      const state = createMockState();
      state.nodeAlive.add('node:1', Dot.create('w1', 1));
      const blobStorage = createMockBlobStorage({ storeOid: 'cas-tree-oid' });
      const persistence = createMockPersistence();
      const builder = createPatchBuilder({
        persistence,
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
        blobStorage,
      });

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
      const builder = createPatchBuilder({
        persistence,
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
      });

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
      const builder = createPatchBuilder({
        persistence,
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
        // blobStorage intentionally omitted
      });

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

      const blobStorage = createMockBlobStorage({ storeOid: 'cas-edge-tree-oid' });
      const persistence = createMockPersistence();
      const builder = createPatchBuilder({
        persistence,
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => state,
        blobStorage,
      });

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
        writeBlob: vi.fn(async (_content: Uint8Array | string): Promise<string> => patchBlobOid), // commit() CBOR blob only
        writeTree: vi.fn(async (_entries: string[]): Promise<string> => 'c'.repeat(40)),
      });
      const builder = createPatchBuilder({
        persistence,
        patchJournal: createPatchJournal(persistence),
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
        expectedParentSha: null,
        blobStorage,
      });

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
      const builder = createPatchBuilder({
        persistence,
        patchJournal: createPatchJournal(persistence),
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
        expectedParentSha: null,
      });

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
        writeBlob: vi.fn(async (_content: Uint8Array | string): Promise<string> => patchBlob), // CBOR blob only
        writeTree: vi.fn(async (_entries: string[]): Promise<string> => '4'.repeat(40)),
      });
      const builder = createPatchBuilder({
        persistence,
        patchJournal: createPatchJournal(persistence),
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
        expectedParentSha: null,
        blobStorage,
      });

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
        writeBlob: vi.fn(async (_content: Uint8Array | string): Promise<string> => patchBlob), // commit() CBOR blob only
        writeTree: vi.fn(async (_entries: string[]): Promise<string> => 'c'.repeat(40)),
      });
      const builder = createPatchBuilder({
        persistence,
        patchJournal: createPatchJournal(persistence),
        graphName: 'g',
        writerId: 'w1',
        lamport: 1,
        versionVector: VersionVector.empty(),
        getCurrentState: () => null,
        expectedParentSha: null,
        blobStorage,
      });

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
