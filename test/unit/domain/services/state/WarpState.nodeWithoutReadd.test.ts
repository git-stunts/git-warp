/**
 * Node property visibility for graphs that never remove and then re-add a
 * node.
 *
 * A node property is hidden only when a remove of the node sorts between the
 * property write and the node's latest add. Writing a property before the
 * node's first add, or adding a node that is already live, removes nothing,
 * so these graphs must show the same properties and hash to the same value
 * as before node lifecycle events existed. The expected rows and hashes were
 * produced by running this file against the release that predates them.
 */

import { describe, it, expect } from 'vitest';
import { applyPatchOp, createEmptyState } from '../../../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import { computeStateHash, projectState } from '../../../../../src/domain/services/state/StateSerializer.ts';
import NodeCryptoAdapter from '../../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import PropSet from '../../../../../src/domain/types/ops/PropSet.ts';
import type WarpState from '../../../../../src/domain/services/state/WarpState.ts';
import type Op from '../../../../../src/domain/types/ops/Op.ts';

const crypto = new NodeCryptoAdapter();

/** Hashes of the two graphs below, taken at the release before this change. */
const BEFORE_ADD_HASH = 'd19569b95d66bfd33e41abc57940913599b57be37177995d87029b5fd6eb4998';
const UPSERT_HASH = 'edba904caa9d3795136b844013afa37e49b00600e1f09db858a961c0823d168e';

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

function hashOf(state: WarpState): Promise<string> {
  return computeStateHash(state, { crypto, codec: defaultCodec });
}

describe('node properties when no remove precedes the latest add', () => {
  it('shows a property set before the node is added in the same patch', async () => {
    const state = replay([
      [new PropSet('n', 'k', 'v'), event(1, 'A', 0)],
      [new NodeAdd('n', Dot.create('A', 1)), event(1, 'A', 1)],
    ]);

    expect(projectState(state).props).toEqual([{ node: 'n', key: 'k', value: 'v' }]);
    expect(await hashOf(state)).toBe(BEFORE_ADD_HASH);
  });

  it("shows another writer's property written below the node's first add", async () => {
    const state = replay([
      [new PropSet('n', 'k', 'v'), event(1, 'B')],
      [new NodeAdd('n', Dot.create('A', 1)), event(2, 'A')],
    ]);

    expect(projectState(state).props).toEqual([{ node: 'n', key: 'k', value: 'v' }]);
    expect(await hashOf(state)).toBe(BEFORE_ADD_HASH);
  });

  it('keeps every property when a live node is added again', async () => {
    const state = replay([
      [new NodeAdd('n', Dot.create('A', 1)), event(1, 'A', 0)],
      [new PropSet('n', 'k', 'v'), event(1, 'A', 1)],
      [new NodeAdd('n', Dot.create('A', 2)), event(2, 'A', 0)],
      [new PropSet('n', 'j', 'w'), event(2, 'A', 1)],
    ]);

    expect(projectState(state).props).toEqual([
      { node: 'n', key: 'j', value: 'w' },
      { node: 'n', key: 'k', value: 'v' },
    ]);
    expect(await hashOf(state)).toBe(UPSERT_HASH);
  });
});
