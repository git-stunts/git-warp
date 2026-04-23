import type CodecPort from "../../../ports/CodecPort.ts";
import TrieLeafError from "../../errors/TrieLeafError.ts";

import type TrieGeometry from "./TrieGeometry.ts";

/**
 * The wire-format version this codec emits and accepts.
 *
 * A breaking change to the leaf layout bumps this number; the
 * deserializer rejects unrecognized values with
 * `E_TRIE_LEAF_VERSION`.
 */
export const TRIE_LEAF_WIRE_VERSION = 1;

/**
 * Single leaf entry: route-key suffix, element ID, dots, tombstoned
 * dots.
 *
 * The `routeKeySuffix` is the bytes of the element's route key
 * below the leaf's trie depth — the prefix is already encoded by
 * the trie path and is not repeated in the leaf.
 *
 * `dots` and `tombstonedDots` are observed / retracted dots for
 * the element within the ORSet, encoded as string tokens by the
 * higher-level ORSet layer. This class does not parse or interpret
 * them; it transports them through the codec.
 */
export interface TrieLeafEntry {
  readonly routeKeySuffix: Uint8Array;
  readonly element: string;
  readonly dots: ReadonlySet<string>;
  readonly tombstonedDots: ReadonlySet<string>;
}

/**
 * On-wire representation of a `TrieLeaf`.
 *
 * Versioned envelope around a dense entry array; each entry is a
 * 4-tuple matching the field order in `TrieLeafEntry`. Dots and
 * tombstoned dots are transported as arrays to match CBOR's
 * primitive types (sets are not a first-class CBOR type here).
 *
 * This DTO is the transport type only. Domain code outside this
 * module should not touch it; it enters and exits through
 * `serialize` / `deserialize`.
 */
interface LeafWireFormat {
  readonly version: number;
  readonly entries: ReadonlyArray<LeafWireEntry>;
}

type LeafWireEntry = readonly [
  Uint8Array,
  string,
  ReadonlyArray<string>,
  ReadonlyArray<string>,
];

/**
 * Runtime-backed leaf node of the shadow trie.
 *
 * A leaf holds a sorted array of entries (by `routeKeySuffix`,
 * byte-lex). Construction validates sort order and freezes the
 * instance. `binarySearch` returns the matching index or `-1`.
 * `serialize` / `deserialize` round-trip through a `CodecPort`
 * adapter via a versioned CBOR envelope.
 *
 * The leaf owns the geometry it was constructed under so it can
 * answer split/merge questions without the caller threading the
 * geometry separately.
 */
export default class TrieLeaf {
  readonly geometry: TrieGeometry;
  private readonly sortedEntries: ReadonlyArray<TrieLeafEntry>;

  constructor(
    entries: ReadonlyArray<TrieLeafEntry>,
    geometry: TrieGeometry,
  ) {
    validateEntriesSorted(entries);
    this.sortedEntries = entries;
    this.geometry = geometry;
    Object.freeze(this);
  }

  /**
   * Number of entries in the leaf.
   */
  size(): number {
    return this.sortedEntries.length;
  }

  /**
   * Accessor for the sorted entry array. Returns the frozen array
   * the leaf was constructed with — the caller is expected not to
   * mutate it.
   */
  entries(): ReadonlyArray<TrieLeafEntry> {
    return this.sortedEntries;
  }

