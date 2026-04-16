import TrieCursorError from "../../errors/TrieCursorError.ts";
import TrieStoreError from "../../errors/TrieStoreError.ts";
import type { Dot } from "../../crdt/Dot.ts";
import RouteKey from "../route/RouteKey.ts";

import { encodeDirtyPath } from "./DirtyPageSet.ts";
import TrieLeaf, { type TrieLeafEntry } from "./TrieLeaf.ts";

/**
 * Shared helpers for {@link TrieCursor}.
 *
 * The cursor class itself stays disciplined under the per-method
 * caps by delegating pure transformations (byte packing, leaf
 * mutation, entry comparison) to this module. Nothing here
 * touches the store or mutates cursor state; every function is
 * pure and testable in isolation.
 */

const VALID_NIBBLE_BITS: ReadonlyArray<1 | 2 | 4 | 8> = [1, 2, 4, 8];

export function nibbleBitsOf(n: number): 1 | 2 | 4 | 8 {
  for (const candidate of VALID_NIBBLE_BITS) {
    if (candidate === n) {
      return candidate;
    }
  }
  throw new TrieCursorError(
    `TrieCursor geometry nibbleBits must be 1, 2, 4, or 8; received ${String(n)}`,
    { code: "E_TRIE_CURSOR_INPUT", context: { nibbleBits: n } },
  );
}

export function validateElement(element: string): void {
  if (typeof element !== "string" || element.length === 0) {
    throw new TrieCursorError(
      "TrieCursor element must be a non-empty string",
      { code: "E_TRIE_CURSOR_INPUT", context: { element } },
    );
  }
}

export function validateDot(dot: Dot): void {
  if (!isWellFormedDot(dot)) {
    throw new TrieCursorError(
      "TrieCursor dot must be {writerId: non-empty string, counter: positive integer}",
      { code: "E_TRIE_CURSOR_INPUT", context: { dot } },
    );
  }
}

function isWellFormedDot(dot: Dot): boolean {
  if (dot === null || dot === undefined) {
    return false;
  }
  return hasValidWriterId(dot) && hasValidCounter(dot);
}

function hasValidWriterId(dot: Dot): boolean {
  return typeof dot.writerId === "string" && dot.writerId.length > 0;
}

function hasValidCounter(dot: Dot): boolean {
  return Number.isInteger(dot.counter) && dot.counter > 0;
}

export function suffixOfRouteKey(
  routeKey: RouteKey,
  depth: number,
  nibbleBits: 1 | 2 | 4 | 8,
): Uint8Array {
  // Always pack MSB-first so the representation is consistent
  // across byte-aligned and sub-byte-aligned depths. A consistent
  // format lets `shortenEntries` shift by one nibble without
  // changing format mid-flight.
  return packSuffixMsbFirst(routeKey, depth, nibbleBits);
}

function packSuffixMsbFirst(
  routeKey: RouteKey,
  depth: number,
  nibbleBits: 1 | 2 | 4 | 8,
): Uint8Array {
  const maxDepth = 256 / nibbleBits;
  const nibblesLeft = maxDepth - depth;
  const byteCount = Math.ceil((nibblesLeft * nibbleBits) / 8);
  const out = new Uint8Array(byteCount);
  for (let i = 0; i < nibblesLeft; i += 1) {
    writeNibbleAt({ out, slot: i, nibbleBits, value: routeKey.nibbleAt(depth + i, nibbleBits) });
  }
  return out;
}

function writeNibbleAt(args: {
  readonly out: Uint8Array;
  readonly slot: number;
  readonly nibbleBits: 1 | 2 | 4 | 8;
  readonly value: number;
}): void {
  const bitOffset = args.slot * args.nibbleBits;
  const byteIndex = Math.floor(bitOffset / 8);
  const bitInByte = bitOffset % 8;
  const shift = 8 - args.nibbleBits - bitInByte;
  const prev = args.out[byteIndex] ?? 0;
  args.out[byteIndex] = (prev | (args.value << shift)) & 0xff;
}

export interface UpsertArgs {
  readonly leaf: TrieLeaf;
  readonly routeKey: RouteKey;
  readonly leafDepth: number;
  readonly nibbleBits: 1 | 2 | 4 | 8;
  readonly element: string;
  readonly encodedDot: string;
}

export function upsertIntoLeaf(args: UpsertArgs): TrieLeaf {
  const suffix = suffixOfRouteKey(args.routeKey, args.leafDepth, args.nibbleBits);
  const entries = [...args.leaf.entries()];
  const existingIndex = args.leaf.binarySearch(suffix);
  if (existingIndex !== -1) {
    return upsertAtExistingIndex({ entries, existingIndex, args });
  }
  const insertAt = findInsertIndex(entries, suffix);
  entries.splice(insertAt, 0, makeEntry(suffix, args.element, new Set([args.encodedDot])));
  return new TrieLeaf(entries, args.leaf.geometry);
}

