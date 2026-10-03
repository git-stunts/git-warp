import { expect, it } from 'vitest';
import { readCheckpointEventId } from '../../../../../src/domain/services/state/CheckpointEventIdBoundary.ts';
import LegacyEventId from '../../../../../src/domain/utils/LegacyEventId.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import { LWWRegister } from '../../../../../src/domain/crdt/LWW.ts';
import CrdtError from '../../../../../src/domain/errors/CrdtError.ts';
import WarpError from '../../../../../src/domain/errors/WarpError.ts';

it.each([-1, 0.5, Infinity, NaN, null, undefined, '7'])('refuses invalid legacy Lamport: %#', lamport => {
  expect(() => Reflect.construct(LegacyEventId, [lamport])).toThrow(CrdtError);
});

it.each([null, undefined, {}, { lamport: 7 }])('admits only historical missing metadata: %#', wire => {
  const event = readCheckpointEventId(wire, 'full-v5');
  expect(event).toBeInstanceOf(LegacyEventId);
  expect(Object.isFrozen(event)).toBe(true);
  expect(event.writerId).toBe('');
  expect(event.patchSha).toBe('0000');
  expect(event.opIndex).toBe(0);
  expect(() => readCheckpointEventId(wire, 'full-v7')).toThrow(CrdtError);
});

it.each([7, '7', [], { lamport: null }, { writerId: 7 }, { patchSha: 7 }, { opIndex: '0' }])(
  'refuses malformed transport fields instead of coercing them into legacy identity: %#', wire => {
    expect(() => Reflect.apply(readCheckpointEventId, undefined, [wire, 'full-v5'])).toThrow(CrdtError);
  },
);

it('preserves explicit upgraded legacy ordering without weakening modern admission', () => {
  const wire = { lamport: 7, writerId: '', patchSha: '0000', opIndex: 0 };
  const legacy = readCheckpointEventId(wire, 'full-v7');
  expect(legacy).toBeInstanceOf(LegacyEventId);
  expect(legacy).toEqual(wire);
  const older = new LWWRegister(new LegacyEventId(6), 'older');
  const historic = new LWWRegister(legacy, 'historic');
  const modern = new LWWRegister(new EventId(7, 'A', 'aaaa', 0), 'modern');
  for (const [left, right] of [[historic, modern], [modern, historic]]) {
    expect(LWWRegister.max(left, right)?.value).toBe('modern');
  }
  expect(LWWRegister.max(older, historic)?.value).toBe('historic');
  expect(() => new EventId(0, '', '0000', 0)).toThrow(WarpError);
});

it.each([
  { writerId: 'A', patchSha: 'aaaa', opIndex: 0 },
  { lamport: 7, patchSha: 'aaaa', opIndex: 0 },
  { lamport: 7, writerId: 'A', opIndex: 0 },
  { lamport: 7, writerId: 'A', patchSha: 'aaaa' },
])('refuses partial modern identity in either format: %#', wire => {
  for (const format of ['full-v5', 'full-v7']) {
    expect(() => readCheckpointEventId(wire, format)).toThrow(WarpError);
  }
});

it('hydrates complete modern identity', () => {
  const wire = { lamport: 7, writerId: 'A', patchSha: 'aaaa', opIndex: 0 };
  const event = readCheckpointEventId(wire, 'full-v7');
  expect(event).toBeInstanceOf(EventId);
  expect(event).toEqual(wire);
});
