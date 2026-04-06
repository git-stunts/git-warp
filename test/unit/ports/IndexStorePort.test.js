import { describe, expect, it } from 'vitest';
import IndexStorePort from '../../../src/ports/IndexStorePort.js';

describe('IndexStorePort', () => {
  it('throws on direct call to writeShards()', async () => {
    const port = new IndexStorePort();
    await expect(port.writeShards(/** @type {any} */ ({}))).rejects.toThrow('not implemented');
  });

  it('throws on direct call to scanShards()', () => {
    const port = new IndexStorePort();
    expect(() => port.scanShards('tree-oid')).toThrow('not implemented');
  });

  it('throws on direct call to readShardOids()', async () => {
    const port = new IndexStorePort();
    await expect(port.readShardOids('tree-oid')).rejects.toThrow('not implemented');
  });

  it('throws on direct call to decodeShard()', async () => {
    const port = new IndexStorePort();
    await expect(port.decodeShard('blob-oid')).rejects.toThrow('not implemented');
  });
});
