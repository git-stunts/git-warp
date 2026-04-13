import { describe, expect, it } from 'vitest';
import IndexStorePort from '../../../src/ports/IndexStorePort.ts';

describe('IndexStorePort', () => {
  it('abstract methods are not callable on base prototype', () => {
    expect(IndexStorePort.prototype.writeShards).toBeUndefined();
    expect(IndexStorePort.prototype.scanShards).toBeUndefined();
    expect(IndexStorePort.prototype.readShardOids).toBeUndefined();
    expect(IndexStorePort.prototype.decodeShard).toBeUndefined();
  });

  it('concrete subclass satisfies the contract', async () => {
    class TestStore extends IndexStorePort {
      async writeShards() { return 'tree-oid'; }
      scanShards() { return /** @type {any} */ (null); }
      async readShardOids() { return { 'shard.cbor': 'blob-oid' }; }
      async decodeShard() { return {}; }
    }
    const store = new TestStore();
    expect(store).toBeInstanceOf(IndexStorePort);
    expect(await (/** @type {any} */ (store)).writeShards(null)).toBe('tree-oid');
  });
});
