import { describe, expect, it } from 'vitest';

import { Dot } from '../../src/domain/crdt/Dot.ts';
import ORSet from '../../src/domain/crdt/ORSet.ts';
import {
  ImmutableBytes,
  SnapshotORSet,
  SnapshotVersionVector,
  SnapshotWarpState,
  createSnapshotORSet,
  createSnapshotPropValue,
  createSnapshotPropertyValues,
  createSnapshotWarpState,
} from '../../src/domain/services/ImmutableSnapshot.ts';
import { createEmptyState, encodePropKey } from '../../src/domain/services/JoinReducer.ts';
import type { SnapshotPropValue } from '../../src/domain/services/snapshot/SnapshotPropValue.ts';
import { EventId } from '../../src/domain/utils/EventId.ts';

type SnapshotEntry = {
  readonly element: string;
  readonly dots: readonly string[];
};

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function sortedStrings(values: readonly string[]): string[] {
  return [...values].sort(compareStrings);
}

function sortedEntries(entries: readonly SnapshotEntry[]): SnapshotEntry[] {
  return [...entries]
    .map((entry) => ({
      element: entry.element,
      dots: sortedStrings(entry.dots),
    }))
    .sort((left, right) => compareStrings(left.element, right.element));
}

function mutateStringArray(values: readonly string[]): void {
  try {
    Reflect.set(values, '0', 'mutated');
  } catch {
    // Frozen arrays may throw. Later assertions verify the value stayed stable.
  }
  try {
    Reflect.apply(Array.prototype.push, values, ['extra']);
  } catch {
    // Frozen arrays may throw. Later assertions verify the value stayed stable.
  }
}

function mutateSnapshotEntry(entry: SnapshotEntry): void {
  try {
    Reflect.set(entry, 'element', 'mutated-entry');
  } catch {
    // Frozen entry objects may throw. Later assertions verify stability.
  }
  mutateStringArray(entry.dots);
}

function requireImmutableBytes(value: SnapshotPropValue | undefined): ImmutableBytes {
  if (value instanceof ImmutableBytes) {
    return value;
  }
  throw new SnapshotPropValueApiModelTestError('expected ImmutableBytes');
}

function isSnapshotPropValueArray(
  value: SnapshotPropValue,
): value is readonly SnapshotPropValue[] {
  return Array.isArray(value);
}

function requireSnapshotRecord(
  value: SnapshotPropValue | undefined,
): { readonly [key: string]: SnapshotPropValue } {
  if (value === undefined || value === null) {
    throw new SnapshotPropValueApiModelTestError('expected snapshot property record');
  }
  if (isSnapshotPropValueArray(value) || value instanceof ImmutableBytes || typeof value !== 'object') {
    throw new SnapshotPropValueApiModelTestError('expected snapshot property record');
  }
  return value;
}

function requireSnapshotArray(
  value: SnapshotPropValue | undefined,
): readonly SnapshotPropValue[] {
  if (value !== undefined && isSnapshotPropValueArray(value)) {
    return value;
  }
  throw new SnapshotPropValueApiModelTestError('expected snapshot property array');
}

class SnapshotPropValueApiModelTestError extends Error {}

describe('snapshot PropValue API model', () => {
  it('projects byte values recursively into immutable public bytes', () => {
    const sourceBytes = new Uint8Array([1, 2, 3]);
    const snapshot = createSnapshotPropertyValues({
      bytes: sourceBytes,
      nested: {
        list: [sourceBytes],
      },
    });

    sourceBytes[0] = 9;

    const topLevelBytes = requireImmutableBytes(snapshot['bytes']);
    const nested = requireSnapshotRecord(snapshot['nested']);
    const list = requireSnapshotArray(nested['list']);
    const nestedBytes = requireImmutableBytes(list[0]);
    const mutableCopy = topLevelBytes.toUint8Array();
    mutableCopy[1] = 9;

    expect(topLevelBytes.toArray()).toEqual([1, 2, 3]);
    expect(nestedBytes.toArray()).toEqual([1, 2, 3]);
    expect(Object.isFrozen(list)).toBe(true);
    expect(Object.isFrozen(nested)).toBe(true);
  });

  it('creates SnapshotWarpState with read-side wrappers and immutable byte properties', () => {
    const state = createEmptyState();
    state.nodeAlive.add('node-a', Dot.create('writer-a', 1));
    state.mutatePropLWW(
      encodePropKey('node-a', 'bytes'),
      new EventId(1, 'writer-a', 'aabbccdd', 0),
      new Uint8Array([4, 5, 6]),
    );

    const snapshot = createSnapshotWarpState(state);
    const prop = snapshot.prop.get(encodePropKey('node-a', 'bytes'));

    expect(snapshot).toBeInstanceOf(SnapshotWarpState);
    expect(snapshot.nodeAlive).toBeInstanceOf(SnapshotORSet);
    expect(snapshot.observedFrontier).toBeInstanceOf(SnapshotVersionVector);
    expect(requireImmutableBytes(prop?.value).toArray()).toEqual([4, 5, 6]);
    const setMethod = Reflect.get(snapshot.prop, 'set');
    expect(() => {
      Reflect.apply(setMethod, snapshot.prop, ['intruder', prop]);
    }).toThrow(/read-only/u);
  });

  it('rejects unsupported snapshot sources at runtime', () => {
    expect(() => Reflect.apply(createSnapshotWarpState, null, [ORSet.empty()])).toThrow(
      /unsupported snapshot source: expected WarpState/u,
    );
  });

  it('keeps SnapshotORSet array returns frozen or defensive', () => {
    const source = ORSet.empty();
    source.add('node-a', new Dot('writer-a', 1));
    source.add('node-b', new Dot('writer-a', 2));

    const snapshot = createSnapshotORSet(source);
    const elements = snapshot.elements();
    const dots = snapshot.getDots('node-a');
    const entryDots = snapshot.entryDots();
    const tombstones = snapshot.tombstones();
    const entries = snapshot.entries();
    const nestedEntryDots = entries[0]?.dots;
    const firstEntry = entries[0];

    mutateStringArray(elements);
    mutateStringArray(dots);
    mutateStringArray(entryDots);
    mutateStringArray(tombstones);
    if (nestedEntryDots !== undefined) {
      mutateStringArray(nestedEntryDots);
    }
    if (firstEntry !== undefined) {
      mutateSnapshotEntry(firstEntry);
    }

    expect(sortedStrings(snapshot.elements())).toEqual(['node-a', 'node-b']);
    expect(sortedStrings(snapshot.getDots('node-a'))).toEqual(['writer-a:1']);
    expect(sortedStrings(snapshot.entryDots())).toEqual(['writer-a:1', 'writer-a:2']);
    expect(sortedStrings(snapshot.tombstones())).toEqual([]);
    expect(sortedEntries(snapshot.entries())).toEqual([
      { element: 'node-a', dots: ['writer-a:1'] },
      { element: 'node-b', dots: ['writer-a:2'] },
    ]);
  });

  it('preserves primitive public property values without wrapper ceremony', () => {
    expect(createSnapshotPropValue('ready')).toBe('ready');
    expect(createSnapshotPropValue(3)).toBe(3);
    expect(createSnapshotPropValue(false)).toBe(false);
    expect(createSnapshotPropValue(null)).toBeNull();
  });
});
