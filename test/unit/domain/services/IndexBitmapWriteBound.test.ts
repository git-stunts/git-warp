import { describe, expect, it } from 'vitest';
import RoaringShardRejectedError from '../../../../src/domain/errors/RoaringShardRejectedError.ts';
import IncrementalIndexUpdater from '../../../../src/domain/services/index/IncrementalIndexUpdater.ts';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.ts';
import { PatchDiff } from '../../../../src/domain/types/PatchDiff.ts';
import computeShardKey from '../../../../src/domain/utils/shardKey.ts';
import RoaringShardBounds from '../../../../src/infrastructure/adapters/RoaringShardBounds.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { fixtureToState, makeFixture } from '../../../helpers/fixtureDsl.ts';
import { encodePortableShard, fullRunContainers } from '../../../helpers/PortableRoaringShardFixture.ts';

const HUB = 'hub';
const HUB_EDGE_PATH = `fwd_${computeShardKey(HUB)}.cbor`;
const HUB_META_PATH = `meta_${computeShardKey(HUB)}.cbor`;

/** A node whose global id lies outside meta shard 00, so the stored neighbours do not hold it. */
function nodeOutsideFirstShard(): string {
  const node = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8']
    .find((candidate) => computeShardKey(candidate) !== '00');
  if (node === undefined) {
    throw new Error('no candidate node lies outside meta shard 00');
  }
  return node;
}

function hubGlobalId(tree: Record<string, Uint8Array>): number {
  const meta = tree[HUB_META_PATH];
  if (meta === undefined) {
    throw new Error('the fixture has no meta shard for the hub');
  }
  const decoded = defaultCodec.decode<{ nodeToGlobal: Array<[string, number]> }>(meta);
  const entry = decoded.nodeToGlobal.find(([nodeId]) => nodeId === HUB);
  if (entry === undefined) {
    throw new Error('the fixture meta shard does not list the hub');
  }
  return entry[1];
}

describe('the cardinality bound on a stored edge bitmap', () => {
  // Oracle: RoaringShardBounds.MAX_CARDINALITY is the documented support
  // limit for one bitmap. The stored neighbours are the 2^24 global ids of
  // meta shard 00, encoded as runs, so the next neighbour is one above it.
  it('refuses the edge that gives a node one neighbour above the bound', () => {
    const neighbour = nodeOutsideFirstShard();
    const nodes = [HUB, neighbour];
    const tree = new MaterializedViewService({ codec: defaultCodec })
      .build(fixtureToState(makeFixture({ nodes, edges: [] }))).tree;
    const atBound = encodePortableShard(fullRunContainers(256));
    const stored = {
      ...tree,
      [HUB_EDGE_PATH]: defaultCodec.encode({ all: { [String(hubGlobalId(tree))]: atBound } }),
    };
    const edge = { from: HUB, to: neighbour, label: 'owns' };
    const diff = new PatchDiff({
      nodesAdded: [],
      nodesRemoved: [],
      edgesAdded: [edge],
      edgesRemoved: [],
      propsChanged: [],
      nodesCleared: [],
    });
    const updater = new IncrementalIndexUpdater({ codec: defaultCodec });

    const write = (): Record<string, Uint8Array> => updater.computeDirtyShards({
      diff,
      state: fixtureToState(makeFixture({ nodes, edges: [edge] })),
      loadShard: (path) => stored[path],
    });

    expect(write).toThrow(RoaringShardRejectedError);
    expect(write).toThrow(expect.objectContaining({
      code: 'E_ROARING_SHARD_WRITE_CARDINALITY',
      context: {
        cardinality: RoaringShardBounds.MAX_CARDINALITY + 1,
        maxCardinality: RoaringShardBounds.MAX_CARDINALITY,
      },
    }));
  });
});
