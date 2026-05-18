import { describe, expect, it } from 'vitest';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../../src/domain/crdt/VersionVector.ts';
import ImmutableBytes from '../../../../../src/domain/services/snapshot/ImmutableBytes.ts';
import SnapshotVersionVector from '../../../../../src/domain/services/snapshot/SnapshotVersionVector.ts';

describe('ImmutableBytes', () => {
  it('copies input and output byte arrays', () => {
    const source = new Uint8Array([1, 2, 3]);
    const value = new ImmutableBytes(source);

    source[0] = 9;
    const copy = value.toUint8Array();
    copy[1] = 8;

    expect(value.length).toBe(3);
    expect(value.at(0)).toBe(1);
    expect(value.at(1)).toBe(2);
    expect(value.at(9)).toBeUndefined();
    expect([...value]).toEqual([1, 2, 3]);
    expect([...value.values()]).toEqual([1, 2, 3]);
    expect(Object.isFrozen(value)).toBe(true);
  });

  it('returns a frozen plain array view', () => {
    const value = new ImmutableBytes(new Uint8Array([4, 5]));
    const array = value.toArray();

    expect(array).toEqual([4, 5]);
    expect(Object.isFrozen(array)).toBe(true);
  });
});

describe('SnapshotVersionVector', () => {
  it('captures an immutable point-in-time vector view', () => {
    const source = VersionVector.from(new Map([
      ['alice', 2],
      ['bob', 1],
    ]));
    const snapshot = new SnapshotVersionVector(source);

    source.set('alice', 5);

    expect(snapshot.get('alice')).toBe(2);
    expect(snapshot.get('carol')).toBeUndefined();
    expect(snapshot.has('bob')).toBe(true);
    expect(snapshot.has('carol')).toBe(false);
    expect(snapshot.size).toBe(2);
    expect([...snapshot]).toEqual([['alice', 2], ['bob', 1]]);
    expect([...snapshot.keys()]).toEqual(['alice', 'bob']);
    expect([...snapshot.values()]).toEqual([2, 1]);
    expect([...snapshot.entries()]).toEqual([['alice', 2], ['bob', 1]]);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('compares causal coverage with snapshot vectors and dots', () => {
    const snapshot = new SnapshotVersionVector(VersionVector.from(new Map([
      ['alice', 2],
      ['bob', 1],
    ])));
    const previous = new SnapshotVersionVector(VersionVector.from(new Map([
      ['alice', 1],
    ])));
    const future = new SnapshotVersionVector(VersionVector.from(new Map([
      ['alice', 3],
    ])));
    const same = new SnapshotVersionVector(VersionVector.from(new Map([
      ['alice', 2],
      ['bob', 1],
    ])));
    const differentCounter = new SnapshotVersionVector(VersionVector.from(new Map([
      ['alice', 2],
      ['bob', 2],
    ])));

    expect(snapshot.descends(previous)).toBe(true);
    expect(snapshot.descends(future)).toBe(false);
    expect(snapshot.contains(new Dot('alice', 2))).toBe(true);
    expect(snapshot.contains(new Dot('alice', 3))).toBe(false);
    expect(snapshot.equals(same)).toBe(true);
    expect(snapshot.equals(previous)).toBe(false);
    expect(snapshot.equals(differentCounter)).toBe(false);
  });
});
