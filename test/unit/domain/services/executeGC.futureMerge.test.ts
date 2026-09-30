import { expect, it } from 'vitest';
import executeGC from '../../../../src/domain/services/executeGC.ts';
import { applyPatchOp, createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import { computeStateHash, projectState } from '../../../../src/domain/services/state/StateSerializer.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';
import type Op from '../../../../src/domain/types/ops/Op.ts';
import type WarpState from '../../../../src/domain/services/state/WarpState.ts';
import { decodeCanonicalWarpFullState, encodeWarpFullState } from '../../../../src/infrastructure/adapters/WarpStateCborCodec.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';

const crypto = new NodeCryptoAdapter();
function event(lamport: number, writer = 'A'): EventId { return new EventId(lamport, writer, 'abcdef01', 0); }
const steps: readonly (readonly [Op, EventId])[] = [
  [new NodeAdd('n', new Dot('B', 1)), event(1, 'B')],
  [new NodeRemove('n', [Dot.encode(new Dot('A', 1))]), event(4)],
  [new PropSet('n', 'description', 'earlier-unobserved'), event(3, 'B')],
  [new PropSet('n', 'description', 'later-unobserved'), event(5, 'B')],
];

function partition(mask: number): WarpState {
  const state = createEmptyState();
  applyPatchOp(state, new NodeAdd('n', new Dot('A', 1)), event(1));
  applyPatchOp(state, new PropSet('n', 'k', 'old'), event(2));
  steps.forEach(([op, id], index) => {
    if ((mask & (1 << index)) !== 0) applyPatchOp(state, op, id);
  });
  return state;
}

async function expectSameReading(left: WarpState, right: WarpState): Promise<void> {
  expect(projectState(left)).toEqual(projectState(right));
  expect(left.attachmentRecords()).toEqual(right.attachmentRecords());
  expect(await computeStateHash(left, { crypto, codec })).toBe(await computeStateHash(right, { crypto, codec }));
}

it('preserves observations through GC, checkpoint round trips, every partition join and later operations', async () => {
  // An applied frontier is not a retirement certificate for removed additions.
  for (let leftMask = 0; leftMask < 16; leftMask++) {
    const original = partition(leftMask);
    const collected = original.clone();
    executeGC(collected, VersionVector.from({ A: 10, B: 10, C: 10 }));
    const restored = decodeCanonicalWarpFullState(encodeWarpFullState(collected, codec), codec);
    for (let rightMask = 0; rightMask < 16; rightMask++) {
      const later = partition(rightMask);
      const expected = original.join(later);
      const actual = restored.join(later);
      executeGC(actual, VersionVector.from({ A: 10, B: 10, C: 10 }));
      await expectSameReading(actual, expected);
      for (const state of [actual, expected]) {
        applyPatchOp(state, new NodeAdd('n', new Dot('C', 1)), event(6, 'C'));
        applyPatchOp(state, new PropSet('n', 'fresh', 'new'), event(7, 'C'));
      }
      await expectSameReading(actual, expected);
      expect([...actual.allPropEntries()].every(([key, register]) =>
        !key.startsWith('n\0') || !actual.isStaleNodeRegister('n', register))).toBe(true);
    }
  }
});

it('retains removed edge evidence while allowing an unobserved concurrent addition', async () => {
  const original = createEmptyState();
  const edge = 'a\0b\0rel';
  original.nodeAlive.add('a', new Dot('A', 1));
  original.nodeAlive.add('b', new Dot('A', 2));
  original.edgeAlive.add(edge, new Dot('A', 3));
  const stale = original.clone();
  original.edgeAlive.remove(new Set([Dot.encode(new Dot('A', 3))]));
  original.edgeRemoveEvent.set(edge, event(4));
  const collected = original.clone();
  expect(executeGC(collected, VersionVector.from({ A: 10 })).tombstonesRemoved).toBe(0);
  expect(collected.join(stale).edgeAlive.contains(edge)).toBe(false);
  stale.edgeAlive.add(edge, new Dot('B', 1));
  expect(collected.join(stale).edgeAlive.contains(edge)).toBe(true);
  await expectSameReading(collected.join(stale), original.join(stale));
});
