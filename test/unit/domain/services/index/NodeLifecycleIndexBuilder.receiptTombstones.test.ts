/**
 * The node lifecycle receipt lists every tombstoned node dot of the state.
 * A bounded read uses the list to decide that a tail add is dead, and a
 * tombstoned dot is dead whether or not a node entry of the state holds it.
 *
 * Oracle: the OR-set rule that a tombstoned dot is never live.
 */

import { describe, expect, it } from 'vitest';
import { NodeLifecycleReceipt } from '../../../../../src/domain/artifacts/NodeLifecycleReceipt.ts';
import { Dot, encodeDot } from '../../../../../src/domain/crdt/Dot.ts';
import NodeLifecycleIndexBuilder from '../../../../../src/domain/services/index/NodeLifecycleIndexBuilder.ts';
import WarpState from '../../../../../src/domain/services/state/WarpState.ts';

const A_1 = new Dot('A', 1);
const A_2 = new Dot('A', 2);
const B_1 = new Dot('B', 1);

function receiptTombstonesOf(state: WarpState): readonly string[] {
  for (const shard of NodeLifecycleIndexBuilder.fromState(state).yieldShards()) {
    if (shard instanceof NodeLifecycleReceipt) {
      return shard.floatingTombstones;
    }
  }
  throw new Error('the lifecycle builder yielded no receipt');
}

describe('NodeLifecycleIndexBuilder receipt tombstones', () => {
  it('lists a tombstoned dot that no node entry holds', () => {
    const state = WarpState.empty();
    state.nodeAlive.remove(new Set([encodeDot(A_1)]));
    expect(receiptTombstonesOf(state)).toEqual([encodeDot(A_1)]);
  });

  it('lists a tombstoned dot that a node entry holds', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('n', A_1);
    state.nodeAlive.remove(new Set([encodeDot(A_1)]));
    expect([...state.nodeAlive.entryDotsIter()]).toEqual([encodeDot(A_1)]);
    expect(receiptTombstonesOf(state)).toEqual([encodeDot(A_1)]);
  });

  it('lists tombstoned dots in ascending order and leaves out live dots', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('n', B_1);
    state.nodeAlive.add('n', A_2);
    state.nodeAlive.add('live', A_1);
    state.nodeAlive.remove(new Set([encodeDot(B_1), encodeDot(A_2)]));
    expect(receiptTombstonesOf(state)).toEqual([encodeDot(A_2), encodeDot(B_1)]);
  });
});
