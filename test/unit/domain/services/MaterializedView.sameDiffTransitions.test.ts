/**
 * The incremental index agrees with a full rebuild when one patch moves a
 * node or an edge out of the alive set and back in, or in and back out.
 *
 * A diff records each alive-ness transition of each op, so such a patch puts
 * the element in both the added and the removed list of one diff. Only the
 * state after the whole patch decides whether it is alive.
 *
 * Oracle: specified visibility. A full build (`LogicalIndexBuildService`)
 * indexes the nodes alive after the patch and the edges alive after the patch
 * whose endpoints are alive; each case also states the expected value literally.
 */
import { describe, it, expect } from 'vitest';
import { applyWithDiff, createEmptyState, reducePatches } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import MaterializedViewService, { type BuildResult } from '../../../../src/domain/services/MaterializedViewService.ts';
import BitmapNeighborProvider from '../../../../src/domain/services/index/BitmapNeighborProvider.ts';
import MockIndexStorage from '../../../helpers/MockIndexStorage.ts';
import type { PatchLike } from '../../../../src/domain/services/JoinReducer.ts';

type Entry = { readonly patch: PatchLike; readonly sha: string };

function entry(lamport: number, ops: PatchLike['ops']): Entry {
  return {
    sha: `a${String(lamport)}`.padEnd(40, '0'),
    patch: { writer: 'A', lamport, ops, context: VersionVector.empty() },
  };
}

function service(): MaterializedViewService {
  return new MaterializedViewService({ indexStore: new MockIndexStorage() });
}

function fullBuild(entries: readonly Entry[]): BuildResult {
  return service().build(reducePatches([...entries]));
}

function incrementalBuild(entries: readonly Entry[]): BuildResult {
  const views = service();
  const state = createEmptyState();
  let result = views.build(createEmptyState());
  for (const { patch, sha } of entries) {
    const { diff } = applyWithDiff(state, patch, sha);
    result = views.applyDiff({ existingTree: result.tree, diff, state });
  }
  return result;
}

async function outgoing(result: BuildResult, nodeId: string): Promise<string[]> {
  const edges = await new BitmapNeighborProvider({ logicalIndex: result.logicalIndex }).getNeighbors(nodeId, 'out');
  return edges.map((edge) => `${edge.label}:${edge.neighborId}`).sort();
}

const NODES_A_AND_B = entry(1, [
  { type: 'NodeAdd', node: 'a', dot: Dot.create('A', 1) },
  { type: 'NodeAdd', node: 'b', dot: Dot.create('A', 2) },
]);

describe('incremental index for a patch that moves an element out of the alive set and back', () => {
  it('keeps a node alive that one patch removes and then adds again', () => {
    const entries = [
      NODES_A_AND_B,
      entry(2, [
        { type: 'NodeRemove', node: 'a', observedDots: [encodeDot(Dot.create('A', 1))] },
        { type: 'NodeAdd', node: 'a', dot: Dot.create('A', 3) },
      ]),
    ];

    const full = fullBuild(entries).logicalIndex.isAlive('a');
    const incremental = incrementalBuild(entries).logicalIndex.isAlive('a');

    expect(full).toBe(true);
    expect(incremental).toBe(full);
  });

  it('keeps a node dead that one patch adds and then removes', () => {
    const entries = [
      NODES_A_AND_B,
      entry(2, [
        { type: 'NodeAdd', node: 'c', dot: Dot.create('A', 3) },
        { type: 'NodeRemove', node: 'c', observedDots: [encodeDot(Dot.create('A', 3))] },
      ]),
    ];

    const full = fullBuild(entries).logicalIndex.isAlive('c');
    const incremental = incrementalBuild(entries).logicalIndex.isAlive('c');

    expect(full).toBe(false);
    expect(incremental).toBe(full);
  });

  it('keeps an edge indexed that one patch removes and then adds again', async () => {
    const entries = [
      NODES_A_AND_B,
      entry(2, [{ type: 'EdgeAdd', from: 'a', to: 'b', label: 'x', dot: Dot.create('A', 3) }]),
      entry(3, [
        { type: 'EdgeRemove', from: 'a', to: 'b', label: 'x', observedDots: [encodeDot(Dot.create('A', 3))] },
        { type: 'EdgeAdd', from: 'a', to: 'b', label: 'x', dot: Dot.create('A', 4) },
      ]),
    ];

    const full = await outgoing(fullBuild(entries), 'a');
    const incremental = await outgoing(incrementalBuild(entries), 'a');

    expect(full).toEqual(['x:b']);
    expect(incremental).toEqual(full);
  });

  it('keeps an edge unindexed that one patch adds and then removes', async () => {
    const entries = [
      NODES_A_AND_B,
      entry(2, [
        { type: 'EdgeAdd', from: 'a', to: 'b', label: 'x', dot: Dot.create('A', 3) },
        { type: 'EdgeRemove', from: 'a', to: 'b', label: 'x', observedDots: [encodeDot(Dot.create('A', 3))] },
      ]),
    ];

    const full = await outgoing(fullBuild(entries), 'a');
    const incremental = await outgoing(incrementalBuild(entries), 'a');

    expect(full).toEqual([]);
    expect(incremental).toEqual(full);
  });
});
