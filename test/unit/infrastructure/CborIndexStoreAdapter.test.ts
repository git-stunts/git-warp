import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EdgeShard } from '../../../src/domain/artifacts/EdgeShard.ts';
import { LabelShard } from '../../../src/domain/artifacts/LabelShard.ts';
import { MetaShard } from '../../../src/domain/artifacts/MetaShard.ts';
import { PropertyShard } from '../../../src/domain/artifacts/PropertyShard.ts';
import { ReceiptShard } from '../../../src/domain/artifacts/ReceiptShard.ts';
import AssetHandle from '../../../src/domain/storage/AssetHandle.ts';
import WarpStream from '../../../src/domain/stream/WarpStream.ts';
import { collectAsyncIterable } from '../../../src/domain/utils/streamUtils.ts';
import { CborIndexStoreAdapter } from '../../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import IndexStorePort from '../../../src/ports/IndexStorePort.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';

function shards() {
  return [
    new MetaShard({
      shardKey: 'a0',
      nodeToGlobal: [['node:1', 0], ['node:2', 1]],
      nextLocalId: 2,
      alive: new Uint8Array([0xff]),
    }),
    new EdgeShard({
      shardKey: 'a0',
      direction: 'fwd',
      buckets: { all: { '0': new Uint8Array([0x01]) } },
    }),
    new EdgeShard({
      shardKey: 'a0',
      direction: 'rev',
      buckets: { all: { '1': new Uint8Array([0x02]) } },
    }),
    new LabelShard({ labels: [['manages', 0], ['owns', 1]] }),
    new PropertyShard({ shardKey: 'a0', entries: [['node:1', { name: 'Alice' }]] }),
    new ReceiptShard({ version: 1, nodeCount: 2, labelCount: 2, shardCount: 5 }),
  ];
}

describe('CborIndexStoreAdapter opaque shard boundary', () => {
  let history: InMemoryGraphAdapter;
  let indexes: CborIndexStoreAdapter;

  beforeEach(() => {
    history = new InMemoryGraphAdapter();
    indexes = new CborIndexStoreAdapter({
      codec: defaultCodec,
      blobPort: history,
      treePort: history,
    });
  });

  it('is an IndexStorePort and validates infrastructure dependencies', () => {
    expect(indexes).toBeInstanceOf(IndexStorePort);
    expect(() => new CborIndexStoreAdapter({
      // @ts-expect-error Runtime dependency guard for JavaScript callers.
      codec: null,
      blobPort: history,
      treePort: history,
    })).toThrow(/codec/);
    expect(() => new CborIndexStoreAdapter({
      codec: defaultCodec,
      // @ts-expect-error Runtime dependency guard for JavaScript callers.
      blobPort: null,
      treePort: history,
    })).toThrow(/blobPort/);
  });

  it('writes and scans every supported shard class through one index handle', async () => {
    const indexHandle = await indexes.writeShards(WarpStream.from(shards()));
    const recovered = await indexes.scanShards(indexHandle).collect();

    expect(indexHandle).toBeInstanceOf(AssetHandle);
    expect(recovered).toHaveLength(6);
    expect(recovered.some((shard) => shard instanceof MetaShard)).toBe(true);
    expect(recovered.some((shard) => shard instanceof EdgeShard && shard.direction === 'fwd')).toBe(true);
    expect(recovered.some((shard) => shard instanceof EdgeShard && shard.direction === 'rev')).toBe(true);
    expect(recovered.some((shard) => shard instanceof LabelShard)).toBe(true);
    expect(recovered.some((shard) => shard instanceof PropertyShard)).toBe(true);
    expect(recovered.some((shard) => shard instanceof ReceiptShard)).toBe(true);
  });

  it('lists shard handles without opening shard payloads', async () => {
    const indexHandle = await indexes.writeShards(WarpStream.from(shards()));
    const readBlob = vi.spyOn(history, 'readBlob');
    const handles = await indexes.readShardHandles(indexHandle);

    expect(Object.keys(handles).sort()).toEqual([
      'fwd_a0.cbor',
      'labels.cbor',
      'meta_a0.cbor',
      'props_a0.cbor',
      'receipt.cbor',
      'rev_a0.cbor',
    ]);
    expect(Object.values(handles).every((handle) => handle instanceof AssetHandle)).toBe(true);
    expect(readBlob).not.toHaveBeenCalled();
  });

  it('opens and decodes exactly one selected shard handle', async () => {
    const indexHandle = await indexes.writeShards(WarpStream.from(shards()));
    const handles = await indexes.readShardHandles(indexHandle);
    const receiptHandle = handles['receipt.cbor'];
    if (receiptHandle === undefined) {
      throw new Error('expected receipt shard handle');
    }

    const bytes = await collectAsyncIterable(indexes.openShard(receiptHandle));
    expect(defaultCodec.decode(bytes)).toEqual({
      version: 1,
      nodeCount: 2,
      labelCount: 2,
      shardCount: 5,
    });
    await expect(indexes.decodeShard(receiptHandle)).resolves.toEqual(defaultCodec.decode(bytes));
  });

  it('ignores unknown physical paths while scanning compatibility indexes', async () => {
    const blobOid = await history.writeBlob(defaultCodec.encode({ ignored: true }));
    const treeOid = await history.writeTree([`100644 blob ${blobOid}\tunknown.cbor`]);

    await expect(indexes.scanShards(new AssetHandle(treeOid)).collect()).resolves.toEqual([]);
  });
});