  /**
   * Binary search for an exact route-key-suffix match.
   *
   * Returns the index of the matching entry or `-1` if the suffix
   * is not present. Comparison is byte-lex over `Uint8Array`.
   */
  binarySearch(suffix: Uint8Array): number {
    let lo = 0;
    let hi = this.sortedEntries.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const entry = this.sortedEntries[mid];
      if (entry === undefined) {
        return -1;
      }
      const cmp = compareBytes(entry.routeKeySuffix, suffix);
      if (cmp === 0) {
        return mid;
      }
      if (cmp < 0) {
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return -1;
  }

  /**
   * Returns true when the leaf has exceeded the geometry's capacity.
   */
  requiresSplit(geometry: TrieGeometry): boolean {
    return geometry.splitRequired(this.sortedEntries.length);
  }

  /**
   * Returns true when the leaf has dropped below the geometry's
   * merge floor.
   */
  requiresMerge(geometry: TrieGeometry): boolean {
    return geometry.mergeRequired(this.sortedEntries.length);
  }

  /**
   * Serialize this leaf to CBOR bytes via the supplied codec.
   *
   * The wire format is a versioned envelope; see
   * `TRIE_LEAF_WIRE_VERSION` for the current value.
   */
  serialize(codec: CodecPort): Uint8Array {
    const wire: LeafWireFormat = {
      version: TRIE_LEAF_WIRE_VERSION,
      entries: this.sortedEntries.map(entryToWire),
    };
    return codec.encode<LeafWireFormat>(wire);
  }

  /**
   * Decode bytes into a `TrieLeaf` under the supplied geometry.
   *
   * Validates the envelope version, the envelope shape, and the
   * entries' sort order. Raises `TrieLeafError` with a typed code
   * on any violation.
   */
  static deserialize(
    bytes: Uint8Array,
    geometry: TrieGeometry,
    codec: CodecPort,
  ): TrieLeaf {
    const decoded = codec.decode(bytes);
    if (!isLeafWireFormat(decoded)) {
      throw new TrieLeafError(
        "TrieLeaf.deserialize received bytes that do not match the leaf envelope shape",
        { code: "E_TRIE_LEAF_WIRE_SHAPE" },
      );
    }
    if (decoded.version !== TRIE_LEAF_WIRE_VERSION) {
      throw new TrieLeafError(
        `TrieLeaf.deserialize saw unrecognized wire version ${String(decoded.version)}; expected ${String(TRIE_LEAF_WIRE_VERSION)}`,
        { code: "E_TRIE_LEAF_VERSION" },
      );
    }
    const entries = decoded.entries.map(entryFromWire);
    return new TrieLeaf(entries, geometry);
  }
}

function entryToWire(entry: TrieLeafEntry): LeafWireEntry {
  return [
    entry.routeKeySuffix,
    entry.element,
    [...entry.dots],
    [...entry.tombstonedDots],
  ];
}

function entryFromWire(raw: LeafWireEntry): TrieLeafEntry {
  const [routeKeySuffix, element, dots, tombstonedDots] = raw;
  return {
    routeKeySuffix,
    element,
    dots: new Set(dots),
    tombstonedDots: new Set(tombstonedDots),
  };
}

function validateEntriesSorted(
  entries: ReadonlyArray<TrieLeafEntry>,
): void {
  for (let i = 1; i < entries.length; i += 1) {
    const prev = entries[i - 1];
    const curr = entries[i];
    if (prev === undefined || curr === undefined) {
      throw new TrieLeafError(
        "TrieLeaf constructor received a sparse entry array",
        { code: "E_TRIE_LEAF_ENTRY_SHAPE" },
      );
    }
    if (compareBytes(prev.routeKeySuffix, curr.routeKeySuffix) >= 0) {
      throw new TrieLeafError(
        `TrieLeaf entries must be strictly sorted by routeKeySuffix; violation at index ${String(i)}`,
        { code: "E_TRIE_LEAF_UNSORTED" },
      );
    }
  }
}

function compareBytes(left: Uint8Array, right: Uint8Array): number {
  const len = Math.min(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    if (a !== b) {
      return a - b;
    }
  }
  return left.length - right.length;
}

/**
 * Opaque decoded-record alias used by the leaf's boundary decoder.
 *
 * Named so the type-guard predicates below can read
 * `value is DecodedRecord` on one line each — the raw shape stays
 * colocated with the parser and does not leak into the rest of the
 * domain.
 */
type DecodedRecord = { readonly [key: string]: unknown };

/**
 * Opaque decoded-array alias used by the leaf's boundary decoder.
 */
type DecodedArray = ReadonlyArray<unknown>;

function isDecodedRecord(value: unknown): value is DecodedRecord {
  return value !== null && typeof value === "object";
}

function isDecodedArray(value: unknown): value is DecodedArray {
  return Array.isArray(value);
}

function isLeafWireFormat(value: unknown): value is LeafWireFormat {
  if (!isDecodedRecord(value)) {
    return false;
  }
  const { version, entries } = value;
  if (typeof version !== "number" || !isDecodedArray(entries)) {
    return false;
  }
  return entries.every(isLeafWireEntry);
}

function isLeafWireEntry(value: unknown): value is LeafWireEntry {
  if (!isDecodedArray(value) || value.length !== 4) {
    return false;
  }
  return isLeafWireEntryFields(value);
}

function isLeafWireEntryFields(value: DecodedArray): boolean {
  const [suffix, element, dots, tombstoned] = value;
  if (!(suffix instanceof Uint8Array) || typeof element !== "string") {
    return false;
  }
  return isStringArray(dots) && isStringArray(tombstoned);
}

function isStringArray(value: unknown): value is ReadonlyArray<string> {
  return isDecodedArray(value) && value.every((v) => typeof v === "string");
}
