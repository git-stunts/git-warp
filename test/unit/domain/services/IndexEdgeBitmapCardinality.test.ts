import { describe, expect, it } from 'vitest';
import { EdgeShard } from '../../../../src/domain/artifacts/EdgeShard.ts';
import LogicalIndexReader from '../../../../src/domain/services/index/LogicalIndexReader.ts';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import { PatchDiff } from '../../../../src/domain/types/PatchDiff.ts';
import { getRoaringBitmap32 } from '../../../../src/domain/utils/roaring.ts';
import computeShardKey from '../../../../src/domain/utils/shardKey.ts';
import { CborIndexStoreAdapter } from '../../../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import GitCasAssetStorageAdapter from '../../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';
import MockIndexStorage from '../../../helpers/MockIndexStorage.ts';
import { fixtureToState, makeFixture } from '../../../helpers/fixtureDsl.ts';
import { encodePortableShard, fullRunContainers } from '../../../helpers/PortableRoaringShardFixture.ts';

const HUB = 'hub';
const HUB_SHARD = computeShardKey(HUB);
const HUB_EDGE_PATH = `fwd_${HUB_SHARD}.cbor`;
const ALIVE_ID_SPACE = 2 ** 24;
/** Every global id of meta shards 00 and 01, as runs: twice the id space of one alive bitmap. */
const STORED_NEIGHBOURS = 2 * ALIVE_ID_SPACE;
const manyNeighbours = encodePortableShard(fullRunContainers(512));

/** A node whose global id lies outside meta shards 00 and 01, so the stored neighbours do not hold it. */
function nodeOutsideStoredNeighbours(): string {
  const node = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8']
    .find((candidate) => !['00', '01'].includes(computeShardKey(candidate)));
  if (node === undefined) {
    throw new Error('every candidate node lies in meta shard 00 or 01');
  }
  return node;
}

function globalIdOf(tree: Record<string, Uint8Array>, nodeId: string): number {
  const meta = tree[`meta_${computeShardKey(nodeId)}.cbor`];
  if (meta === undefined) {
    throw new Error(`the fixture has no meta shard for ${nodeId}`);
  }
  const decoded = defaultCodec.decode<{ nodeToGlobal: Array<[string, number]> }>(meta);
  const entry = decoded.nodeToGlobal.find(([candidate]) => candidate === nodeId);
  if (entry === undefined) {
    throw new Error(`the fixture meta shard does not list ${nodeId}`);
  }
  return entry[1];
}

function storedBitmapOf(tree: Record<string, Uint8Array>, bucket: string, owner: number): Uint8Array {
  const shard = tree[HUB_EDGE_PATH];
  if (shard === undefined) {
    throw new Error('the tree has no forward edge shard for the hub');
  }
  const bytes = defaultCodec.decode<Record<string, Record<string, Uint8Array>>>(shard)[bucket]?.[String(owner)];
  if (bytes === undefined) {
    throw new Error(`the hub has no stored bitmap in bucket ${bucket}`);
  }
  return bytes;
}

// Oracle: an edge bitmap holds neighbour global ids from all 256 meta shards,
// so a writer can store more than 2^24 values in one. Nothing may refuse such
// a bitmap for its cardinality on read or on write.
describe('an edge bitmap that holds more values than one alive bitmap can', () => {
  const service = new MaterializedViewService({ codec: defaultCodec, indexStore: new MockIndexStorage() });
  const neighbour = nodeOutsideStoredNeighbours();
  const nodes = [HUB, neighbour];
  const built = service.build(fixtureToState(makeFixture({ nodes, edges: [] }))).tree;
  const hubId = globalIdOf(built, HUB);
  const stored = {
    ...built,
    [HUB_EDGE_PATH]: defaultCodec.encode({ all: { [String(hubId)]: manyNeighbours } }),
  };

  it('is read from a stored index', () => {
    const reader = new LogicalIndexReader({ codec: defaultCodec });

    expect(() => reader.loadFromTree(stored)).not.toThrow();
    expect(getRoaringBitmap32().deserialize(manyNeighbours, true).size).toBe(STORED_NEIGHBOURS);
  });

  it('gains a neighbour through an incremental index update and is stored again', () => {
    const edge = { from: HUB, to: neighbour, label: 'owns' };
    const diff = new PatchDiff({
      nodesAdded: [],
      nodesRemoved: [],
      edgesAdded: [edge],
      edgesRemoved: [],
      propsChanged: [],
      nodesCleared: [],
    });

    const updated = service.applyDiff({
      existingTree: stored,
      diff,
      state: fixtureToState(makeFixture({ nodes, edges: [edge] })),
    }).tree;

    const all = getRoaringBitmap32().deserialize(storedBitmapOf(updated, 'all', hubId), true);
    expect(all.size).toBe(STORED_NEIGHBOURS + 1);
    expect(all.has(globalIdOf(built, neighbour))).toBe(true);
  });

  it('is written to an index bundle and scanned back', async () => {
    const cas = new InMemoryGitCasFacade({
      history: new InMemoryGraphAdapter(),
      storage: new InMemoryBlobStorageAdapter(),
    });
    const indexStore = new CborIndexStoreAdapter({
      codec: defaultCodec,
      assetStorage: new GitCasAssetStorageAdapter({ cas }),
      cas,
    });
    const Bitmap = getRoaringBitmap32();
    const grown = new Bitmap();
    grown.orInPlace(Bitmap.deserialize(manyNeighbours, true));
    grown.add(4_000_000_000);
    const shard = new EdgeShard({
      shardKey: HUB_SHARD,
      direction: 'fwd',
      buckets: { all: { [String(hubId)]: grown.serialize(true) } },
    });

    const root = await indexStore.writeShards(WarpStream.from([shard]));
    const scanned = await indexStore.scanShards(root).collect();

    expect(scanned).toHaveLength(1);
    expect(scanned[0]).toBeInstanceOf(EdgeShard);
    await expect(new LogicalIndexReader({ indexStore }).loadFromStore(root)).resolves.toBeInstanceOf(LogicalIndexReader);
  });
});
