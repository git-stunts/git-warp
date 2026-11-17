/**
 * The incremental index agrees with a full rebuild for a node that leaves the
 * alive set while some of its property registers stay visible in state.
 *
 * A remove hides every register written before it. A register written after
 * the remove, by a writer that never saw the node, stays visible: it is not
 * indexed while the node is dead, and a full rebuild indexes it again once the
 * node is added.
 *
 * Representation: the incremental props shard keeps such a register while the
 * node is not alive, and a full rebuild omits it. Readers gate indexed
 * property reads on the alive bitmap (`QueryReads.hasIndexForNode`), so the
 * two indexes answer the same; the kept register is what lets a later add
 * show it without a scan of every property in state.
 *
 * Oracle: specified visibility. A full build (`LogicalIndexBuildService`)
 * indexes a property when its node is alive and its register is not hidden by
 * the node lifecycle rule; each case also states the expected value literally.
 */
import { describe, it, expect } from 'vitest';
import { applyWithDiff, createEmptyState, reducePatches } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import MaterializedViewService, { type BuildResult } from '../../../../src/domain/services/MaterializedViewService.ts';
import MockIndexStorage from '../../../helpers/MockIndexStorage.ts';
import type { PatchLike } from '../../../../src/domain/services/JoinReducer.ts';

type Entry = { readonly patch: PatchLike; readonly sha: string };

function entry(writer: string, lamport: number, ops: PatchLike['ops']): Entry {
  return {
    // Writers are named A-C, so the lowercase name is a hex digit.
    sha: `${writer.toLowerCase()}${String(lamport)}`.padEnd(40, '0'),
    patch: { writer, lamport, ops, context: VersionVector.empty() },
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

const ADDED_THEN_REMOVED = [
  entry('A', 1, [{ type: 'NodeAdd', node: 'n', dot: Dot.create('A', 1) }]),
  entry('A', 2, [{ type: 'NodeRemove', node: 'n', observedDots: [encodeDot(Dot.create('A', 1))] }]),
];
const WRITTEN_AFTER_REMOVE = entry('B', 5, [{ type: 'PropSet', node: 'n', key: 'color', value: 'red' }]);
const ADDED_AGAIN = entry('C', 6, [{ type: 'NodeAdd', node: 'n', dot: Dot.create('C', 1) }]);

describe('incremental index for a removed node with surviving property registers', () => {
  it('indexes no property of a node removed after its property was written', async () => {
    const entries = [
      entry('A', 1, [
        { type: 'NodeAdd', node: 'n', dot: Dot.create('A', 1) },
        { type: 'PropSet', node: 'n', key: 'color', value: 'red' },
      ]),
      entry('A', 2, [{ type: 'NodeRemove', node: 'n', observedDots: [encodeDot(Dot.create('A', 1))] }]),
    ];

    const full = await fullBuild(entries).propertyReader.getNodeProps('n');
    const incremental = await incrementalBuild(entries).propertyReader.getNodeProps('n');

    expect(full).toBeNull();
    expect(incremental).toEqual(full);
  });

  it('keeps the node dead when a writer that never saw the remove writes a property after it', () => {
    const entries = [...ADDED_THEN_REMOVED, WRITTEN_AFTER_REMOVE];

    const full = fullBuild(entries).logicalIndex.isAlive('n');
    const incremental = incrementalBuild(entries).logicalIndex.isAlive('n');

    expect(full).toBe(false);
    expect(incremental).toBe(full);
  });

  it('indexes the surviving property once the removed node is added again', async () => {
    const entries = [...ADDED_THEN_REMOVED, WRITTEN_AFTER_REMOVE, ADDED_AGAIN];

    const full = await fullBuild(entries).propertyReader.getNodeProps('n');
    const incremental = await incrementalBuild(entries).propertyReader.getNodeProps('n');

    expect(full).toEqual({ color: 'red' });
    expect(incremental).toEqual(full);
  });

  it('indexes a property written before the node was first added, once the node is added', async () => {
    const entries = [WRITTEN_AFTER_REMOVE, ADDED_AGAIN];

    const full = await fullBuild(entries).propertyReader.getNodeProps('n');
    const incremental = await incrementalBuild(entries).propertyReader.getNodeProps('n');

    expect(full).toEqual({ color: 'red' });
    expect(incremental).toEqual(full);
  });
});
