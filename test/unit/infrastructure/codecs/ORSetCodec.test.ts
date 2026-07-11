import { describe, expect, it } from 'vitest';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import { deserializeORSet, serializeORSet } from '../../../../src/infrastructure/codecs/ORSetCodec.ts';

describe('ORSetCodec', () => {
  it('serializes empty set', () => {
    const set = ORSet.empty();
    const serialized = serializeORSet(set);

    expect(serialized).toEqual({
      entries: [],
      tombstones: [],
    });
  });

  it('serializes set with entries', () => {
    const set = ORSet.empty();
    const dot = Dot.create('writer1', 1);

    set.add('element1', dot);
    const serialized = serializeORSet(set);

    expect(serialized.entries).toEqual([['element1', ['writer1:1']]]);
    expect(serialized.tombstones).toEqual([]);
  });

  it('serializes set with tombstones', () => {
    const set = ORSet.empty();
    const dot = Dot.create('writer1', 1);

    set.add('element1', dot);
    set.remove(new Set([encodeDot(dot)]));
    const serialized = serializeORSet(set);

    expect(serialized.tombstones).toEqual(['writer1:1']);
  });

  it('sorts entries by element', () => {
    const set = ORSet.empty();
    const dot1 = Dot.create('writer1', 1);
    const dot2 = Dot.create('writer1', 2);
    const dot3 = Dot.create('writer1', 3);

    set.add('c', dot1);
    set.add('a', dot2);
    set.add('b', dot3);

    const serialized = serializeORSet(set);

    const e0 = serialized.entries[0];
    const e1 = serialized.entries[1];
    const e2 = serialized.entries[2];
    if (e0 === undefined || e1 === undefined || e2 === undefined) {
      throw new Error('missing serialized entries');
    }
    expect(e0[0]).toBe('a');
    expect(e1[0]).toBe('b');
    expect(e2[0]).toBe('c');
  });

  it('sorts dots within entries', () => {
    const set = ORSet.empty();
    const dot1 = Dot.create('writer2', 1);
    const dot2 = Dot.create('writer1', 1);

    set.add('element1', dot1);
    set.add('element1', dot2);

    const serialized = serializeORSet(set);

    const entry0 = serialized.entries[0];
    if (entry0 === undefined) {
      throw new Error('missing serialized entry');
    }
    expect(entry0[1]).toEqual(['writer1:1', 'writer2:1']);
  });

  it('sorts tombstones', () => {
    const set = ORSet.empty();
    const dot1 = Dot.create('writer2', 1);
    const dot2 = Dot.create('writer1', 1);

    set.remove(new Set([encodeDot(dot1), encodeDot(dot2)]));

    const serialized = serializeORSet(set);

    expect(serialized.tombstones).toEqual(['writer1:1', 'writer2:1']);
  });

  it('deserializes back to equivalent set', () => {
    const original = ORSet.empty();
    const dot1 = Dot.create('writer1', 1);
    const dot2 = Dot.create('writer2', 1);

    original.add('element1', dot1);
    original.add('element2', dot2);
    original.remove(new Set([encodeDot(dot1)]));

    const serialized = serializeORSet(original);
    const deserialized = deserializeORSet(serialized);

    expect(deserialized.contains('element1')).toBe(false);
    expect(deserialized.contains('element2')).toBe(true);
    expect(deserialized.tombstones.has(encodeDot(dot1))).toBe(true);
  });

  it('deserializes empty object gracefully', () => {
    const deserialized = deserializeORSet({});

    expect(deserialized.entries.size).toBe(0);
    expect(deserialized.tombstones.size).toBe(0);
  });

  it('round-trips without changing serialized structure', () => {
    const original = ORSet.empty();
    const dot1 = Dot.create('alice', 1);
    const dot2 = Dot.create('alice', 2);
    const dot3 = Dot.create('bob', 1);

    original.add('x', dot1);
    original.add('x', dot2);
    original.add('y', dot3);
    original.remove(new Set([encodeDot(dot1)]));

    const serialized = serializeORSet(original);
    const deserialized = deserializeORSet(serialized);
    const reserialized = serializeORSet(deserialized);

    expect(reserialized).toEqual(serialized);
  });
});
