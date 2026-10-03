import { expect, it } from 'vitest';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import { LWWRegister } from '../../../../src/domain/crdt/LWW.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { deserializeORSet } from '../../../../src/domain/services/state/ORSetWireBoundary.ts';
import CrdtError from '../../../../src/domain/errors/CrdtError.ts';

it.each([null, undefined, [], {}])('refuses a non-Map entry container: %#', entries => {
  expect(() => Reflect.construct(ORSet, [entries, new Set()])).toThrow(CrdtError);
});

it.each([null, undefined, [], {}])('refuses a non-Set tombstone container: %#', tombstones => {
  expect(() => Reflect.construct(ORSet, [new Map(), tombstones])).toThrow(CrdtError);
});

it.each([null, 7, {}, undefined])('refuses a non-string element: %#', element => {
  expect(() => Reflect.construct(ORSet, [new Map([[element, new Set(['A:1'])]]), new Set()])).toThrow(CrdtError);
});

it.each([null, [], {}, undefined])('refuses a non-Set entry dot collection: %#', dots => {
  expect(() => Reflect.construct(ORSet, [new Map([['n', dots]]), new Set()])).toThrow(CrdtError);
});

it.each([null, 7, 'missing', ':1', 'A:0', 'A:01', 'A:9007199254740992'])('refuses malformed dots in either collection: %#', dot => {
  expect(() => Reflect.construct(ORSet, [new Map([['n', new Set([dot])]]), new Set()])).toThrow(CrdtError);
  expect(() => Reflect.construct(ORSet, [new Map(), new Set([dot])])).toThrow(CrdtError);
});

it('owns both collection levels and floating removals without aliasing caller state', () => {
  const dots = new Set(['A:1']);
  const entries = new Map([['n', dots], ['', new Set<string>()]]);
  const tombstones = new Set(['B:1']);
  const state = new ORSet(entries, tombstones);
  dots.clear(); entries.clear(); tombstones.clear();
  expect(state.elements()).toEqual(['n']);
  expect(state.countLiveDots()).toBe(1);
  expect(state.countTombstones()).toBe(0);
  expect(state.hasEntries('')).toBe(true);
  state.add('n', new Dot('B', 1));
  expect(state.getDots('n')).toEqual(new Set(['A:1']));
  expect(state.isTombstoned('B:1')).toBe(true);
  state.remove(new Set(['A:1']));
  expect(state.contains('n')).toBe(false);
  expect(state.countLiveDots()).toBe(0);
  expect(state.countTombstones()).toBe(2);
  expect(entries.size).toBe(0);
  expect(tombstones.size).toBe(0);
  expect(dots.size).toBe(0);
});

it.each([null, undefined, 7, {}, { lamport: 1, writerId: 'A', patchSha: 'aaaa', opIndex: 0 }])('requires admitted runtime event identity: %#', eventId => {
  expect(() => Reflect.construct(LWWRegister, [eventId, 'value'])).toThrow(CrdtError);
});

it('retains admitted event and payload identity while freezing the register', () => {
  const event = new EventId(1, 'A', 'aaaa', 0);
  const payload = { nested: ['value'] };
  const register = new LWWRegister(event, payload);
  expect(register.eventId).toBe(event);
  expect(register.value).toBe(payload);
  expect(Object.isFrozen(register)).toBe(true);
});

it('requires the named wire reader to admit entry elements through the constructor', () => {
  const wire = { entries: [[7, ['A:1']]], tombstones: [] };
  expect(() => Reflect.apply(deserializeORSet, undefined, [wire])).toThrow(CrdtError);
});
