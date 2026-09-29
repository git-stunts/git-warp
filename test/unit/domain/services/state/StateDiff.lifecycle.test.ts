/**
 * The subscription diff reports node properties as reads see them.
 *
 * A remove followed by a re-add hides every node property written before the
 * remove. Subscribers learn about graph changes only through diffStates, so a
 * property that a lifecycle change hides must appear there as removed, and a
 * hidden register must never appear as a value.
 */
import { describe, expect, it } from 'vitest';
import { applyPatchOp, createEmptyState } from '../../../../../src/domain/services/JoinReducer.ts';
import { Dot, encodeDot } from '../../../../../src/domain/crdt/Dot.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import { diffStates } from '../../../../../src/domain/services/state/StateDiff.ts';
import { projectState } from '../../../../../src/domain/services/state/StateSerializer.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';
import PropSet from '../../../../../src/domain/types/ops/PropSet.ts';
import type WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import type Op from '../../../../../src/domain/types/ops/Op.ts';

const PATCH_SHA = 'abcdef01';

function event(lamport: number, writerId: string): EventId {
  return new EventId(lamport, writerId, PATCH_SHA, 0);
}

function replay(steps: ReadonlyArray<readonly [Op, EventId]>): WarpState {
  const state = createEmptyState();
  for (const [op, eventId] of steps) {
    applyPatchOp(state, op, eventId);
  }
  return state;
}

const WRITTEN: ReadonlyArray<readonly [Op, EventId]> = [
  [new NodeAdd('n', Dot.create('A', 1)), event(1, 'A')],
  [new PropSet('n', 'color', 'red'), event(2, 'A')],
];

const REMOVED_AND_READDED: ReadonlyArray<readonly [Op, EventId]> = [
  ...WRITTEN,
  [new NodeRemove('n', [encodeDot(Dot.create('A', 1))]), event(3, 'A')],
  [new NodeAdd('n', Dot.create('B', 1)), event(4, 'B')],
];

describe('diffStates across a node lifecycle change', () => {
  it('reports a property hidden by a remove and a re-add as removed', () => {
    const before = replay(WRITTEN);
    const after = replay(REMOVED_AND_READDED);

    const diff = diffStates(before, after);

    expect(projectState(after).props).toEqual([]);
    expect(diff.nodes).toEqual({ added: [], removed: [] });
    expect(diff.props.set).toEqual([]);
    expect(diff.props.removed).toEqual([
      { key: 'n\0color', nodeId: 'n', propKey: 'color', oldValue: 'red' },
    ]);
  });

  it('does not report a late write that stays hidden', () => {
    const before = replay(REMOVED_AND_READDED);
    const after = replay([
      ...REMOVED_AND_READDED,
      [new PropSet('n', 'color', 'green'), event(2, 'C')],
    ]);

    const diff = diffStates(before, after);

    expect(projectState(after).props).toEqual([]);
    expect(diff.props).toEqual({ set: [], removed: [] });
  });

  it('reports a write after the re-add as set from no visible value', () => {
    const before = replay(REMOVED_AND_READDED);
    const after = replay([
      ...REMOVED_AND_READDED,
      [new PropSet('n', 'color', 'blue'), event(5, 'B')],
    ]);

    const diff = diffStates(before, after);

    expect(diff.props.removed).toEqual([]);
    expect(diff.props.set).toEqual([
      { key: 'n\0color', nodeId: 'n', propKey: 'color', oldValue: undefined, newValue: 'blue' },
    ]);
  });
});
