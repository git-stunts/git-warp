import ORSet from '../../domain/crdt/ORSet.ts';
import { Dot } from '../../domain/crdt/Dot.ts';

export interface SerializedORSet {
  entries: Array<[string, string[]]>;
  tombstones: string[];
}

export interface ORSetWire {
  entries?: Array<[string, string[]]>;
  tombstones?: string[];
}

export function serializeORSet(set: ORSet): SerializedORSet {
  return {
    entries: serializeEntries(set.entriesIter()),
    tombstones: sortEncodedDots(set.tombstonesIter()),
  };
}

export function deserializeORSet(obj: ORSetWire): ORSet {
  const set = ORSet.empty();
  deserializeEntriesInto(obj.entries, set.entries);
  deserializeTombstonesInto(obj.tombstones, set.tombstones);
  return set;
}

function sortEncodedDots(encodedDots: Iterable<string>): string[] {
  const pairs: Array<{ encoded: string; decoded: Dot }> = [];
  for (const encoded of encodedDots) {
    pairs.push({ encoded, decoded: Dot.decode(encoded) });
  }
  pairs.sort((a, b) => Dot.compare(a.decoded, b.decoded));
  return pairs.map((pair) => pair.encoded);
}

function serializeEntries(entries: Iterable<[string, ReadonlySet<string>]>): Array<[string, string[]]> {
  const result: Array<[string, string[]]> = [];
  for (const [element, dots] of entries) {
    result.push([element, sortEncodedDots(dots)]);
  }
  result.sort((left, right) => (
    left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0
  ));
  return result;
}

function deserializeEntriesInto(
  entries: Array<[string, string[]]> | undefined,
  target: Map<string, Set<string>>,
): void {
  if (!Array.isArray(entries)) {
    return;
  }
  for (const [element, dots] of entries) {
    if (Array.isArray(dots)) {
      target.set(element, new Set(dots));
    }
  }
}

function deserializeTombstonesInto(
  tombstones: string[] | undefined,
  target: Set<string>,
): void {
  if (!Array.isArray(tombstones)) {
    return;
  }
  for (const dot of tombstones) {
    target.add(dot);
  }
}
