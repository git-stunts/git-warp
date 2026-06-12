import TrieGeometryError from "../../errors/TrieGeometryError.ts";

/**
 * Supported fanout values for the shadow-trie ORSet.
 *
 * The geometry benchmark (`PERF_trie-geometry-and-memory-profile`)
 * will validate or replace these values. The codec and cursor
 * remain parameterized across the entire range; only the
 * constructor gate is geometry-specific.
 */
export const SUPPORTED_FANOUTS: ReadonlyArray<number> = [16, 64, 256];

/**
 * Default fanout (4-bit nibbles, 16-way branching). Matches
 * the backlog brief.
 */
export const DEFAULT_FANOUT = 16;

/**
 * Default nibble width in bits. `log2(DEFAULT_FANOUT)`.
 */
export const DEFAULT_NIBBLE_BITS = 4;

/**
 * Default leaf capacity (split threshold).
 *
 * Picked at 64 as a starting point: small enough to keep binary
 * search cheap, large enough to amortize split cascades. The perf
 * cycle will replace this if needed.
 */
export const DEFAULT_LEAF_CAPACITY = 64;

/**
 * Default leaf floor (merge threshold).
 *
 * Picked as `DEFAULT_LEAF_CAPACITY / 4 = 16`. A 1:4 floor:capacity
 * ratio is a standard rebalance choice that keeps merge/split
 * oscillation bounded.
 */
export const DEFAULT_LEAF_FLOOR = 16;

/**
 * Parameter object for `TrieGeometry` construction.
 *
 * Named so callers cannot swap positional arguments and so the four
 * values arrive as a semantic unit. All fields are required; there
 * are no sensible defaults for a geometry that mixes capacity and
 * fanout.
 */
export interface TrieGeometryInit {
  readonly fanout: number;
  readonly nibbleBits: number;
  readonly leafCapacity: number;
  readonly leafFloor: number;
}

/**
 * Runtime-backed trie geometry configuration.
 *
 * A `TrieGeometry` instance pins four parameters:
 *
 * - `fanout`: branching factor for branch nodes. Must be one of the
 *   values in `SUPPORTED_FANOUTS`.
 * - `nibbleBits`: bits extracted per nibble from a `RouteKey`.
 *   Must equal `log2(fanout)`.
 * - `leafCapacity`: positive integer. A leaf with more than this
 *   many entries requires a split.
 * - `leafFloor`: non-negative integer, strictly less than
 *   `leafCapacity`. A leaf with fewer than this many entries
 *   requires a merge.
 *
 * All fields are validated in the constructor and the instance is
 * frozen on exit. Predicates `splitRequired` / `mergeRequired`
 * dispatch on entry counts.
 *
 * Instances carry no identity beyond their values; two geometries
 * with identical parameters are interchangeable.
 */
export default class TrieGeometry {
  readonly fanout: number;
  readonly nibbleBits: number;
  readonly leafCapacity: number;
  readonly leafFloor: number;

  constructor(init: TrieGeometryInit) {
    validateFanout(init.fanout);
    validateNibbleBits(init.fanout, init.nibbleBits);
    validateLeafCapacity(init.leafCapacity);
    validateLeafFloor(init.leafFloor, init.leafCapacity);
    this.fanout = init.fanout;
    this.nibbleBits = init.nibbleBits;
    this.leafCapacity = init.leafCapacity;
    this.leafFloor = init.leafFloor;
    Object.freeze(this);
  }

  /**
   * Returns true when a leaf with `entryCount` entries has exceeded
   * capacity and must be split. The comparison is strict: a leaf
   * with exactly `leafCapacity` entries is still allowed; only the
   * step past triggers a split.
   */
  splitRequired(entryCount: number): boolean {
    return entryCount > this.leafCapacity;
  }

  /**
   * Returns true when a leaf with `entryCount` entries has dropped
   * below the merge floor. The comparison is strict: a leaf with
   * exactly `leafFloor` entries is still allowed; only the step
   * past triggers a merge.
   */
  mergeRequired(entryCount: number): boolean {
    return entryCount < this.leafFloor;
  }

  /**
   * Default geometry: 16-way fanout, 4-bit nibbles, leaf
   * capacity 64, leaf floor 16. Revisit via the perf cycle.
   */
  static default16way(): TrieGeometry {
    return new TrieGeometry({
      fanout: DEFAULT_FANOUT,
      nibbleBits: DEFAULT_NIBBLE_BITS,
      leafCapacity: DEFAULT_LEAF_CAPACITY,
      leafFloor: DEFAULT_LEAF_FLOOR,
    });
  }
}

function validateFanout(fanout: number): void {
  if (!SUPPORTED_FANOUTS.includes(fanout)) {
    throw new TrieGeometryError(
      `TrieGeometry fanout must be one of {${SUPPORTED_FANOUTS.join(", ")}}; received ${String(fanout)}`,
      { code: "E_TRIE_GEOMETRY_FANOUT" },
    );
  }
}

function validateNibbleBits(fanout: number, nibbleBits: number): void {
  const expected = Math.log2(fanout);
  if (nibbleBits !== expected) {
    throw new TrieGeometryError(
      `TrieGeometry nibbleBits must equal log2(fanout)=${String(expected)}; received ${String(nibbleBits)}`,
      { code: "E_TRIE_GEOMETRY_NIBBLE_BITS" },
    );
  }
}

function validateLeafCapacity(leafCapacity: number): void {
  if (!Number.isInteger(leafCapacity) || leafCapacity <= 0) {
    throw new TrieGeometryError(
      `TrieGeometry leafCapacity must be a positive integer; received ${String(leafCapacity)}`,
      { code: "E_TRIE_GEOMETRY_LEAF_CAPACITY" },
    );
  }
}

function validateLeafFloor(leafFloor: number, leafCapacity: number): void {
  if (!Number.isInteger(leafFloor) || leafFloor < 0) {
    throw new TrieGeometryError(
      `TrieGeometry leafFloor must be a non-negative integer; received ${String(leafFloor)}`,
      { code: "E_TRIE_GEOMETRY_LEAF_FLOOR" },
    );
  }
  if (leafFloor >= leafCapacity) {
    throw new TrieGeometryError(
      `TrieGeometry leafFloor (${String(leafFloor)}) must be strictly less than leafCapacity (${String(leafCapacity)})`,
      { code: "E_TRIE_GEOMETRY_LEAF_FLOOR" },
    );
  }
}
