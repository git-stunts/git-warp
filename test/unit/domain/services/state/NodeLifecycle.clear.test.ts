import { expect, it } from 'vitest';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import {
  copyNodeLifecycle, emptyNodeLifecycle, isStaleNodeRegisterIn,
  mergeNodeLifecycles, recordNodeAdd, recordNodeRemove,
} from '../../../../../src/domain/services/state/NodeLifecycle.ts';

const before = new EventId(1, 'A', 'abcdef01', 0);
const clear = new EventId(2, 'A', 'abcdef01', 0);
const after = new EventId(3, 'A', 'abcdef01', 0);

it('clears without any locally held addition and keeps a strict EventId boundary', () => {
  const state = emptyNodeLifecycle();
  recordNodeRemove(state, 'n', clear);
  recordNodeRemove(state, 'n', before);
  expect(isStaleNodeRegisterIn(state, 'n', before)).toBe(true);
  for (const value of [clear, after, null, undefined]) {
    expect(isStaleNodeRegisterIn(state, 'n', value)).toBe(false);
  }
  expect(isStaleNodeRegisterIn({}, 'n', before)).toBe(false);
  expect(isStaleNodeRegisterIn(state, 'missing', before)).toBe(false);
  for (const add of [before, after, clear]) recordNodeAdd(state, 'n', add);
  expect(state.nodeClearEvent.get('n')).toBe(clear);
  expect(state.nodeBirthEvent.get('n')).toBe(after);
  expect(state.nodePendingRemoveEvents.size).toBe(0);
});

it('normalizes prior in-memory removal evidence on either side of a join without mutating it', () => {
  const source = { nodePendingRemoveEvents: new Map([['n', [before, clear]]]) };
  for (const state of [copyNodeLifecycle(source), mergeNodeLifecycles(source, {}), mergeNodeLifecycles({}, source)]) {
    expect(state.nodeClearEvent.get('n')).toBe(clear);
    expect(state.nodePendingRemoveEvents.size).toBe(0);
  }
  expect(source.nodePendingRemoveEvents.get('n')).toEqual([before, clear]);
});
