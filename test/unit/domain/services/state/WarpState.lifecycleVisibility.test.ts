/**
 * Property visibility across an element's lifecycle.
 *
 * A property register written before its owner's latest add, or before its
 * owner's latest remove, is stale: no replica shows it, whatever order the
 * operations arrive in, and it stays hidden after any later operation. That
 * is what lets garbage collection delete stale registers without changing
 * what any replica shows.
 */

import { describe, it, expect } from 'vitest';
import { applyPatchOp, createEmptyState } from '../../../../../src/domain/services/JoinReducer.ts';
import { Dot, encodeDot } from '../../../../../src/domain/crdt/Dot.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import { computeStateHash, projectState } from '../../../../../src/domain/services/state/StateSerializer.ts';
import NodeCryptoAdapter from '../../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';
import PropSet from '../../../../../src/domain/types/ops/PropSet.ts';
import EdgeAdd from '../../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../../../src/domain/types/ops/EdgeRemove.ts';
import EdgePropSet from '../../../../../src/domain/types/ops/EdgePropSet.ts';
import type WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import type Op from '../../../../../src/domain/types/ops/Op.ts';

const crypto = new NodeCryptoAdapter();

type Step = readonly [Op<string>, EventId];

function event(lamport: number, writerId: string, opIndex = 0): EventId {
  return new EventId(lamport, writerId, 'abcdef01', opIndex);
}

function replay(steps: readonly Step[]): WarpState {
  const state = createEmptyState();
  for (const [op, eventId] of steps) {
    applyPatchOp(state, op, eventId);
  }
  return state;
}

/** Visible node and edge properties as plain comparable rows. */
function visibleAttachments(state: WarpState): string[] {
  return state.attachmentRecords().map((record) =>
    `${record.owner.id.toString()}|${record.key.toString()}|${String(record.value)}`);
}

/** Every ordering of the given steps. */
function permutations(steps: readonly Step[]): Step[][] {
  if (steps.length <= 1) {
    return [[...steps]];
  }
  const result: Step[][] = [];
  steps.forEach((step, index) => {
    const rest = [...steps.slice(0, index), ...steps.slice(index + 1)];
    for (const tail of permutations(rest)) {
      result.push([step, ...tail]);
    }
  });
  return result;
}

function hashOf(state: WarpState): Promise<string> {
  return computeStateHash(state, { crypto, codec: defaultCodec });
}

