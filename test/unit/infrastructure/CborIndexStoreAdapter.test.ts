import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BundleHandle as GitCasBundleHandle } from '@git-stunts/git-cas';
import { EdgeShard } from '../../../src/domain/artifacts/EdgeShard.ts';
import { LabelShard } from '../../../src/domain/artifacts/LabelShard.ts';
import { MetaShard } from '../../../src/domain/artifacts/MetaShard.ts';
import { PropertyShard } from '../../../src/domain/artifacts/PropertyShard.ts';
import { ReceiptShard } from '../../../src/domain/artifacts/ReceiptShard.ts';
import AssetHandle from '../../../src/domain/storage/AssetHandle.ts';
import BundleHandle from '../../../src/domain/storage/BundleHandle.ts';
import WarpStream from '../../../src/domain/stream/WarpStream.ts';
import { collectAsyncIterable } from '../../../src/domain/utils/streamUtils.ts';
import {
  CborIndexStoreAdapter,
  type GitCasIndexFacade,
} from '../../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import GitCasAssetStorageAdapter from '../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import IndexStorePort from '../../../src/ports/IndexStorePort.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';
import InMemoryBlobStorageAdapter from '../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../helpers/InMemoryGitCasFacade.ts';

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
  let backing: InMemoryBlobStorageAdapter;
  let cas: InMemoryGitCasFacade;
  let assets: GitCasAssetStorageAdapter;
  let indexes: CborIndexStoreAdapter;

  beforeEach(() => {
    history = new InMemoryGraphAdapter();
    backing = new InMemoryBlobStorageAdapter();
    cas = new InMemoryGitCasFacade({ history, storage: backing });
    assets = new GitCasAssetStorageAdapter({ cas, legacyReader: history });
    indexes = new CborIndexStoreAdapter({
      codec: defaultCodec,
      assetStorage: assets,
      cas,
    });
  });

  it('is an IndexStorePort and validates infrastructure dependencies', () => {
    expect(indexes).toBeInstanceOf(IndexStorePort);
    expect(() => new CborIndexStoreAdapter({
      // @ts-expect-error Runtime dependency guard for JavaScript callers.
      codec: null,
      assetStorage: assets,
      cas,
    })).toThrow(/codec/);
    expect(() => new CborIndexStoreAdapter({
      codec: defaultCodec,
      // @ts-expect-error Runtime dependency guard for JavaScript callers.
      assetStorage: null,
      cas,
    })).toThrow(/assetStorage/);
    expect(() => new CborIndexStoreAdapter({
      codec: defaultCodec,
      assetStorage: assets,
      // @ts-expect-error Runtime dependency guard for JavaScript callers.
      cas: null,
    })).toThrow(/cas/);
  });

  it('writes and scans every supported shard class through one index handle', async () => {
    const indexHandle = await indexes.writeShards(WarpStream.from(shards()));
    const recovered = await indexes.scanShards(indexHandle).collect();

    expect(indexHandle).toBeInstanceOf(BundleHandle);
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
    const open = vi.spyOn(assets, 'open');
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
    expect(open).not.toHaveBeenCalled();
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
    const staged = await assets.stage(WarpStream.from([defaultCodec.encode({ ignored: true })]), {
      slug: 'unknown-index-member',
      filename: 'unknown.cbor',
    });
    const bundle = await cas.bundles.putOrdered({
      members: [['unknown.cbor', staged.handle.toString()]],
    });

    await expect(indexes.scanShards(new BundleHandle(bundle.handle.toString())).collect())
      .resolves.toEqual([]);
  });

  it('rejects duplicate member paths while listing or scanning an index bundle', async () => {
    const indexHandle = await indexes.writeShards(WarpStream.from(shards()));
    const duplicateCas: GitCasIndexFacade = {
      bundles: {
        putOrdered: cas.bundles.putOrdered,
        iterateMembers: async function* (request) {
          let duplicated = false;
          for await (const member of cas.bundles.iterateMembers(request)) {
            yield member;
            if (!duplicated) {
              yield member;
              duplicated = true;
            }
          }
        },
      },
    };
    const duplicateIndexes = indexAdapter(assets, duplicateCas);

    await expect(duplicateIndexes.readShardHandles(indexHandle))
      .rejects.toMatchObject({ code: 'E_INDEX_DUPLICATE_BUNDLE_MEMBER' });
    await expect(duplicateIndexes.scanShards(indexHandle).collect())
      .rejects.toMatchObject({ code: 'E_INDEX_DUPLICATE_BUNDLE_MEMBER' });
  });

  it('rejects non-asset members while listing or scanning an index bundle', async () => {
    const indexHandle = await indexes.writeShards(WarpStream.from(shards()));
    const nonAssetCas: GitCasIndexFacade = {
      bundles: {
        putOrdered: cas.bundles.putOrdered,
        iterateMembers: async function* (request) {
          for await (const member of cas.bundles.iterateMembers(request)) {
            yield Object.freeze({
              ...member,
              path: 'unknown.cbor',
              handle: GitCasBundleHandle.parse(indexHandle.toString()),
            });
          }
        },
      },
    };
    const nonAssetIndexes = indexAdapter(assets, nonAssetCas);

    await expect(nonAssetIndexes.readShardHandles(indexHandle))
      .rejects.toMatchObject({ code: 'E_INDEX_INVALID_BUNDLE_MEMBER' });
    await expect(nonAssetIndexes.scanShards(indexHandle).collect())
      .rejects.toMatchObject({ code: 'E_INDEX_INVALID_BUNDLE_MEMBER' });
  });
});

function indexAdapter(
  assetStorage: GitCasAssetStorageAdapter,
  cas: GitCasIndexFacade,
): CborIndexStoreAdapter {
  return new CborIndexStoreAdapter({ codec: defaultCodec, assetStorage, cas });
}
