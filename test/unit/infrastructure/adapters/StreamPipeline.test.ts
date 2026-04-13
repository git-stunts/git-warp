import { describe, it, expect, vi } from 'vitest';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import Transform from '../../../../src/domain/stream/Transform.ts';
import { CborEncodeTransform } from '../../../../src/infrastructure/adapters/CborEncodeTransform.ts';
import { CborDecodeTransform } from '../../../../src/infrastructure/adapters/CborDecodeTransform.ts';
import { GitBlobWriteTransform } from '../../../../src/infrastructure/adapters/GitBlobWriteTransform.ts';
import { TreeAssemblerSink } from '../../../../src/infrastructure/adapters/TreeAssemblerSink.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';

/**
 * Creates an in-memory BlobPort + TreePort stub.
 */
function createMemoryGit() {
    const blobs = (new Map()) as Map<string, Uint8Array>;
  let blobCounter = 0;
    let lastTree = ([]) as string[];

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
      .pipe((new CborEncodeTransform(codec) as any))
      .pipe((new GitBlobWriteTransform((git)) as any))
      .drain((new TreeAssemblerSink((git)) as any));

    // Tree was assembled
    expect(treeOid).toBe('tree_' + '0'.repeat(36));
    expect(git.writeTree).toHaveBeenCalledOnce();

    // 3 blobs were written
    expect(git.writeBlob).toHaveBeenCalledTimes(3);
    expect(git.blobs.size).toBe(3);

    // Tree entries are sorted and contain expected paths
    const entries = git.lastTreeEntries;
    expect(entries).toHaveLength(3);
    const paths = entries.map((e) => e.split('\t')[1]);
    expect(paths).toContain('labels.cbor');
    expect(paths).toContain('meta_ab.cbor');
    expect(paths).toContain('receipt.cbor');

    // Round-trip: decode a shard and verify contents
    const metaEntry = ((entries.find((e) => e.includes('meta_ab.cbor')) as any) as string);
    const metaParts = ((metaEntry.split('\t')[0] as any) as string).split(' ');
    const metaOid = ((metaParts[metaParts.length - 1] as any) as string);
    const metaBytes = ((git.blobs.get(metaOid) as any) as Uint8Array);
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

        const results = ([]) as Array<[string, unknown]>;
    const readTransform = new Transform();
    readTransform.apply = async function *(source: AsyncIterable<[string, string]>) {
      for await (const [path, oid] of source) {
        const bytes = await git.readBlob(oid);
        yield ([path, bytes] as [string, Uint8Array]);
      }
    };

    await WarpStream.from(entries)
      .pipe((readTransform))
      .pipe((new CborDecodeTransform(codec) as any))
      .forEach((item) => { const [path, obj] = item as [string, unknown]; results.push([path, obj]); });

    expect(results).toEqual([
      ['user1.cbor', { name: 'Alice' }],
      ['user2.cbor', { name: 'Bob' }],
    ]);
  });
});
