import { describe, expect, it } from 'vitest';
import IndexStorePort from '../../../src/ports/IndexStorePort.ts';
import type WarpStream from '../../../src/domain/stream/WarpStream.ts';
import type { IndexShard } from '../../../src/domain/artifacts/IndexShard.ts';

describe('IndexStorePort', () => {
  it('abstract methods are not callable on base prototype', () => {
    expect(IndexStorePort.prototype.writeShards).toBeUndefined();
    expect(IndexStorePort.prototype.scanShards).toBeUndefined();
    expect(IndexStorePort.prototype.readShardOids).toBeUndefined();
    expect(IndexStorePort.prototype.decodeShard).toBeUndefined();
  });

  it('concrete subclass satisfies the contract', async () => {
    class TestStore extends IndexStorePort {
      async writeShards(_shardStream: WarpStream<IndexShard>) { return 'tree-oid'; }
      scanShards(_treeOid: string) { return null as unknown as WarpStream<IndexShard>; }
      async readShardOids(_treeOid: string) { return { 'shard.cbor': 'blob-oid' }; }
      async decodeShard(_blobOid: string) { return {}; }
    }
    const store = new TestStore();
    expect(store).toBeInstanceOf(IndexStorePort);
    expect(await store.writeShards(null as unknown as WarpStream<IndexShard>)).toBe('tree-oid');
  });
});
