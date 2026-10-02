import { describe, expect, it } from 'vitest';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';

describe('VersionVector construction establishes causal invariants', () => {
  it.each([undefined, null, [], {}, 0])('refuses a non-Map input %s at construction', input => {
    // @ts-expect-error JavaScript callers can bypass the declared constructor input.
    expect(() => new VersionVector(input)).toThrow(expect.objectContaining({ code: 'E_CRDT_INVALID_ENTRIES' }));
  });

  it('refuses an omitted input at construction', () => {
    // @ts-expect-error Exercise the missing JavaScript argument boundary.
    expect(() => new VersionVector()).toThrow(expect.objectContaining({ code: 'E_CRDT_INVALID_ENTRIES' }));
  });

  it('validates writer identities before admitting a vector', () => {
    expect(() => new VersionVector(new Map([['', 1]])))
      .toThrow(expect.objectContaining({ code: 'E_CRDT_INVALID_WRITER_ID' }));
    // @ts-expect-error Exercise a non-string writer from a JavaScript caller.
    expect(() => new VersionVector(new Map([[1, 1]])))
      .toThrow(expect.objectContaining({ code: 'E_CRDT_INVALID_WRITER_ID' }));
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('refuses invalid counter %s', counter => {
    expect(() => new VersionVector(new Map([['alice', counter]])))
      .toThrow(expect.objectContaining({ code: 'E_CRDT_INVALID_COUNTER' }));
  });

  it('refuses a string counter', () => {
    // @ts-expect-error Exercise the JavaScript scalar boundary without a trust cast.
    expect(() => new VersionVector(new Map([['alice', '1']])))
      .toThrow(expect.objectContaining({ code: 'E_CRDT_INVALID_COUNTER' }));
  });

  it('isolates both directions of caller-owned Map mutation', () => {
    const entries = new Map([['alice', 2]]);
    const vector = new VersionVector(entries);
    entries.set('alice', 99);
    entries.set('bob', -1);
    expect([...vector]).toEqual([['alice', 2]]);
    expect([...vector.keys()]).toEqual(['alice']);
    vector.set('carol', 3);
    expect(entries.has('carol')).toBe(false);
    entries.clear();
    expect([...vector]).toEqual([['alice', 2], ['carol', 3]]);
  });

  it('elides zero counters consistently with from and set', () => {
    const entries = new Map([['alice', 0], ['bob', 2]]);
    const vector = new VersionVector(entries);
    expect([...vector]).toEqual([['bob', 2]]);
    expect(vector.equals(VersionVector.from(entries))).toBe(true);
    expect(entries.has('alice')).toBe(true);
    vector.set('bob', 0);
    expect(vector.size).toBe(0);
  });

  it('clones vector inputs without sharing future mutations', () => {
    const original = new VersionVector(new Map([['alice', 2]]));
    const copy = VersionVector.from(original);
    copy.increment('alice');
    expect(original.get('alice')).toBe(2);
    expect(copy.get('alice')).toBe(3);
  });

  it('keeps frozen vectors isolated from both source mutation and mutation methods', () => {
    const entries = new Map([['alice', 2]]);
    const vector = new VersionVector(entries);
    Object.freeze(vector);
    entries.clear();
    expect(() => vector.set('alice', 3)).toThrow(expect.objectContaining({ code: 'E_CRDT_FROZEN_MUTATION' }));
    expect(() => vector.increment('alice')).toThrow(expect.objectContaining({ code: 'E_CRDT_FROZEN_MUTATION' }));
    expect([...vector]).toEqual([['alice', 2]]);
  });

  it('preserves join, dominance and independent operands across deterministic permutations', () => {
    const alice = new VersionVector(new Map([['alice', 2], ['bob', 1]]));
    const bob = new VersionVector(new Map([['alice', 1], ['carol', 3]]));
    const carol = new VersionVector(new Map([['bob', 4]]));
    const expected = new Map([['alice', 2], ['bob', 4], ['carol', 3]]);
    for (const joined of [alice.merge(bob).merge(carol), carol.merge(alice.merge(bob)), bob.merge(carol).merge(alice)]) {
      expect(new Map(joined)).toEqual(expected);
      expect(joined.descends(alice)).toBe(true);
      expect(alice.descends(joined)).toBe(false);
      expect(joined.merge(joined).equals(joined)).toBe(true);
    }
    expect([...alice]).toEqual([['alice', 2], ['bob', 1]]);
    expect([...bob]).toEqual([['alice', 1], ['carol', 3]]);
    expect([...carol]).toEqual([['bob', 4]]);
  });
});
