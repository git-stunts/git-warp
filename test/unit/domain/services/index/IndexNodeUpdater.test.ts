/**
 * IndexNodeUpdater.purgeNodeEdges over working shards that the incremental
 * updater would hand it.
 *
 * Oracle: specified. A purge clears every edge row of the removed node and
 * removes the node from the rows of the peers that those rows name. It
 * changes no other row.
 */
import { describe, expect, it } from 'vitest';
import IndexNodeUpdater from '../../../../../src/domain/services/index/IndexNodeUpdater.ts';
import type { EdgeShardData, WorkingMetaShard } from '../../../../../src/domain/services/index/types.ts';
import computeShardKey from '../../../../../src/domain/utils/shardKey.ts';
import { getRoaringBitmap32 } from '../../../../../src/domain/utils/roaring.ts';

const DEAD = 'dead';
const OTHER = 'other';
const DEAD_SHARD = computeShardKey(DEAD);
const OTHER_SHARD = computeShardKey(OTHER);
const SEARCH_LIMIT = 100_000;

/** The first id `n<i>` that routes to the shard, so ids and global ids agree. */
function nodeIdInShard(shardKey: string): string {
  for (let index = 0; index < SEARCH_LIMIT; index++) {
    const nodeId = `n${String(index)}`;
    if (computeShardKey(nodeId) === shardKey) {
      return nodeId;
    }
  }
  throw new Error(`no node id routes to shard ${shardKey}`);
}

const NEIGHBOUR = nodeIdInShard(DEAD_SHARD);

function globalId(shardKey: string, localId: number): number {
  return ((parseInt(shardKey, 16) << 24) | localId) >>> 0;
}

const DEAD_GID = globalId(DEAD_SHARD, 0);
/** Another node in the removed node's shard. */
const NEIGHBOUR_GID = globalId(DEAD_SHARD, 1);
/** A global id in the removed node's shard that no meta shard maps. */
const UNMAPPED_GID = globalId(DEAD_SHARD, 9);
const OTHER_GID = globalId(OTHER_SHARD, 0);

/** One meta view of every mapped node: the purge looks nodes up by global id only. */
function meta(): WorkingMetaShard {
  const entries: Array<[string, number]> = [[DEAD, DEAD_GID], [NEIGHBOUR, NEIGHBOUR_GID], [OTHER, OTHER_GID]];
  const RoaringBitmap32 = getRoaringBitmap32();
  return {
    nodeToGlobal: entries,
    nextLocalId: entries.length,
    aliveBitmap: new RoaringBitmap32(),
    globalToNode: new Map(entries.map(([nodeId, gid]) => [gid, nodeId])),
    nodeToGlobalMap: new Map(entries),
  };
}

function bitmapOf(values: readonly number[]): Uint8Array {
  return new (getRoaringBitmap32())(values).serialize(true);
}

function valuesOf(bytes: Uint8Array | undefined): number[] {
  return bytes === undefined ? [] : getRoaringBitmap32().deserialize(bytes, true).toArray();
}

/** Purges the removed node over edge shards keyed by shard key; returns the same, mutated, maps. */
function purge(shards: {
  readonly fwd: Map<string, EdgeShardData>;
  readonly rev: Map<string, EdgeShardData>;
}): typeof shards {
  const view = meta();
  new IndexNodeUpdater().purgeNodeEdges(DEAD, {
    fwdCache: shards.fwd,
    revCache: shards.rev,
    getOrLoadMeta: () => view,
    getOrLoadEdgeShard: (cache, _direction, shardKey) => {
      const data = cache.get(shardKey) ?? {};
      cache.set(shardKey, data);
      return data;
    },
  });
  return shards;
}

describe('IndexNodeUpdater.purgeNodeEdges', () => {
  it('uses two nodes in different shards', () => {
    expect(DEAD_SHARD).not.toBe(OTHER_SHARD);
  });

  it('leaves the row of another node unchanged in a bucket where the removed node has no row', () => {
    const fwd = new Map<string, EdgeShardData>([[DEAD_SHARD, { all: { [String(NEIGHBOUR_GID)]: bitmapOf([OTHER_GID]) } }]]);

    const result = purge({ fwd, rev: new Map() });

    expect(valuesOf(result.fwd.get(DEAD_SHARD)?.['all']?.[String(NEIGHBOUR_GID)])).toEqual([OTHER_GID]);
  });

  it('clears the removed node row and skips a peer global id that no meta shard maps', () => {
    const fwd = new Map<string, EdgeShardData>([[DEAD_SHARD, { all: { [String(DEAD_GID)]: bitmapOf([UNMAPPED_GID, OTHER_GID]) } }]]);
    const rev = new Map<string, EdgeShardData>([[OTHER_SHARD, { all: { [String(OTHER_GID)]: bitmapOf([DEAD_GID]) } }]]);

    const result = purge({ fwd, rev });

    expect({
      deadForward: valuesOf(result.fwd.get(DEAD_SHARD)?.['all']?.[String(DEAD_GID)]),
      otherReverse: valuesOf(result.rev.get(OTHER_SHARD)?.['all']?.[String(OTHER_GID)]),
    }).toEqual({ deadForward: [], otherReverse: [] });
  });

  it('clears the removed node row and adds no row for a peer that has no matching row', () => {
    const fwd = new Map<string, EdgeShardData>([[DEAD_SHARD, { all: { [String(DEAD_GID)]: bitmapOf([NEIGHBOUR_GID, OTHER_GID]) } }]]);
    // The neighbour's reverse bucket exists without its row; the other node's reverse shard has no bucket.
    const rev = new Map<string, EdgeShardData>([[DEAD_SHARD, { all: {} }], [OTHER_SHARD, {}]]);

    const result = purge({ fwd, rev });

    expect({
      deadForward: valuesOf(result.fwd.get(DEAD_SHARD)?.['all']?.[String(DEAD_GID)]),
      reverse: Object.fromEntries(result.rev),
    }).toEqual({ deadForward: [], reverse: { [DEAD_SHARD]: { all: {} }, [OTHER_SHARD]: {} } });
  });
});
