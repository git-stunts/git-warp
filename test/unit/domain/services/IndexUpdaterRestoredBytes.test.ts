import { describe, expect, it } from 'vitest';
import { EdgeShard } from '../../../../src/domain/artifacts/EdgeShard.ts';
import RoaringShardRejectedError from '../../../../src/domain/errors/RoaringShardRejectedError.ts';
import IncrementalIndexUpdater from '../../../../src/domain/services/index/IncrementalIndexUpdater.ts';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.ts';
import { PatchDiff } from '../../../../src/domain/types/PatchDiff.ts';
import computeShardKey from '../../../../src/domain/utils/shardKey.ts';
import CborIndexShardTree from '../../../../src/infrastructure/adapters/CborIndexShardTree.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import MockIndexStorage from '../../../helpers/MockIndexStorage.ts';
import { fixtureToState, makeFixture } from '../../../helpers/fixtureDsl.ts';

/**
 * #1159 follow-up from the PR #1128 decision check: the incremental updater
 * re-encodes a whole edge shard but deserializes only the owners it
 * changes, so another owner's bitmap bytes are stored again without
 * inspection. Readers still inspect them.
 *
 * Oracle: the bytes below are not a portable Roaring bitmap (unknown
 * cookie), so the shard boundary refuses them wherever it inspects them.
 */
const NOT_A_BITMAP = new Uint8Array([1, 2, 3]);
const SOURCE = 'A';
const EDGE_PATH = `fwd_${computeShardKey(SOURCE)}.cbor`;

function edgeDiff(): PatchDiff {
  return new PatchDiff({
    nodesAdded: [],
    nodesRemoved: [],
    edgesAdded: [{ from: SOURCE, to: 'B', label: 'owns' }],
    edgesRemoved: [],
    propsChanged: [],
    nodesCleared: [],
  });
}

/** A built tree whose forward shard for A also holds an uninspected bitmap of an owner the diff does not touch. */
function treeWithForeignOwner(): Record<string, Uint8Array> {
  const state = fixtureToState(makeFixture({ nodes: [SOURCE, 'B'], edges: [] }));
  const tree = new MaterializedViewService({ indexStore: new MockIndexStorage() }).build(state).tree;
  return { ...tree, [EDGE_PATH]: defaultCodec.encode({ all: { '4000000000': NOT_A_BITMAP } }) };
}

function updatedEdgeShard(tree: Record<string, Uint8Array>): EdgeShard | Error {
  const state = fixtureToState(makeFixture({ nodes: [SOURCE, 'B'], edges: [{ from: SOURCE, to: 'B', label: 'owns' }] }));
  try {
    const dirty = new IncrementalIndexUpdater().computeDirtyShards({
      diff: edgeDiff(),
      state,
      shards: new CborIndexShardTree({ codec: defaultCodec, tree }),
    });
    return dirty.find((shard): shard is EdgeShard => shard instanceof EdgeShard && shard.direction === 'fwd')
      ?? new Error('the update wrote no forward edge shard');
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

describe('an edge shard owner that an incremental index update does not change (#1159)', () => {
  it('is refused by the reader that loads the updated tree', () => {
    const service = new MaterializedViewService({ indexStore: new MockIndexStorage() });
    const state = fixtureToState(makeFixture({ nodes: [SOURCE, 'B'], edges: [{ from: SOURCE, to: 'B', label: 'owns' }] }));

    expect(() => service.applyDiff({ existingTree: treeWithForeignOwner(), diff: edgeDiff(), state }))
      .toThrow(RoaringShardRejectedError);
  });

  // Reproduced, not fixed: the updater returns the shard with the foreign
  // owner's bytes unchanged and uninspected.
  it.fails('is inspected before the updater stores it again (#1159)', () => {
    const outcome = updatedEdgeShard(treeWithForeignOwner());

    expect(outcome).toBeInstanceOf(RoaringShardRejectedError);
  });
});
