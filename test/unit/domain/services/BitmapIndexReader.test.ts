import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShardCorruptionError, ShardLoadError } from '../../../../src/domain/errors/index.ts';
import BitmapIndexReader from '../../../../src/domain/services/index/BitmapIndexReader.ts';
import AssetHandle from '../../../../src/domain/storage/AssetHandle.ts';
import { getRoaringBitmap32 } from '../../../../src/domain/utils/roaring.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import MockIndexStorage from '../../../helpers/MockIndexStorage.ts';

function bitmap(ids: number[]): Uint8Array {
  const RoaringBitmap32 = getRoaringBitmap32();
  const value = new RoaringBitmap32();
  ids.forEach((id) => value.add(id));
  return new Uint8Array(value.serialize(true));
}

function logger() {
  const value = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  value.child.mockReturnValue(value);
  return value;
}

describe('BitmapIndexReader bounded shard reads', () => {
  let storage: MockIndexStorage;
  let reader: BitmapIndexReader;

  beforeEach(() => {
    storage = new MockIndexStorage();
    reader = new BitmapIndexReader({ indexStore: storage, codec: defaultCodec });
  });

  it('requires a semantic index store and exposes bounded cache configuration', () => {
    // @ts-expect-error Runtime guard for JavaScript callers.
    expect(() => new BitmapIndexReader({ codec: defaultCodec })).toThrow(/storage adapter/);
    expect(reader.maxCachedShards).toBe(100);
    expect(new BitmapIndexReader({
      indexStore: storage,
      codec: defaultCodec,
      maxCachedShards: 4,
    }).maxCachedShards).toBe(4);
  });

  it('resolves IDs and edges by opening only configured shard handles', async () => {
    const metaAa = await storage.writeBlob(defaultCodec.encode({ aa0001: 0 }));
    const metaBb = await storage.writeBlob(defaultCodec.encode({ bb0001: 1 }));
    const forward = await storage.writeBlob(defaultCodec.encode({ aa0001: bitmap([1]) }));
    const reverse = await storage.writeBlob(defaultCodec.encode({ bb0001: bitmap([0]) }));
    reader.setup({
      'meta_aa.cbor': metaAa,
      'meta_bb.cbor': metaBb,
      'shards_fwd_aa.cbor': forward,
      'shards_rev_bb.cbor': reverse,
    });

    await expect(reader.lookupId('aa0001')).resolves.toBe(0);
    await expect(reader.getChildren('aa0001')).resolves.toEqual(['bb0001']);
    await expect(reader.getParents('bb0001')).resolves.toEqual(['aa0001']);
  });

  it('clears loaded state when configured with a new handle set', async () => {
    const first = await storage.writeBlob(defaultCodec.encode({ aa0001: 0 }));
    reader.setup({ 'meta_aa.cbor': first });
    await expect(reader.lookupId('aa0001')).resolves.toBe(0);

    const second = await storage.writeBlob(defaultCodec.encode({ aa0002: 2 }));
    reader.setup({ 'meta_aa.cbor': second });
    await expect(reader.lookupId('aa0001')).resolves.toBeUndefined();
    await expect(reader.lookupId('aa0002')).resolves.toBe(2);
  });

  it('rejects non-handle shard locators in strict mode', () => {
    expect(() => reader.setup({
      // @ts-expect-error Runtime validation for untyped callers.
      'meta_aa.cbor': 'raw-object-id',
    })).toThrow(ShardCorruptionError);
  });

  it('skips non-handle locators with evidence in lenient mode', () => {
    const log = logger();
    const lenient = new BitmapIndexReader({
      indexStore: storage,
      codec: defaultCodec,
      strict: false,
      logger: log,
    });
    lenient.setup({
      // @ts-expect-error Runtime validation for untyped callers.
      'meta_aa.cbor': 'raw-object-id',
    });

    expect(log.warn).toHaveBeenCalledWith(
      'Skipping shard with invalid handle',
      expect.objectContaining({ shardPath: 'meta_aa.cbor', reason: 'invalid_handle' }),
    );
  });

  it('reports missing assets as shard load failures', async () => {
    reader.setup({ 'meta_aa.cbor': new AssetHandle('missing') });

    await expect(reader.lookupId('aa0001')).rejects.toBeInstanceOf(ShardLoadError);
  });

  it('fails closed on corrupt shard bytes and can degrade explicitly', async () => {
    const corrupt = await storage.writeBlob(new Uint8Array([0xff, 0xfe, 0xfd]));
    reader.setup({ 'meta_aa.cbor': corrupt });
    await expect(reader.lookupId('aa0001')).rejects.toBeInstanceOf(ShardCorruptionError);

    const log = logger();
    const lenient = new BitmapIndexReader({
      indexStore: storage,
      codec: defaultCodec,
      strict: false,
      logger: log,
    });
    lenient.setup({ 'meta_aa.cbor': corrupt });
    await expect(lenient.lookupId('aa0001')).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(
      'Shard decode failed',
      expect.objectContaining({ shardPath: 'meta_aa.cbor' }),
    );
  });
});
