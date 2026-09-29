/**
 * The incremental property index agrees with a full rebuild when a node's
 * lifecycle makes indexed properties stale.
 *
 * A node property is hidden once a remove of the node sorts between the
 * write and the node's latest add. That can happen without the node ever
 * leaving the alive set, and a write can arrive after the remove and add
 * that already hide it. The incremental index must drop, or never index,
 * those properties, exactly as a full rebuild does.
 */
import { describe, it, expect } from 'vitest';
import { applyWithDiff, createEmptyState, reducePatches } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import MaterializedViewService, { type BuildResult } from '../../../../src/domain/services/MaterializedViewService.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import type { PatchLike } from '../../../../src/domain/services/JoinReducer.ts';

type Entry = { readonly patch: PatchLike; readonly sha: string };

function entry(writer: string, lamport: number, ops: PatchLike['ops']): Entry {
  return {
    // Writers are named A-C, so the lowercase name is a hex digit.
    sha: `${writer.toLowerCase()}${String(lamport)}`.padEnd(40, '0'),
    patch: { writer, lamport, ops, context: VersionVector.empty() },
  };
}

function fullBuild(entries: readonly Entry[]): BuildResult {
  return new MaterializedViewService({ codec: defaultCodec }).build(reducePatches([...entries]));
}

function incrementalBuild(entries: readonly Entry[]): BuildResult {
  const service = new MaterializedViewService({ codec: defaultCodec });
  const state = createEmptyState();
  let result = service.build(createEmptyState());
  for (const { patch, sha } of entries) {
    const { diff } = applyWithDiff(state, patch, sha);
    result = service.applyDiff({ existingTree: result.tree, diff, state });
  }
  return result;
}

describe('incremental property index across a node lifecycle', () => {
  it('drops a property hidden by an add that passes an earlier remove while the node stays alive', async () => {
    const entries = [
      entry('A', 1, [
        { type: 'NodeAdd', node: 'n', dot: Dot.create('A', 1) },
        { type: 'PropSet', node: 'n', key: 'color', value: 'red' },
      ]),
      entry('B', 2, [{ type: 'NodeAdd', node: 'n', dot: Dot.create('B', 1) }]),
      entry('A', 3, [{ type: 'NodeRemove', node: 'n', observedDots: [encodeDot(Dot.create('A', 1))] }]),
      entry('C', 6, [{ type: 'NodeAdd', node: 'n', dot: Dot.create('C', 1) }]),
    ];

    const full = await fullBuild(entries).propertyReader.getNodeProps('n');
    const incremental = await incrementalBuild(entries).propertyReader.getNodeProps('n');

    expect(full).toBeNull();
    expect(incremental).toEqual(full);
  });

  it('does not index a write that arrives after the remove and add that hide it', async () => {
    const entries = [
      entry('A', 1, [{ type: 'NodeAdd', node: 'n', dot: Dot.create('A', 1) }]),
      entry('A', 3, [{ type: 'NodeRemove', node: 'n', observedDots: [encodeDot(Dot.create('A', 1))] }]),
      entry('A', 4, [
        { type: 'NodeAdd', node: 'n', dot: Dot.create('A', 2) },
        { type: 'PropSet', node: 'n', key: 'title', value: 'new' },
      ]),
      entry('B', 2, [{ type: 'PropSet', node: 'n', key: 'color', value: 'red' }]),
    ];

    const full = await fullBuild(entries).propertyReader.getNodeProps('n');
    const incremental = await incrementalBuild(entries).propertyReader.getNodeProps('n');

    expect(full).toEqual({ title: 'new' });
    expect(incremental).toEqual(full);
  });

  it('indexes a value written again after the remove and add that hid the same value', async () => {
    const entries = [
      entry('A', 1, [
        { type: 'NodeAdd', node: 'n', dot: Dot.create('A', 1) },
        { type: 'PropSet', node: 'n', key: 'status', value: 'active' },
      ]),
      entry('A', 2, [{ type: 'NodeRemove', node: 'n', observedDots: [encodeDot(Dot.create('A', 1))] }]),
      entry('A', 3, [{ type: 'NodeAdd', node: 'n', dot: Dot.create('A', 2) }]),
      entry('A', 4, [{ type: 'PropSet', node: 'n', key: 'status', value: 'active' }]),
    ];

    const full = await fullBuild(entries).propertyReader.getNodeProps('n');
    const incremental = await incrementalBuild(entries).propertyReader.getNodeProps('n');

    expect(full).toEqual({ status: 'active' });
    expect(incremental).toEqual(full);
  });
});
