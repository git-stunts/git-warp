/**
 * A checkpoint-tail property read must agree with the full materialized
 * state when the checkpoint holds a pending remove of the node.
 *
 * A pending remove sorts above the node's latest add, so it hides nothing
 * at the checkpoint. A later add in the tail passes it and makes it the
 * node's clear event, which hides every register written before it,
 * including the checkpoint's value. The tail alone cannot see that remove:
 * the read either takes the checkpoint's lifecycle records into account or
 * refuses the bounded read.
 *
 * Oracle: `projectState` over a WarpState replayed from every operation,
 * checkpoint and tail together.
 */

import { describe, expect, it } from 'vitest';
import { Dot, encodeDot } from '../../../../../src/domain/crdt/Dot.ts';
import QueryError from '../../../../../src/domain/errors/QueryError.ts';
import { applyPatchOp, createEmptyState } from '../../../../../src/domain/services/JoinReducer.ts';
import CheckpointTailFactReducer from '../../../../../src/domain/services/optic/CheckpointTailFactReducer.ts';
import type { CheckpointTailPatchEntry } from '../../../../../src/domain/services/optic/CheckpointTailOpticSource.ts';
import CheckpointTailReadFailure from '../../../../../src/domain/services/optic/CheckpointTailReadFailure.ts';
import { projectState } from '../../../../../src/domain/services/state/StateSerializer.ts';
import type WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';
import PropSet from '../../../../../src/domain/types/ops/PropSet.ts';
import type Op from '../../../../../src/domain/types/ops/Op.ts';
import type { PropValue } from '../../../../../src/domain/types/PropValue.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';

const NODE = 'n';
const KEY = 'k';
const TAIL_WRITER = 'writer-a';
const TAIL_SHA = 'abcdef06';
const reducer = new CheckpointTailFactReducer({ graphName: 'checkpoint-lifecycle' });

type Step = readonly [Op<string>, EventId];

function event(lamport: number, writerId: string): EventId {
  return new EventId(lamport, writerId, 'abcdef01', 0);
}

/**
 * add@1 and add@3 by two writers, the property at 2, and a remove at 5 that
 * observed only the first add. The remove sorts above the latest add, so it
 * is pending and the property is visible at the checkpoint.
 */
const CHECKPOINT_STEPS: readonly Step[] = [
  [new NodeAdd(NODE, Dot.create('A', 1)), event(1, 'A')],
  [new PropSet(NODE, KEY, 'v'), event(2, 'A')],
  [new NodeAdd(NODE, Dot.create('B', 1)), event(3, 'B')],
  [new NodeRemove(NODE, [encodeDot(Dot.create('A', 1))]), event(5, 'A')],
];

/** The tail: one add of the node at lamport 6. */
const TAIL_ADD = new NodeAdd(NODE, Dot.create(TAIL_WRITER, 9));
const TAIL_ENTRIES: readonly CheckpointTailPatchEntry[] = [{
  sha: TAIL_SHA,
  patch: new Patch({ schema: 3, writer: TAIL_WRITER, lamport: 6, context: {}, ops: [TAIL_ADD] }),
}];
const TAIL_STEPS: readonly Step[] = [[TAIL_ADD, new EventId(6, TAIL_WRITER, TAIL_SHA, 0)]];

function replay(steps: readonly Step[]): WarpState {
  const state = createEmptyState();
  for (const [op, eventId] of steps) {
    applyPatchOp(state, op, eventId);
  }
  return state;
}

function visibleProperty(state: WarpState): PropValue | undefined {
  return projectState(state).props.find((row) => row.node === NODE && row.key === KEY)?.value;
}

describe('checkpoint-tail property read with a pending remove in the checkpoint', () => {
  const checkpoint = replay(CHECKPOINT_STEPS);
  const full = replay([...CHECKPOINT_STEPS, ...TAIL_STEPS]);

  it('starts from a checkpoint that shows the property and holds the remove as pending', () => {
    expect(visibleProperty(checkpoint)).toBe('v');
    expect(checkpoint.nodePendingRemoveEvents.get(NODE)).toEqual([event(5, 'A')]);
    expect(visibleProperty(full)).toBeUndefined();
  });

  it('returns the full-state value when given the checkpoint lifecycle', () => {
    const value = reducer.reduceProperty({
      baseValue: visibleProperty(checkpoint),
      checkpointLifecycle: {
        kind: 'witnessed',
        lifecycle: checkpoint,
        baseRegisterEvent: checkpoint.getNodeProp(NODE, KEY)?.eventId ?? null,
      },
      tailEntries: TAIL_ENTRIES,
      nodeId: NODE,
      propertyKey: KEY,
    });

    expect(value).toBe(visibleProperty(full));
  });

  it('refuses the bounded read when the checkpoint lifecycle is not witnessed', () => {
    const read = (): PropValue | undefined => reducer.reduceProperty({
      baseValue: visibleProperty(checkpoint),
      checkpointLifecycle: { kind: 'unwitnessed' },
      tailEntries: TAIL_ENTRIES,
      nodeId: NODE,
      propertyKey: KEY,
    });

    expect(read).toThrow(QueryError);
    expect(read).toThrow(expect.objectContaining({
      code: 'E_OPTIC_NO_BOUNDED_BASIS',
      context: expect.objectContaining({ reason: 'tail-node-add-needs-checkpoint-lifecycle-witnesses' }),
    }));
  });

  it('reports the refusal as a node-property read failure that a new indexed basis recovers', () => {
    const refusal = new QueryError('No bounded checkpoint-tail optic basis is available.', {
      code: 'E_OPTIC_NO_BOUNDED_BASIS',
      context: { graphName: 'checkpoint-lifecycle', reason: 'tail-node-add-needs-checkpoint-lifecycle-witnesses' },
    });
    const failure = new CheckpointTailReadFailure({
      graphName: 'checkpoint-lifecycle',
      opticKind: 'node-property',
      nodeId: NODE,
      propertyKey: KEY,
    });

    expect(failure.enrich(refusal).context).toEqual(expect.objectContaining({
      cause: 'tail-node-add-needs-checkpoint-lifecycle-witnesses',
      recoveryHints: [expect.objectContaining({ operation: 'plumber.checkpoint.createIndexedBasis' })],
    }));
  });
});

describe('checkpoint-tail property read without checkpoint lifecycle witnesses', () => {
  function unwitnessedRead(
    baseValue: PropValue | undefined,
    tailEntries: readonly CheckpointTailPatchEntry[],
  ): PropValue | undefined {
    return reducer.reduceProperty({
      baseValue,
      checkpointLifecycle: { kind: 'unwitnessed' },
      tailEntries,
      nodeId: NODE,
      propertyKey: KEY,
    });
  }

  it('answers when the tail does not add the node', () => {
    expect(unwitnessedRead('v', [])).toBe('v');
  });

  it('answers when the checkpoint holds no value to hide', () => {
    expect(unwitnessedRead(undefined, TAIL_ENTRIES)).toBeUndefined();
  });

  it('answers when a tail remove and a later tail add hide the checkpoint value', () => {
    expect(unwitnessedRead('v', [
      {
        sha: 'abcdef05',
        patch: new Patch({
          schema: 3,
          writer: TAIL_WRITER,
          lamport: 5,
          context: {},
          ops: [new NodeRemove(NODE, [encodeDot(Dot.create('B', 1))])],
        }),
      },
      ...TAIL_ENTRIES,
    ])).toBeUndefined();
  });
});
