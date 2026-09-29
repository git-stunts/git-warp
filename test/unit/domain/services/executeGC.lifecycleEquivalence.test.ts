import { expect, it } from 'vitest';
import executeGC from '../../../../src/domain/services/executeGC.ts';
import { projectState } from '../../../../src/domain/services/state/StateSerializer.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import { recordNodeAdd, recordNodeRemove } from '../../../../src/domain/services/state/NodeLifecycle.ts';
import { encodePropKey, encodeEdgeKey, encodeEdgePropKey } from '../../../../src/domain/services/KeyCodec.ts';

function event(lamport: number): EventId { return new EventId(lamport, 'A', 'abcdef01', 0); }

it('preserves a post-removal node write through GC and a later add', () => {
  const state = WarpState.empty();
  const dot = new Dot('A', 1);
  state.nodeAlive.add('n', dot);
  recordNodeAdd(state, 'n', event(1));
  state.nodeAlive.remove(new Set([Dot.encode(dot)]));
  recordNodeRemove(state, 'n', event(2));
  state.mutatePropLWW(encodePropKey('n', 'k'), event(3), 'survives');
  const swept = state.clone();
  executeGC(swept, VersionVector.from({ A: 1 }));
  for (const replica of [state, swept]) {
    replica.nodeAlive.add('n', new Dot('B', 1));
    recordNodeAdd(replica, 'n', event(4));
  }
  expect(projectState(swept)).toEqual(projectState(state));
  expect(swept.getNodeProp('n', 'k')?.value).toBe('survives');
});

it('preserves lifecycle evidence against delayed edge registers after compaction', () => {
  const state = WarpState.empty();
  state.nodeAlive.add('n', new Dot('N', 1));
  state.nodeAlive.add('m', new Dot('N', 2));
  const key = encodeEdgeKey('n', 'm', 'e');
  const dot = new Dot('A', 1);
  state.edgeAlive.add(key, dot);
  state.edgeBirthEvent.set(key, event(5));
  state.edgeAlive.remove(new Set([Dot.encode(dot)]));
  const swept = state.clone();
  executeGC(swept, VersionVector.from({ A: 1 }));
  const delayed = WarpState.empty();
  delayed.edgeAlive.add(key, new Dot('B', 1));
  delayed.edgeBirthEvent.set(key, event(2));
  delayed.mutatePropLWW(encodeEdgePropKey('n', 'm', 'e', 'k'), event(3), 'old');
  expect(swept.join(delayed).attachmentRecords()).toEqual(state.join(delayed).attachmentRecords());
});

it('keeps pruned node properties invisible after re-add and merge with an unswept replica', () => {
  const state = WarpState.empty();
  const dot = new Dot('A', 1);
  state.nodeAlive.add('n', dot);
  state.mutatePropLWW(encodePropKey('n', 'k'), event(1), 'old');
  recordNodeRemove(state, 'n', event(2));
  recordNodeAdd(state, 'n', event(3));
  recordNodeRemove(state, 'n', event(4));
  state.nodeAlive.remove(new Set([Dot.encode(dot)]));
  const swept = state.clone();
  expect(executeGC(swept, VersionVector.from({ A: 1 })).propertiesPruned).toBe(1);
  const readd = WarpState.empty();
  readd.nodeAlive.add('n', new Dot('B', 1));
  recordNodeAdd(readd, 'n', event(5));
  expect(projectState(swept.join(readd))).toEqual(projectState(state.join(readd)));
  expect(swept.join(state).join(readd).attachmentRecords()).toEqual([]);
});
