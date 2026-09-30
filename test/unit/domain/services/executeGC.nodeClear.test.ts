import { expect, it } from 'vitest';
import executeGC from '../../../../src/domain/services/executeGC.ts';
import { applyPatchOp, createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import { projectState } from '../../../../src/domain/services/state/StateSerializer.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';

function event(lamport: number, writer = 'A', index = 0): EventId {
  return new EventId(lamport, writer, 'abcdef01', index);
}

function removedNode() {
  const state = createEmptyState();
  applyPatchOp(state, new NodeAdd('n', new Dot('A', 1)), event(1));
  applyPatchOp(state, new PropSet('n', 'k', 'old'), event(2));
  applyPatchOp(state, new NodeRemove('n', [Dot.encode(new Dot('A', 1))]), event(4));
  return state;
}

it('reclaims 168 registers from 25 generations without changing visible state', () => {
  const state = createEmptyState();
  const unswept = createEmptyState();
  let reclaimed = 0;
  for (let generation = 1; generation <= 25; generation++) {
    for (const replica of [state, unswept]) {
      const node = `anchor:${generation}`;
      applyPatchOp(replica, new NodeAdd(node, new Dot('A', generation)), event(generation * 2));
      for (let key = 1; key <= 7; key++) {
        applyPatchOp(replica, new PropSet(node, `p:${key}`, 'payload'), event(generation * 2, 'A', key));
      }
      if (generation > 1) {
        const remove = new NodeRemove(`anchor:${generation - 1}`, [Dot.encode(new Dot('A', generation - 1))]);
        applyPatchOp(replica, remove, event(generation * 2 + 1));
      }
    }
    reclaimed += executeGC(state, VersionVector.from({ A: generation })).propertiesPruned;
    expect(projectState(state)).toEqual(projectState(unswept));
  }
  expect([...state.allPropEntries()]).toHaveLength(7);
  expect(reclaimed).toBe(168);
  expect(state.nodeClearEvent.size).toBe(24);
});

it('reclaims cleared properties of a node kept alive by a concurrent add', () => {
  const state = removedNode();
  applyPatchOp(state, new NodeAdd('n', new Dot('B', 1)), event(1, 'B'));
  const unswept = state.clone();
  expect(executeGC(state, VersionVector.empty()).propertiesPruned).toBe(1);
  expect(state.nodeAlive.contains('n')).toBe(true);
  expect(projectState(state)).toEqual(projectState(unswept));
  expect(state.attachmentRecords()).toEqual([]);
});

it('reclaims delayed stale registers after original membership records have gone', () => {
  const unswept = removedNode();
  const swept = unswept.clone();
  // Simulate a legacy state that already retired its owner records.
  swept.nodeAlive.compact(VersionVector.from({ A: 1 }));
  executeGC(swept, VersionVector.from({ A: 1 }));
  const delayed = createEmptyState();
  applyPatchOp(delayed, new PropSet('n', 'k', 'old'), event(2));
  for (let delivery = 0; delivery < 3; delivery++) {
    const merged = swept.join(delayed);
    expect(merged.nodeAlive.hasEntries('n')).toBe(false);
    expect(executeGC(merged, VersionVector.empty()).propertiesPruned).toBe(1);
    expect([...merged.allPropEntries()]).toHaveLength(0);
    expect(projectState(merged)).toEqual(projectState(unswept.join(delayed)));
  }
});

it('preserves later-ordered writes and rejects earlier unobserved writes across future joins', () => {
  const unswept = removedNode();
  const swept = unswept.clone();
  executeGC(swept, VersionVector.from({ A: 1 }));
  for (const lamport of [3, 5]) {
    const concurrent = createEmptyState();
    applyPatchOp(concurrent, new NodeAdd('n', new Dot('B', 1)), event(1, 'B'));
    applyPatchOp(concurrent, new PropSet('n', 'description', 'concurrent'), event(lamport, 'B'));
    const merged = swept.join(concurrent);
    executeGC(merged, VersionVector.empty());
    expect(projectState(merged)).toEqual(projectState(unswept.join(concurrent)));
    expect([...merged.allPropEntries()]).toHaveLength(lamport < 4 ? 0 : 1);
    expect(merged.attachmentRecords()).toHaveLength(lamport < 4 ? 0 : 1);
  }
});

it('does not clear properties for a removal with no observed dots', () => {
  const state = createEmptyState();
  applyPatchOp(state, new PropSet('n', 'k', 'retained'), event(1));
  applyPatchOp(state, new NodeRemove('n', []), event(2));
  applyPatchOp(state, new NodeAdd('n', new Dot('B', 1)), event(3, 'B'));
  expect(executeGC(state, VersionVector.empty()).propertiesPruned).toBe(0);
  expect(state.getNodeProp('n', 'k')?.value).toBe('retained');
});
