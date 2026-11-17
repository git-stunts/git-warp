import { describe, expect, it } from 'vitest';
import { EdgeShard } from '../../../../src/domain/artifacts/EdgeShard.ts';
import type { IndexShard } from '../../../../src/domain/artifacts/IndexShard.ts';
import { PropertyShard } from '../../../../src/domain/artifacts/PropertyShard.ts';
import { INDEX_SHARD_LIMITS } from '../../../../src/domain/materialization/IndexShardLimits.ts';
import { MAX_MATERIALIZATION_INDEX_SHARDS } from '../../../../src/domain/materialization/MaterializationIndexProfile.ts';
import { materializationPropertyShardKey } from '../../../../src/domain/materialization/MaterializationPropertyProfile.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import computeShardKey from '../../../../src/domain/utils/shardKey.ts';
import CborIndexShardTree from '../../../../src/infrastructure/adapters/CborIndexShardTree.ts';
import { CborIndexStoreAdapter } from '../../../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import GitCasAssetStorageAdapter from '../../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';
import { encodePortableShard, type FixtureContainer } from '../../../helpers/PortableRoaringShardFixture.ts';

/**
 * #1159 items 2 and D3/D4: one index-shard bound, INDEX_SHARD_LIMITS
 * (16 MiB, 2,000,000 items), for every index-shard writer and reader. Before
 * it, the checkpoint writer stored a shard of up to 16 MiB and every reader
 * decoded with the default codec, which refuses a file above 5 MiB.
 *
 * Oracle: the decision on #1159. A shard that the writer stores reads back;
 * a shard above the bound is refused at write with E_INDEX_SHARD_TOO_LARGE,
 * and a reader refuses one planted above the bound with the same code and
 * the same maximum.
 */
const HUB = 'hub';
const PATH = `fwd_${computeShardKey(HUB)}.cbor`;
const DEFAULT_READ_LIMIT = 5 * 1024 * 1024;
const BOUND = INDEX_SHARD_LIMITS.maxBytes;
const CHECKPOINT_WRITE = Object.freeze({
  expectedShardCount: 1,
  memberStorage: 'page' as const,
  maxShardCount: MAX_MATERIALIZATION_INDEX_SHARDS,
  maxShardBytes: INDEX_SHARD_LIMITS.maxBytes,
  structureLimits: INDEX_SHARD_LIMITS.structureLimits,
});

/** One edge bitmap of 640 array containers of 4,096 values: 5,248,008 bytes, within the bitmap byte bound. */
function sparseHubBitmap(): Uint8Array {
  const values = Array.from({ length: 4_096 }, (_unused, index) => index * 16);
  const containers = Array.from({ length: 640 }, (_unused, key): FixtureContainer => ({ kind: 'array', key, values }));
  return encodePortableShard(containers);
}

function edgeShardOf(bitmap: Uint8Array): EdgeShard {
  return new EdgeShard({ shardKey: computeShardKey(HUB), direction: 'fwd', buckets: { all: { '0': bitmap } } });
}

/** An edge shard whose encoding is exactly `encodedBytes` long; the store reads bitmap values only as bytes. */
function edgeShardEncodedAs(encodedBytes: number): EdgeShard {
  const overhead = defaultCodec.encode(edgeShardOf(new Uint8Array(1 << 16)).buckets).byteLength - (1 << 16);
  return edgeShardOf(new Uint8Array(encodedBytes - overhead));
}

function inMemoryCas(): InMemoryGitCasFacade {
  return new InMemoryGitCasFacade({ history: new InMemoryGraphAdapter(), storage: new InMemoryBlobStorageAdapter() });
}

function indexStoreOver(cas: InMemoryGitCasFacade): CborIndexStoreAdapter {
  return new CborIndexStoreAdapter({ codec: defaultCodec, assetStorage: new GitCasAssetStorageAdapter({ cas }), cas });
}

/** Writes one shard as MaterializationIndexRoots does, then reads it as the checkpoint readers do. */
async function writeThenRead(shard: IndexShard, path: string): Promise<string> {
  const store = indexStoreOver(inMemoryCas());
  const root = await store.writeShards(WarpStream.from([shard]), CHECKPOINT_WRITE);
  const decoded = await store.decodeShardAt(root, path, INDEX_SHARD_LIMITS);
  return decoded === null ? 'missing' : 'read back';
}