function upsertAtExistingIndex(args: {
  readonly entries: TrieLeafEntry[];
  readonly existingIndex: number;
  readonly args: UpsertArgs;
}): TrieLeaf {
  const existing = args.entries[args.existingIndex];
  if (existing === undefined) {
    return args.args.leaf;
  }
  if (existing.element !== args.args.element) {
    return upsertOnSuffixCollision(args);
  }
  if (existing.tombstonedDots.has(args.args.encodedDot)) {
    return args.args.leaf;
  }
  const nextDots = new Set(existing.dots);
  nextDots.add(args.args.encodedDot);
  args.entries[args.existingIndex] = {
    routeKeySuffix: existing.routeKeySuffix,
    element: existing.element,
    dots: nextDots,
    tombstonedDots: existing.tombstonedDots,
  };
  return new TrieLeaf(args.entries, args.args.leaf.geometry);
}

function upsertOnSuffixCollision(args: {
  readonly entries: TrieLeafEntry[];
  readonly existingIndex: number;
  readonly args: UpsertArgs;
}): TrieLeaf {
  const suffix = suffixOfRouteKey(
    args.args.routeKey,
    args.args.leafDepth,
    args.args.nibbleBits,
  );
  const tagged = appendCollisionTag(suffix, args.args.element);
  const insertAt = findInsertIndex(args.entries, tagged);
  args.entries.splice(
    insertAt,
    0,
    makeEntry(tagged, args.args.element, new Set([args.args.encodedDot])),
  );
  return new TrieLeaf(args.entries, args.args.leaf.geometry);
}

function appendCollisionTag(suffix: Uint8Array, element: string): Uint8Array {
  const tag = (element.charCodeAt(element.length - 1) | 0) & 0xff;
  const out = new Uint8Array(suffix.length + 1);
  out.set(suffix, 0);
  out[suffix.length] = tag === 0 ? 1 : tag;
  return out;
}

