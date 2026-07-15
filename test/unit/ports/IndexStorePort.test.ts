import { describe, expect, it } from 'vitest';
import type { IndexShard } from '../../../src/domain/artifacts/IndexShard.ts';
import AssetHandle from '../../../src/domain/storage/AssetHandle.ts';
import WarpStream from '../../../src/domain/stream/WarpStream.ts';
import type CodecValue from '../../../src/domain/types/codec/CodecValue.ts';
import IndexStorePort from '../../../src/ports/IndexStorePort.ts';

describe('IndexStorePort', () => {
  it('declares opaque-handle streaming methods', () => {
    expect(IndexStorePort.prototype.writeShards).toBeUndefined();
    expect(IndexStorePort.prototype.scanShards).toBeUndefined();
    expect(IndexStorePort.prototype.readShardHandles).toBeUndefined();
    expect(IndexStorePort.prototype.openShard).toBeUndefined();
    expect(IndexStorePort.prototype.decodeShard).toBeUndefined();
  });

  it('can be implemented without object IDs', async () => {
    class TestStore extends IndexStorePort {
      readonly handle = new AssetHandle('index:test');
      async writeShards(_shards: WarpStream<IndexShard>) { return this.handle; }
      scanShards(_handle: AssetHandle) { return WarpStream.of<IndexShard>(); }
      async readShardHandles(_handle: AssetHandle) { return { 'shard.cbor': this.handle }; }
      async *openShard(_handle: AssetHandle) { yield new Uint8Array([1]); }
      async decodeShard<TDecoded extends CodecValue = CodecValue>(
        _handle: AssetHandle,
      ): Promise<TDecoded> {
        return Object.freeze({}) as TDecoded;
      }
    }

    const store = new TestStore();
    await expect(store.writeShards(WarpStream.of<IndexShard>())).resolves.toBe(store.handle);
    await expect(store.readShardHandles(store.handle)).resolves.toEqual({
      'shard.cbor': store.handle,
    });
  });
});
