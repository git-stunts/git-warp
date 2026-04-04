import { describe, it, expect, vi } from 'vitest';
import WarpStream from '../../../../src/domain/stream/WarpStream.js';
import { CborEncodeTransform } from '../../../../src/infrastructure/adapters/CborEncodeTransform.js';
import { CborDecodeTransform } from '../../../../src/infrastructure/adapters/CborDecodeTransform.js';
import { GitBlobWriteTransform } from '../../../../src/infrastructure/adapters/GitBlobWriteTransform.js';
import { TreeAssemblerSink } from '../../../../src/infrastructure/adapters/TreeAssemblerSink.js';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.js';

/**
 * Creates an in-memory BlobPort + TreePort stub.
 */
function createMemoryGit() {
  /** @type {Map<string, Uint8Array>} */
  const blobs = new Map();
  let blobCounter = 0;
  /** @type {string[][]} */
  let lastTree = [];

  return {
    blobs,
    writeBlob: vi.fn(async (/** @type {Uint8Array} */ content) => {
      const oid = `blob_${String(blobCounter++).padStart(40, '0')}`;
      blobs.set(oid, content);
      return oid;
    }),
    readBlob: vi.fn(async (/** @type {string} */ oid) => {
      const data = blobs.get(oid);
      if (!data) { throw new Error(`Blob not found: ${oid}`); }
      return data;
    }),
    writeTree: vi.fn(async (/** @type {string[]} */ entries) => {
      lastTree = entries;
      return 'tree_' + '0'.repeat(36);
    }),
    get lastTreeEntries() { return lastTree; },
  };
}

describe('Stream Pipeline Integration', () => {
  it('domain objects → encode → blob write → tree assembly', async () => {
    const codec = new CborCodec();
    const git = createMemoryGit();

    // Domain objects: index shards
    const shards = [
      ['meta_ab.cbor', { nodeToGlobal: [['user:alice', 0]], nextLocalId: 1 }],
      ['labels.cbor', [['knows', 0], ['likes', 1]]],
      ['receipt.cbor', { version: 1, nodeCount: 1, labelCount: 2 }],
    ];

    const treeOid = await WarpStream.from(shards)
      .pipe(new CborEncodeTransform(codec))
      .pipe(new GitBlobWriteTransform(git))
      .drain(new TreeAssemblerSink(git));

    // Tree was assembled
    expect(treeOid).toBe('tree_' + '0'.repeat(36));
    expect(git.writeTree).toHaveBeenCalledOnce();

    // 3 blobs were written
    expect(git.writeBlob).toHaveBeenCalledTimes(3);
    expect(git.blobs.size).toBe(3);

    // Tree entries are sorted and contain expected paths
    const entries = git.lastTreeEntries;
    expect(entries).toHaveLength(3);
    const paths = entries.map((/** @type {string} */ e) => e.split('\t')[1]);
    expect(paths).toContain('labels.cbor');
    expect(paths).toContain('meta_ab.cbor');
    expect(paths).toContain('receipt.cbor');

    // Round-trip: decode a shard and verify contents
    const metaEntry = entries.find((/** @type {string} */ e) => e.includes('meta_ab.cbor'));
    const metaOid = metaEntry.split('\t')[0].split(' ').pop();
    const metaBytes = git.blobs.get(metaOid);
    expect(metaBytes).toBeDefined();
    const decoded = codec.decode(metaBytes);
    expect(decoded).toEqual({ nodeToGlobal: [['user:alice', 0]], nextLocalId: 1 });
  });

  it('blob read → decode: reverse pipeline', async () => {
    const codec = new CborCodec();
    const git = createMemoryGit();

    // Pre-populate blobs
    const data1 = { name: 'Alice' };
    const data2 = { name: 'Bob' };
    git.blobs.set('oid1', codec.encode(data1));
    git.blobs.set('oid2', codec.encode(data2));

    // Read + decode pipeline
    const entries = [['user1.cbor', 'oid1'], ['user2.cbor', 'oid2']];

    /** @type {Array<[string, unknown]>} */
    const results = [];
    const readTransform = {
      async *apply(/** @type {AsyncIterable<[string, string]>} */ source) {
        for await (const [path, oid] of source) {
          const bytes = await git.readBlob(oid);
          yield /** @type {[string, Uint8Array]} */ ([path, bytes]);
        }
      },
    };

    await WarpStream.from(entries)
      .pipe(readTransform)
      .pipe(new CborDecodeTransform(codec))
      .forEach(([path, obj]) => { results.push([path, obj]); });

    expect(results).toEqual([
      ['user1.cbor', { name: 'Alice' }],
      ['user2.cbor', { name: 'Bob' }],
    ]);
  });
});