/** Stores encoded bytes as a bundle member without the writer, as a damaged or foreign root would hold them. */
async function plantedRoot(cas: InMemoryGitCasFacade, kind: 'asset' | 'page', bytes: Uint8Array): Promise<BundleHandle> {
  const token = kind === 'page'
    ? (await cas.pages.put({ source: bytes, maxBytes: bytes.byteLength })).handle.toString()
    : (await new GitCasAssetStorageAdapter({ cas }).stage(WarpStream.from([bytes]), { slug: 'planted', filename: PATH })).handle.toString();
  const bundle = await cas.bundles.putOrdered({ members: [[PATH, token]] });
  return new BundleHandle(bundle.handle.toString());
}

describe('the shared index-shard bound (#1159)', () => {
  it('stores and reads back an edge shard between the default 5 MiB and the bound', async () => {
    const shard = edgeShardOf(sparseHubBitmap());

    expect(defaultCodec.encode(shard.buckets).byteLength).toBeGreaterThan(DEFAULT_READ_LIMIT);
    await expect(writeThenRead(shard, PATH)).resolves.toBe('read back');
  });

  it('stores and reads back an edge shard of exactly the bound', async () => {
    const shard = edgeShardEncodedAs(BOUND);

    expect(defaultCodec.encode(shard.buckets).byteLength).toBe(BOUND);
    await expect(writeThenRead(shard, PATH)).resolves.toBe('read back');
  });

  it('refuses at write an edge shard one byte over the bound', async () => {
    const store = indexStoreOver(inMemoryCas());

    await expect(store.writeShards(WarpStream.from([edgeShardEncodedAs(BOUND + 1)]), CHECKPOINT_WRITE))
      .rejects.toMatchObject({ code: 'E_INDEX_SHARD_TOO_LARGE', context: { path: PATH, actual: BOUND + 1, maximum: BOUND } });
  });

  it.each(['asset', 'page'] as const)('refuses at read, with the same code, a %s member planted one byte over the bound', async (kind) => {
    const cas = inMemoryCas();
    const root = await plantedRoot(cas, kind, defaultCodec.encode(edgeShardEncodedAs(BOUND + 1).buckets));

    await expect(indexStoreOver(cas).decodeShardAt(root, PATH))
      .rejects.toMatchObject({ code: 'E_INDEX_SHARD_TOO_LARGE', context: { maximum: BOUND } });
  });

  // Oracle: only the CAS page size refusal is an index-shard size refusal;
  // any other CAS failure is the storage's own and reaches the caller as is.
  it('passes a page failure other than its size through unchanged', async () => {
    const cas = inMemoryCas();
    const root = await plantedRoot(cas, 'page', defaultCodec.encode(edgeShardOf(new Uint8Array(4)).buckets));
    const missing = Object.assign(new Error('page is gone'), { code: 'HANDLE_TARGET_MISSING' });
    const failingPages = { get: () => Promise.reject(missing), put: cas.pages.put };
    const store = new CborIndexStoreAdapter({
      codec: defaultCodec,
      assetStorage: new GitCasAssetStorageAdapter({ cas }),
      cas: { bundles: cas.bundles, pages: failingPages },
    });

    await expect(store.decodeShardAt(root, PATH)).rejects.toBe(missing);
  });

  it('stores and reads back a property shard between the default 5 MiB and the bound', async () => {
    const shardKey = materializationPropertyShardKey('node:large');
    const shard = new PropertyShard({
      shardKey,
      schemaVersion: 2,
      entries: [['node:large', { note: 'x'.repeat(6 * 1024 * 1024) }]],
    });

    await expect(writeThenRead(shard, `props_${shardKey}.cbor`)).resolves.toBe('read back');
  });

  it('builds and reads back an in-memory view tree that holds a shard above the default 5 MiB', () => {
    const tree = new CborIndexShardTree({ codec: defaultCodec, tree: {} }).withShards([edgeShardOf(sparseHubBitmap())]);

    expect(new CborIndexShardTree({ codec: defaultCodec, tree }).readIndexShards()).toHaveLength(1);
  });

  it('refuses to build an in-memory view tree with a shard one byte over the bound', () => {
    const tree = new CborIndexShardTree({ codec: defaultCodec, tree: {} });

    expect(() => tree.withShards([edgeShardEncodedAs(BOUND + 1)]))
      .toThrow(expect.objectContaining({ code: 'E_INDEX_SHARD_TOO_LARGE', context: { path: PATH, actual: BOUND + 1, maximum: BOUND } }));
  });

  it('refuses to read, with the same code, an in-memory view tree shard one byte over the bound', () => {
    const planted = { [PATH]: defaultCodec.encode(edgeShardEncodedAs(BOUND + 1).buckets) };

    expect(() => new CborIndexShardTree({ codec: defaultCodec, tree: planted }).readIndexShards())
      .toThrow(expect.objectContaining({ code: 'E_INDEX_SHARD_TOO_LARGE', context: { path: PATH, actual: BOUND + 1, maximum: BOUND } }));
  });
});
