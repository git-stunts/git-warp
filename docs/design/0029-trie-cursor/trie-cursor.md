---
title: "Path-descending trie cursor with dirty tracking"
legend: "PROTO"
cycle: "0029-trie-cursor"
source_backlog: "docs/method/backlog/v17.0.0/PROTO_trie-cursor.md"
---

# Path-descending trie cursor with dirty tracking

Source backlog item (absorbed into this doc):
`docs/method/backlog/v17.0.0/PROTO_trie-cursor.md`
Legend: PROTO

## Sponsors

- Human: Backlog operator
- Agent: Implementation agent

## Hill

`TrieCursor` descends the shadow trie by blake3 route-key nibbles,
resolves leaves through `TrieStorePort`, answers `contains`,
`getDots`, and `elements`, and accumulates a `DirtyPageSet` of
mutated leaves and branches for a later `TrieFlusher` to persist.
Splits happen when a leaf exceeds `geometry.leafCapacity`; no
merges in this cycle. Structural sharing is preserved via recorded
clean-child OIDs.

## Playback Questions

### Human

- [ ] Is the cursor's API small enough to fit on one page?
- [ ] Does the split behaviour produce a legible trie that a human
      can walk by hand via `git ls-tree`?

### Agent

- [ ] Does `contains` return `false` on an empty trie without
      invoking the store?
- [ ] Does `add` produce a `DirtyPageSet` whose bottom-up
      enumeration is deterministic (deepest first, then ascending
      nibble order)?
- [ ] Does `remove` move dots from `dots` to `tombstonedDots`
      without ever shrinking the trie structure this cycle?
- [ ] Does `getDots` return only live dots?
- [ ] Does a split cascade correctly when every entry in an
      over-capacity leaf shares the splitting nibble (deep
      recursion at depth+1)?
- [ ] Does a cursor that only reads a subtree record that subtree
      as clean via `cleanChildOidAt(path)`?
- [ ] Do store failures bubble as `TrieCursorError` with typed
      codes, never as raw `Error`?

## Accessibility and Assistive Reading

- Linear truth / reduced-complexity posture: a single class with
  four async read/write methods and a `snapshot()` accessor. The
  dirty snapshot is a second named class with one accessor per
  concept (`dirtyLeafAt`, `dirtyBranchAt`, `cleanChildOidAt`) and
  one deterministic iterator.
- Non-visual or alternate-reading expectations: no colour, no
  layout. Error context carries the path as a stable string key.

## Localization and Directionality

- Locale / wording / formatting assumptions: none. All identifiers
  are ASCII; path keys are hex nibble strings joined by `/`.
- Logical direction / layout assumptions: descent proceeds from
  the root outward in ascending depth. Split partitions use MSB-
  first nibble order, matching `RouteKey.nibbleAt`.

## Agent Inspectability and Explainability

- Deterministic enumeration: `DirtyPageSet.enumerateBottomUp()`
  yields entries in deepest-first, ascending-nibble-tie order.
  Sibling ordering never depends on insertion order.
- Path-key encoding: `path.map(n => n.toString(16)).join('/')`.
  Empty path = empty string `''` = the root. Documented on
  `DirtyPageSet` and in this design doc.
- Failure envelope: every failure raised by the cursor carries a
  `TrieCursorError` with a typed code and a structured `context`
  naming the element, path, or dot set involved.

## Non-goals

- [ ] No LRU / page cache. That is `PERF_lru-page-cache`.
- [ ] No flush / persistence. That is `PROTO_trie-flush`
      (cycle 0030).
- [ ] No merge logic. Leaves below `leafFloor` stay put.
- [ ] No ShadowTrieORSet wrapper. That is `PROTO_shadow-trie-orset`.
- [ ] No checkpoint envelope publication. That is
      `PROTO_checkpoint-envelope-publication`.
- [ ] No read cache inside the cursor (would break determinism of
      the in-memory test double).
- [ ] No mutation methods on `DirtyPageSet`. It is an immutable
      snapshot.

## Backlog Context

## Problem

The trie needs a navigation layer that descends through branches
by following nibble paths, resolves to leaves, and supports
mutations with dirty tracking for later flush. The codec
(cycle 0027), the store port (cycle 0026), and the Git adapter
(cycle 0028) are in place; nothing stitches them together yet.

## Fix

Implement `TrieCursor` in `src/domain/orset/trie/`:

```typescript
export default class TrieCursor {
  constructor(fields: {
    readonly rootOid: string | null;
    readonly store: TrieStorePort;
    readonly geometry: TrieGeometry;
    readonly codec: CodecPort;
  });

  contains(element: string): Promise<boolean>;
  add(element: string, dot: Dot): Promise<void>;
  remove(observedDots: ReadonlySet<string>): Promise<void>;
  getDots(element: string): Promise<ReadonlySet<string>>;
  elements(): Promise<readonly string[]>;
  snapshot(): DirtyPageSet;
}
```

- `rootOid === null` means empty trie. First mutation creates the
  root leaf.
