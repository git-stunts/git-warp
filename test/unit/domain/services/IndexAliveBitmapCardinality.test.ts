import { describe, expect, it } from 'vitest';
import IncrementalIndexUpdater from '../../../../src/domain/services/index/IncrementalIndexUpdater.ts';
import LogicalIndexReader from '../../../../src/domain/services/index/LogicalIndexReader.ts';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import { PatchDiff } from '../../../../src/domain/types/PatchDiff.ts';
import computeShardKey from '../../../../src/domain/utils/shardKey.ts';
import { CborIndexStoreAdapter } from '../../../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import GitCasAssetStorageAdapter from '../../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';
import { fixtureToState, makeFixture } from '../../../helpers/fixtureDsl.ts';
import { encodePortableShard, fullRunContainers } from '../../../helpers/PortableRoaringShardFixture.ts';

// Oracle: the alive bitmap of one meta shard holds global ids of that shard
// only, and a global id carries a 24-bit local id. 2^24 values is the most a
// writer can store, so one value more comes from a peer or from damage.
const META_PATH = `meta_${computeShardKey('A')}.cbor`;
const ID_SPACE_OF_ONE_SHARD = 2 ** 24;
const AT_BOUND = encodePortableShard(fullRunContainers(256));
const ONE_ABOVE = encodePortableShard([...fullRunContainers(256), { kind: 'array', key: 256, values: [0] }]);
const ABOVE_BOUND = {
  code: 'E_ROARING_SHARD_CARDINALITY',
  context: { cardinality: ID_SPACE_OF_ONE_SHARD + 1, maxCardinality: ID_SPACE_OF_ONE_SHARD },
};

function metaShardWith(alive: Uint8Array): Uint8Array {
  return defaultCodec.encode({ nodeToGlobal: [['A', 0]], nextLocalId: 1, alive });
}

describe('the alive bitmap of one meta shard', () => {
  it('is read when it holds exactly the id space of the shard', () => {
    const index = new LogicalIndexReader({ codec: defaultCodec })
      .loadFromTree({ [META_PATH]: metaShardWith(AT_BOUND) })
      .toLogicalIndex();

    expect(index.isAlive('A')).toBe(true);
  });

  it('is refused from a stored tree when it holds one value more', () => {
    const reader = new LogicalIndexReader({ codec: defaultCodec });

    expect(() => reader.loadFromTree({ [META_PATH]: metaShardWith(ONE_ABOVE) }))
      .toThrow(expect.objectContaining(ABOVE_BOUND));
  });

  it('is refused while the adapter scans shards when it holds one value more', async () => {
    const cas = new InMemoryGitCasFacade({
      history: new InMemoryGraphAdapter(),
      storage: new InMemoryBlobStorageAdapter(),
    });
    const assets = new GitCasAssetStorageAdapter({ cas });
    const indexStore = new CborIndexStoreAdapter({ codec: defaultCodec, assetStorage: assets, cas });
    const staged = await assets.stage(WarpStream.from([metaShardWith(ONE_ABOVE)]), {
      slug: 'alive-above-bound',
      filename: META_PATH,
    });
    const bundle = await cas.bundles.putOrdered({ members: [[META_PATH, staged.handle.toString()]] });

    await expect(new LogicalIndexReader({ indexStore }).loadFromStore(new BundleHandle(bundle.handle.toString())))
      .rejects.toMatchObject(ABOVE_BOUND);
  });

  it('is refused by an incremental index update when it holds one value more', () => {
    const edge = { from: 'A', to: 'B', label: 'owns' };
    const tree = new MaterializedViewService({ codec: defaultCodec })
      .build(fixtureToState(makeFixture({ nodes: ['A', 'B'], edges: [] }))).tree;
    const stored = { ...tree, [META_PATH]: metaShardWith(ONE_ABOVE) };
    const updater = new IncrementalIndexUpdater({ codec: defaultCodec });

    expect(() => updater.computeDirtyShards({
      diff: new PatchDiff({
        nodesAdded: [],
        nodesRemoved: [],
        edgesAdded: [edge],
        edgesRemoved: [],
        propsChanged: [],
        nodesCleared: [],
      }),
      state: fixtureToState(makeFixture({ nodes: ['A', 'B'], edges: [edge] })),
      loadShard: (path) => stored[path],
    })).toThrow(expect.objectContaining(ABOVE_BOUND));
  });
});
