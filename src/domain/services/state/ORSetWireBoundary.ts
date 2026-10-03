import ORSet from '../../crdt/ORSet.ts';
import { Dot } from '../../crdt/Dot.ts';
import CrdtError from '../../errors/CrdtError.ts';
import { compareStrings } from '../../utils/StringComparison.ts';

export type SerializedORSet = {
  entries: Array<[string, string[]]>;
  tombstones: string[];
};

export type ORSetWire = {
  entries?: Array<[string, string[]]>;
  tombstones?: string[];
};

export function serializeORSet(set: ORSet): SerializedORSet {
  return {
    entries: serializeEntries(set.entriesIter()),
    tombstones: sortEncodedDots(set.tombstonesIter()),
  };
}
export function deserializeORSet(wire: ORSetWire): ORSet {
  const entries = new Map<string, Set<string>>();
  const tombstones = new Set<string>();
  deserializeEntriesInto(wire.entries, entries);
  deserializeTombstonesInto(wire.tombstones, tombstones);
  return new ORSet(entries, tombstones);
}

function sortEncodedDots(encodedDots: Iterable<string>): string[] {
  const pairs: Array<{ encoded: string; decoded: Dot }> = [];
  for (const encoded of encodedDots) {
    pairs.push({ encoded, decoded: Dot.decode(encoded) });
  }
  pairs.sort((left, right) => Dot.compare(left.decoded, right.decoded));
  return pairs.map((pair) => pair.encoded);
}

function serializeEntries(
  entries: Iterable<[string, ReadonlySet<string>]>,
): Array<[string, string[]]> {
  const result: Array<[string, string[]]> = [];
  for (const [element, dots] of entries) {
    result.push([element, sortEncodedDots(dots)]);
  }
  result.sort((left, right) => compareStrings(left[0], right[0]));
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
    if (!Array.isArray(dots)) {
      throw new CrdtError('ORSet entry dots must be an array');
    }
    target.set(element, new Set(dots));
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