- `contains` descends by `RouteKey.nibbleAt(depth, geometry.nibbleBits)`,
  loads the leaf, binary-searches by route-key suffix, returns
  whether the matched entry carries any live dots.
- `add` descends, finds or creates the leaf, inserts entry or
  adds the dot to an existing entry's `dots` set, marks the leaf
  dirty, and splits if the leaf exceeds `geometry.leafCapacity`.
- `remove` takes a set of encoded dots. For each dot, descend to
  the leaf containing the dot's element (encoded dot format is
  `elementId@writer#seq`, decoded at the cursor boundary), move
  the dot from `dots` to `tombstonedDots`, mark dirty.
- `getDots` descends and returns the live `dots` set of the
  matching entry, or an empty set.
- `elements` walks every leaf (breadth first, nibble-order tie
  break), collects non-tombstoned entries' elements, returns a
  readonly array.

### Route-key suffix on split

Per cycle 0027, leaf entries carry only the suffix of the route
key below the leaf's trie depth. When a split partitions entries
by `RouteKey.nibbleAt(depth, geometry.nibbleBits)`, the cursor
reads the FIRST nibble of the entry's stored suffix (that nibble
is the one at the leaf's depth). After a partition becomes a new
child leaf, each entry's `routeKeySuffix` is shortened by one
nibble.

### Split cascade

If every entry in an over-capacity leaf maps to the same
partition (they all share the nibble at this depth), the new
child leaf is still over capacity. The cursor recurses and splits
the child at depth+1. This handles pathological alignment of
route-key prefixes.

### Terminal case (hash collision)

When all nibbles of the 32-byte route key have been consumed
(maximum depth `256 / nibbleBits` — 64 for 4-bit nibbles, 32 for
8-bit), further splits are impossible. The cursor accepts that
the leaf contains hash-collision entries and tolerates being
over-capacity at that terminal depth. This only occurs for
blake3 collisions, which we do not expect in practice; the retro
documents the behaviour as "tolerated, not corrected".

## Dirty-tracking API

`DirtyPageSet` is an immutable snapshot of the cursor's working
state, handed to `TrieFlusher` in the next cycle.

```typescript
class DirtyPageSet {
  constructor(fields: {
    readonly rootOid: string | null;
    readonly dirtyLeaves: ReadonlyMap<string, TrieLeaf>;
    readonly dirtyBranches: ReadonlyMap<string, TrieBranch>;
    readonly cleanChildren: ReadonlyMap<string, string>;
  });

  rootOid(): string | null;
  dirtyLeafAt(path: readonly number[]): TrieLeaf | null;
  dirtyBranchAt(path: readonly number[]): TrieBranch | null;
  cleanChildOidAt(path: readonly number[]): string | null;
  enumerateBottomUp(): IterableIterator<{
    readonly path: readonly number[];
    readonly node: TrieLeaf | TrieBranch;
  }>;
  isEmpty(): boolean;
}
```

- **Path-key encoding.** `path.map(n => n.toString(16)).join('/')`.
  Empty path = empty string `''` = the root.
- **Bottom-up enumeration.** Deepest path first, ties broken by
  nibble order ascending. Deterministic across runs.
- **Clean children.** During descent, if the cursor visits a
  subtree without modifying it, it records that subtree's OID
  here so the flusher can reuse it (structural sharing).

## Scope

**In:**

- `src/domain/orset/trie/TrieCursor.ts`.
- `src/domain/orset/trie/DirtyPageSet.ts`.
- `src/domain/errors/TrieCursorError.ts` (new, extends `WarpError`).
- Unit tests at `test/unit/domain/orset/trie/TrieCursor.test.ts`
  and `test/unit/domain/orset/trie/DirtyPageSet.test.ts`.
- In-memory `TrieStorePort` test double under `test/helpers/`.
- Seam README updated.

**Out:**

- No flush. No persistence.
- No LRU cache / page cache.
- No merge logic. No compaction.
- No ShadowTrieORSet wrapper.
- No checkpoint envelope.

## Notes

- Consumer of: `TrieStorePort`, `TrieGeometry`, `TrieLeaf`,
  `TrieBranch`, `RouteKey`, `CodecPort`.
- Splits create new `TrieBranch` instances via `TrieBranch.set`
  (copy-on-write).
- No writes happen inside the cursor; all new OIDs come from the
  flusher in cycle 0030. The cursor holds working pages in the
  dirty maps until `snapshot()` captures them.
- Tests use an inline in-memory `TrieStorePort` double (keyed by
  a deterministic content-addressed OID) shared with the flusher
  tests in cycle 0030.

## Downstream effects

- `PROTO_trie-flush` (cycle 0030) — consumes `DirtyPageSet`,
  emits a new root OID.
- `PERF_lru-page-cache` — sits in front of `store.readBranch` and
  `store.readLeaf`. The cursor is the first real consumer of the
  port.
- `PROTO_shadow-trie-orset` — wraps `TrieCursor` behind an async
  ORSet interface under a `StateSession`.
