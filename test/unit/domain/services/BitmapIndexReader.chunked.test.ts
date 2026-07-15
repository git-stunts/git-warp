import { describe, expect, it } from 'vitest';
import BitmapIndexReader from '../../../../src/domain/services/index/BitmapIndexReader.ts';
import MockIndexStorage from '../../../helpers/MockIndexStorage.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { getRoaringBitmap32 } from '../../../../src/domain/utils/roaring.ts';

function encodeBitmap(ids: number[]): Uint8Array {
  const RoaringBitmap32 = getRoaringBitmap32();
  const bitmap = new RoaringBitmap32();
  for (const id of ids) {
    bitmap.add(id);
  }
  return new Uint8Array(bitmap.serialize(true));
}

describe('BitmapIndexReader chunked shard support', () => {
  it('looks up IDs and unions edge bitmaps across chunked shard paths', async () => {
    const storage = new MockIndexStorage();
    const metaAaChunk0 = await storage.writeBlob(defaultCodec.encode({ aa0001: 0 }));
    const metaBbChunk0 = await storage.writeBlob(defaultCodec.encode({ bb0001: 1 }));
    const metaBbChunk1 = await storage.writeBlob(defaultCodec.encode({ bb0002: 2 }));
    const edgeChunk0 = await storage.writeBlob(defaultCodec.encode({ aa0001: encodeBitmap([1]) }));
    const edgeChunk1 = await storage.writeBlob(defaultCodec.encode({ aa0001: encodeBitmap([2]) }));
    const revChunk0 = await storage.writeBlob(defaultCodec.encode({ bb0001: encodeBitmap([0]) }));
    const revChunk1 = await storage.writeBlob(defaultCodec.encode({ bb0002: encodeBitmap([0]) }));

    const reader = new BitmapIndexReader({ indexStore: storage, codec: defaultCodec });
    reader.setup({
      'meta_aa.chunk-000000.cbor': metaAaChunk0,
      'meta_bb.chunk-000000.cbor': metaBbChunk0,
      'meta_bb.chunk-000001.cbor': metaBbChunk1,
      'shards_fwd_aa.chunk-000000.cbor': edgeChunk0,
      'shards_fwd_aa.chunk-000001.cbor': edgeChunk1,
      'shards_rev_bb.chunk-000000.cbor': revChunk0,
      'shards_rev_bb.chunk-000001.cbor': revChunk1,
    });

    await expect(reader.lookupId('bb0002')).resolves.toBe(2);
    await expect(reader.getChildren('aa0001')).resolves.toEqual(['bb0001', 'bb0002']);
    await expect(reader.getParents('bb0002')).resolves.toEqual(['aa0001']);
  });
});
