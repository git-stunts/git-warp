/**
 * Where the node lifecycle family puts a tombstoned node dot. A bounded
 * read decides that a tail add of node `n` is dead when the checkpoint holds
 * a tombstone for the add's dot, so the read needs every tombstoned dot that
 * an add of `n` can carry, and nothing that grows with the whole graph:
 *
 * - The receipt lists only the tombstoned dots that no node entry holds.
 *   A causally closed checkpoint has none.
 * - A node's record lists the tombstoned dots that its own entry holds. The
 *   session trie keeps a remove that came before its add by reserving the
 *   dot under the named node (#1119), so that add can still arrive as tail.
 *
 * Oracle: the OR-set rule that a tombstoned dot is never live, and the
 * routing rule that a node's data lives in its own `life_XX` shard.
 */

import { describe, expect, it } from 'vitest';
import { NodeLifecycleReceipt } from '../../../../../src/domain/artifacts/NodeLifecycleReceipt.ts';
import { NodeLifecycleShard } from '../../../../../src/domain/artifacts/NodeLifecycleShard.ts';
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

/** The tombstoned dots of every record, keyed by node id. */
function recordTombstonesOf(state: WarpState): ReadonlyMap<string, readonly string[]> {
  const found = new Map<string, readonly string[]>();
  for (const shard of NodeLifecycleIndexBuilder.fromState(state).yieldShards()) {
    if (shard instanceof NodeLifecycleShard) {
      for (const record of shard.records) {
        found.set(record.nodeId, record.tombstonedDots);
      }
    }
  }
  return found;
}

describe('NodeLifecycleIndexBuilder tombstone placement', () => {
  it('lists in the receipt a tombstoned dot that no node entry holds', () => {
    const state = WarpState.empty();
    state.nodeAlive.remove(new Set([encodeDot(A_1)]));
    expect(receiptTombstonesOf(state)).toEqual([encodeDot(A_1)]);
  });

  it('leaves out of the receipt a tombstoned dot that a node entry holds', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('n', A_1);
    state.nodeAlive.remove(new Set([encodeDot(A_1)]));
    expect(receiptTombstonesOf(state)).toEqual([]);
  });

  it('lists in a node record the tombstoned dots that its entry holds, ascending, without live dots', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('n', B_1);
    state.nodeAlive.add('n', A_2);
    state.nodeAlive.add('live', A_1);
    state.nodeAlive.remove(new Set([encodeDot(B_1), encodeDot(A_2)]));
    expect(Object.fromEntries(recordTombstonesOf(state))).toEqual({
      n: [encodeDot(A_2), encodeDot(B_1)],
    });
  });

  it('lists a held tombstone only in the record of the node whose entry holds it', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('n', A_1);
    state.nodeAlive.add('m', B_1);
    state.nodeAlive.remove(new Set([encodeDot(A_1), encodeDot(B_1)]));
    expect(Object.fromEntries(recordTombstonesOf(state))).toEqual({
      m: [encodeDot(B_1)],
      n: [encodeDot(A_1)],
    });
  });
});