export function findInsertIndex(
  entries: readonly TrieLeafEntry[],
  suffix: Uint8Array,
): number {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const entry = entries[mid];
    if (entry === undefined) {
      return lo;
    }
    if (compareBytes(entry.routeKeySuffix, suffix) < 0) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

export function compareBytes(left: Uint8Array, right: Uint8Array): number {
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

export function makeEntry(
  routeKeySuffix: Uint8Array,
  element: string,
  dots: Set<string>,
): TrieLeafEntry {
  return {
    routeKeySuffix,
    element,
    dots,
    tombstonedDots: new Set<string>(),
  };
}

export interface FindEntryArgs {
  readonly leaf: TrieLeaf;
  readonly routeKey: RouteKey;
  readonly depth: number;
  readonly nibbleBits: 1 | 2 | 4 | 8;
  readonly element: string;
}

export function findEntryInLeaf(args: FindEntryArgs): TrieLeafEntry | null {
  const suffix = suffixOfRouteKey(args.routeKey, args.depth, args.nibbleBits);
  return findEntryByElementNearSuffix(args.leaf, suffix, args.element);
}

function findEntryByElementNearSuffix(
  leaf: TrieLeaf,
  suffix: Uint8Array,
  element: string,
): TrieLeafEntry | null {
  const entries = leaf.entries();
  const exact = leaf.binarySearch(suffix);
  if (exact !== -1) {
    const hit = entries[exact];
    if (hit !== undefined && hit.element === element) {
      return hit;
    }
  }
  // The suffix may have been tagged for a collision; scan a
  // narrow window forward until the shared prefix ends.
  return scanForCollisionTaggedEntry(entries, suffix, element);
}

function scanForCollisionTaggedEntry(
  entries: readonly TrieLeafEntry[],
  suffix: Uint8Array,
  element: string,
): TrieLeafEntry | null {
  const startIndex = lowerBoundOnSuffix(entries, suffix);
  for (let i = startIndex; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry === undefined) {
      return null;
    }
    if (!hasSuffixPrefix(entry.routeKeySuffix, suffix)) {
      return null;
    }
    if (entry.element === element) {
      return entry;
    }
  }
  return null;
}

function lowerBoundOnSuffix(
  entries: readonly TrieLeafEntry[],
  suffix: Uint8Array,
): number {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const entry = entries[mid];
    if (entry === undefined) {
      return lo;
    }
    if (compareBytes(entry.routeKeySuffix, suffix) < 0) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function hasSuffixPrefix(candidate: Uint8Array, expected: Uint8Array): boolean {
  if (candidate.length < expected.length) {
    return false;
  }
  return bytesEqualInRange(candidate, expected, expected.length);
}

function bytesEqualInRange(
  candidate: Uint8Array,
  expected: Uint8Array,
  length: number,
): boolean {
  for (let i = 0; i < length; i += 1) {
    if ((candidate[i] ?? 0) !== (expected[i] ?? 0)) {
      return false;
    }
  }
  return true;
}

export function partitionEntriesByNextNibble(
  leaf: TrieLeaf,
  nibbleBits: 1 | 2 | 4 | 8,
): ReadonlyMap<number, readonly TrieLeafEntry[]> {
  const out = new Map<number, TrieLeafEntry[]>();
  for (const entry of leaf.entries()) {
    const nibble = firstNibbleOfSuffix(entry.routeKeySuffix, nibbleBits);
    pushIntoBucket(out, nibble, entry);
  }
  return out;
}

function pushIntoBucket(
  buckets: Map<number, TrieLeafEntry[]>,
  nibble: number,
  entry: TrieLeafEntry,
): void {
  const bucket = buckets.get(nibble);
  if (bucket === undefined) {
    buckets.set(nibble, [entry]);
    return;
  }
  bucket.push(entry);
}

function firstNibbleOfSuffix(
  suffix: Uint8Array,
  nibbleBits: 1 | 2 | 4 | 8,
): number {
  const byte = suffix[0] ?? 0;
  const shift = 8 - nibbleBits;
  const mask = (1 << nibbleBits) - 1;
  return (byte >>> shift) & mask;
}

export function shortenEntries(
  entries: readonly TrieLeafEntry[],
  nibbleBits: 1 | 2 | 4 | 8,
): TrieLeafEntry[] {
  const shortened = entries.map((entry) => ({
    routeKeySuffix: shiftSuffixLeftByOneNibble(entry.routeKeySuffix, nibbleBits),
    element: entry.element,
    dots: entry.dots,
    tombstonedDots: entry.tombstonedDots,
  }));
  shortened.sort((a, b) => compareBytes(a.routeKeySuffix, b.routeKeySuffix));
  return shortened;
}

/**
 * Shifts a suffix byte array left by `nibbleBits` bits, producing
 * the suffix at the next depth. The last (now-empty) nibble is
 * discarded; if that empties a whole byte, the resulting array is
 * one byte shorter.
 */
export function shiftSuffixLeftByOneNibble(
  suffix: Uint8Array,
  nibbleBits: 1 | 2 | 4 | 8,
): Uint8Array {
  const totalBits = suffix.length * 8 - nibbleBits;
  if (totalBits <= 0) {
    return new Uint8Array(0);
  }
  const newLength = Math.ceil(totalBits / 8);
  const out = new Uint8Array(newLength);
  for (let i = 0; i < newLength; i += 1) {
    const hi = (suffix[i] ?? 0) << nibbleBits;
    const lo = (suffix[i + 1] ?? 0) >>> (8 - nibbleBits);
    out[i] = (hi | lo) & 0xff;
  }
  return out;
}

export function tombstoneEntry(
  entry: TrieLeafEntry,
  observedDots: ReadonlySet<string>,
): { readonly entry: TrieLeafEntry; readonly changed: boolean } {
  const nextLive = new Set<string>();
  const nextTombstoned = new Set(entry.tombstonedDots);
  let changed = false;
  for (const dot of entry.dots) {
    if (observedDots.has(dot)) {
      nextTombstoned.add(dot);
      changed = true;
    } else {
      nextLive.add(dot);
    }
  }
  return {
    entry: {
      routeKeySuffix: entry.routeKeySuffix,
      element: entry.element,
      dots: nextLive,
      tombstonedDots: nextTombstoned,
    },
    changed,
  };
}

export function pendingChildOid(
  parentPath: readonly number[],
  childNibble: number,
): string {
  return `pending:${encodeDirtyPath([...parentPath, childNibble])}`;
}

export function isMissingStoreError(raw: Error): raw is TrieStoreError {
  return raw instanceof TrieStoreError && raw.code === "E_TRIE_STORE_MISSING";
}

export interface WrapErrorArgs {
  readonly raw: Error;
  readonly op: string;
  readonly path: readonly number[];
  readonly oid: string;
}

export function wrapStoreError(args: WrapErrorArgs): TrieCursorError {
  if (args.raw instanceof TrieCursorError) {
    return args.raw;
  }
  const {message} = args.raw;
  return new TrieCursorError(
    `TrieCursor ${args.op} failed at path=${encodeDirtyPath(args.path)} oid=${args.oid}: ${message}`,
    {
      code: "E_TRIE_CURSOR_STORE",
      context: {
        op: args.op,
        path: encodeDirtyPath(args.path),
        oid: args.oid,
        cause: message,
      },
    },
  );
}

export function wrapDecodeError(args: WrapErrorArgs): TrieCursorError {
  if (args.raw instanceof TrieCursorError) {
    return args.raw;
  }
  const {message} = args.raw;
  return new TrieCursorError(
    `TrieCursor ${args.op} decode failed at path=${encodeDirtyPath(args.path)} oid=${args.oid}: ${message}`,
    {
      code: "E_TRIE_CURSOR_DECODE",
      context: {
        op: args.op,
        path: encodeDirtyPath(args.path),
        oid: args.oid,
        cause: message,
      },
    },
  );
}