describe('property visibility across remove and re-add', () => {
  it('hides a node property written before the node was removed and added again', () => {
    const state = replay([
      [new NodeAdd('n', Dot.create('A', 1)), event(1, 'A')],
      [new PropSet('n', 'color', 'red'), event(2, 'A')],
      [new NodeRemove('n', [encodeDot(Dot.create('A', 1))]), event(3, 'A')],
      [new NodeAdd('n', Dot.create('B', 1)), event(4, 'B')],
    ]);

    expect(projectState(state)).toEqual({ nodes: ['n'], edges: [], props: [] });
    expect(visibleAttachments(state)).toEqual([]);
  });

  it('shows a node property written after the re-add', () => {
    const state = replay([
      [new NodeAdd('n', Dot.create('A', 1)), event(1, 'A')],
      [new PropSet('n', 'color', 'red'), event(2, 'A')],
      [new NodeRemove('n', [encodeDot(Dot.create('A', 1))]), event(3, 'A')],
      [new NodeAdd('n', Dot.create('B', 1)), event(4, 'B')],
      [new PropSet('n', 'color', 'blue'), event(5, 'B')],
    ]);

    expect(projectState(state).props).toEqual([{ node: 'n', key: 'color', value: 'blue' }]);
    expect(visibleAttachments(state)).toEqual(['n|color|blue']);
  });

  it('hides an edge property whatever order a concurrent lower re-add arrives in', () => {
    const history: Step[] = [
      [new NodeAdd('x', Dot.create('A', 1)), event(1, 'A', 0)],
      [new NodeAdd('y', Dot.create('A', 2)), event(1, 'A', 1)],
      [new EdgeAdd({ from: 'x', to: 'y', label: 'rel', dot: Dot.create('A', 3) }), event(1, 'A', 2)],
      [new EdgePropSet({ from: 'x', to: 'y', label: 'rel', key: 'weight', value: 'heavy' }), event(2, 'A')],
      [new EdgeRemove({ from: 'x', to: 'y', label: 'rel', observedDots: [encodeDot(Dot.create('A', 3))] }), event(3, 'A')],
    ];
    // B added the same edge before it saw A's property or removal, so its
    // event id sorts below both.
    const concurrentAdd: Step = [
      new EdgeAdd({ from: 'x', to: 'y', label: 'rel', dot: Dot.create('B', 1) }),
      event(1, 'B'),
    ];
    const tail = history.slice(3);

    const outcomes = permutations([...tail, concurrentAdd]).map((order) =>
      visibleAttachments(replay([...history.slice(0, 3), ...order])));

    expect(outcomes).toHaveLength(6);
    for (const outcome of outcomes) {
      expect(outcome).toEqual([]);
    }
  });

  it('hides a node property whatever order a concurrent lower re-add arrives in', async () => {
    const add: Step = [new NodeAdd('n', Dot.create('A', 1)), event(1, 'A')];
    const set: Step = [new PropSet('n', 'color', 'red'), event(2, 'A')];
    const remove: Step = [new NodeRemove('n', [encodeDot(Dot.create('A', 1))]), event(3, 'A')];
    const concurrentAdd: Step = [new NodeAdd('n', Dot.create('B', 1)), event(1, 'B')];

    const states = permutations([set, remove, concurrentAdd]).map((order) => replay([add, ...order]));
    const hashes = new Set(await Promise.all(states.map(hashOf)));

    for (const state of states) {
      expect(projectState(state)).toEqual({ nodes: ['n'], edges: [], props: [] });
    }
    expect(hashes.size).toBe(1);
  });
});

describe('state hash for graphs that never re-add an element', () => {
  it('matches the hash pinned before lifecycle visibility existed', async () => {
    const state = replay([
      [new NodeAdd('a', Dot.create('A', 1)), event(1, 'A', 0)],
      [new NodeAdd('b', Dot.create('A', 2)), event(1, 'A', 1)],
      [new PropSet('a', 'name', 'alpha'), event(1, 'A', 2)],
      [new PropSet('b', 'name', 'beta'), event(1, 'A', 3)],
      [new NodeAdd('c', Dot.create('B', 1)), event(2, 'B', 0)],
      [new PropSet('c', 'name', 'gamma'), event(2, 'B', 1)],
      [new PropSet('a', 'name', 'alpha-2'), event(2, 'B', 2)],
      [new EdgeAdd({ from: 'a', to: 'b', label: 'knows', dot: Dot.create('A', 3) }), event(3, 'A', 0)],
      [new EdgePropSet({ from: 'a', to: 'b', label: 'knows', key: 'since', value: 2020 }), event(3, 'A', 1)],
      [new EdgeAdd({ from: 'b', to: 'c', label: 'knows', dot: Dot.create('B', 2) }), event(3, 'B', 0)],
      [new PropSet('b', 'rank', 7), event(4, 'A', 0)],
      [new EdgeRemove({ from: 'b', to: 'c', label: 'knows', observedDots: [encodeDot(Dot.create('B', 2))] }), event(5, 'B', 0)],
      [new NodeRemove('c', [encodeDot(Dot.create('B', 1))]), event(5, 'B', 1)],
      [new PropSet('a', 'name', 'alpha-3'), event(6, 'A', 0)],
    ]);

    expect(projectState(state)).toEqual({
      nodes: ['a', 'b'],
      edges: [{ from: 'a', to: 'b', label: 'knows' }],
      props: [
        { node: 'a', key: 'name', value: 'alpha-3' },
        { node: 'b', key: 'name', value: 'beta' },
        { node: 'b', key: 'rank', value: 7 },
      ],
    });
    expect(await hashOf(state)).toBe('85fead1a5ae721e9625e6b772f4a82722c04c9d22435c7dd90b00f4287da92c5');
  });
});
