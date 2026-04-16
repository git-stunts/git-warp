---
title: "Trie codec and geometry — TrieGeometry, TrieLeaf, TrieBranch"
legend: "PROTO"
cycle: "0027-trie-codec-and-geometry"
source_backlog: "docs/method/backlog/v17.0.0/PROTO_trie-codec-and-geometry.md"
---

# Trie codec and geometry — TrieGeometry, TrieLeaf, TrieBranch

Source backlog item (absorbed into this design doc at cycle open):
`docs/method/backlog/v17.0.0/PROTO_trie-codec-and-geometry.md`.
Legend: PROTO.

## Sponsors

- Human: Backlog operator
- Agent: Implementation agent

## Hill

`TrieGeometry`, `TrieLeaf`, and `TrieBranch` ship as runtime-backed
classes under `src/domain/orset/trie/`, all parameterized by a single
`TrieGeometry` configuration object. `TrieLeaf` round-trips through
CBOR via `CodecPort`, with binary search over a sorted route-key
suffix array. `TrieBranch` wraps a `TrieBranchEntries` map and
produces a new instance on every `set()` (immutable semantics). No
fanout is hardcoded; 16-way is a parameter default, not a constant.
Every code path is covered by unit tests.

## Playback Questions

### Human

- [ ] Does the CBOR wire format survive a fanout change from 16 to
      64 without re-encoding existing leaves?
- [ ] Are the v1 geometry defaults documented clearly enough that
      the geometry-and-memory-profile cycle can revisit them without
      archaeology?

### Agent

- [ ] Is `TrieGeometry` valid only when `nibbleBits = log2(fanout)`
      and `fanout` is in `{16, 64, 256}` for v1?
- [ ] Does `TrieLeaf.binarySearch` return `-1` for all miss cases
      (below, above, between two entries)?
- [ ] Does `TrieLeaf.deserialize` reject unsorted entries and bad
      envelope versions?
- [ ] Is `TrieBranch.set()` pure — original instance unchanged, new
      instance returned with the additional child?
- [ ] Do all three new files stay under 500 LOC, and do all methods
      stay under the 5/3/30/3 complexity caps?

## Accessibility and Assistive Reading

- Linear truth / reduced-complexity posture: three flat classes, no
  hierarchy, no `unknown` outside one named parser boundary.
- Non-visual or alternate-reading expectations: identifiers read
  cleanly; no emoji, no punctuation tricks.

## Localization and Directionality

- Locale / wording / formatting assumptions: none. Route-key
  suffixes are `Uint8Array`, byte-lex sorted.
- Logical direction / layout assumptions: branch children are
  numerically indexed `[0, fanout)`; adapters name them
  `index.toString(16)` at the Git tree entry boundary.

## Agent Inspectability and Explainability

- What must be explicit and deterministic for agents:
  - The CBOR envelope carries an explicit `version` field (v1 = 1).
  - `TrieLeaf.serialize` is deterministic for a given codec adapter
    (`CborCodec` sorts keys to guarantee byte-stable output).
  - `TrieGeometry.default16way()` hands back the v1 defaults with
    no hidden state.
- What must be attributable, evidenced, or governed:
  - Geometry defaults (fanout, nibbleBits, leafCapacity, leafFloor)
    are locked at cycle close and revisited only by the perf cycle.
  - CBOR wire version is bumped on any breaking format change, and
    deserialization rejects unknown versions with a typed domain
    error.

## Non-goals

- [ ] No cursor navigation. That is `PROTO_trie-cursor`.
- [ ] No storage I/O. That is `INFRA_git-trie-store-adapter`.
- [ ] No page cache. That is `PERF_lru-page-cache`.
- [ ] No flush pipeline. That is `PROTO_trie-flush`.
- [ ] No ShadowTrieORSet wiring. That is `PROTO_shadow-trie-orset`.
- [ ] No geometry benchmarking. That is
      `PERF_trie-geometry-and-memory-profile`.

## Backlog Context

## Problem

The trie needs a concrete binary format for leaf blobs and a branch
value object shape. Geometry parameters (fanout, leaf capacity,
split threshold, merge floor) must be defined but not hardcoded. The
codec must be geometry-parameterized from day one.

## Fix

1. `TrieGeometry.ts` — validated configuration class.
    - `fanout ∈ {16, 64, 256}` for v1.
    - `nibbleBits = log2(fanout)`, enforced by the constructor.
    - `leafCapacity > leafFloor ≥ 0`.
    - Frozen after construction.
    - Predicates `splitRequired(n)` / `mergeRequired(n)`.
    - `static default16way()` hands back the v1 default.

2. `TrieLeaf.ts` — runtime-backed class holding a sorted array of
    `(routeKeySuffix, element, dots, tombstonedDots)` entries.
    - Constructor validates sort order and freezes.
    - `binarySearch(suffix)` returns the matching index or `-1`.
    - `serialize(codec)` emits a versioned CBOR envelope
      `{ version: 1, entries: [...] }` where each entry is a
      4-tuple `[routeKeySuffix, element, dots[], tombstonedDots[]]`.
    - `static deserialize(bytes, geometry, codec)` parses the
      envelope, validates version and sort order, and constructs a
      `TrieLeaf`.

3. `TrieBranch.ts` — runtime-backed class wrapping a nibble-indexed
    child map under a geometry.
    - Constructor validates every nibble index is in `[0, fanout)`
      and every child OID is a non-empty string.
    - `get(nibble)` / `set(nibble, oid)` / `entries()` /
      `childCount()`.
    - `set` returns a NEW instance (immutable semantics).
    - JSDoc documents that the Git tree entry naming convention used
      by the adapter is `nibble.toString(16)`; this class does not
      produce Git trees.

### Geometry defaults (v1)

| Parameter      | Default | Rationale                                    |
|----------------|---------|----------------------------------------------|
| `fanout`       | 16      | 4-bit nibbles, matches backlog brief.        |
| `nibbleBits`   | 4       | `log2(16) = 4`.                              |
| `leafCapacity` | 64      | Initial guess; keeps leaves small enough for |
|                |         | cheap binary search, big enough to delay     |
|                |         | split cascades. Revisit via perf cycle.      |
| `leafFloor`    | 16      | `leafCapacity / 4` — a standard rebalance    |
|                |         | ratio that avoids oscillation around the     |
|                |         | split threshold.                             |

The backlog item specified `fanout`, `nibbleBits`, `leafCapacity`,
and `leafFloor` but left `leafCapacity` and `leafFloor` numerical
values unspecified. 64/16 are picked here as reasonable starting
points; `PERF_trie-geometry-and-memory-profile` will validate or
replace them.

### CBOR wire format (leaf)

```cbor
{
  "version": 1,
  "entries": [
    [routeKeySuffix, element, [dot1, dot2, ...], [tdot1, ...]],
    ...
  ]
}
```

- `routeKeySuffix`: CBOR byte string, non-negative length.
- `element`: CBOR text string.
- `dots`, `tombstonedDots`: CBOR arrays of text strings.
- `entries` is sorted by `routeKeySuffix` (byte-lex).
- `version = 1` for this cycle; a future breaking change bumps the
  number and the deserializer rejects unknown values with
  `TrieLeafError` (code `E_TRIE_LEAF_VERSION`).

## Scope

**In:**
- `TrieGeometry.ts` with constructor validation, predicates, and
  v1 default factory.
- `TrieLeaf.ts` with constructor validation, binary search, and
  CBOR round-trip (serialize / deserialize) against `CodecPort`.
- `TrieBranch.ts` with constructor validation, pure `set()`,
  `get()`, `entries()`, `childCount()`.
- New error class `TrieGeometryError` (or additional codes on
  `TrieStoreError` — picked `TrieGeometryError` + `TrieLeafError`
  to keep one error family per concern).
- Unit tests covering 100% of the new lines.

**Out:**
- Cursor, flush, cache, adapter, session, ORSet wiring, perf.

## Notes

- The codec is a `CodecPort` collaborator passed in per call, per
  0025B1's parameterized port surface. No import-time codec binding.
- `TrieLeaf.deserialize` is the one allowed `unknown` boundary in
  this cycle — the codec returns `unknown` from the wire, and a
  named type-guard predicate narrows it before construction.
- Branch children are geometry-validated at construction. Passing a
  nibble index outside `[0, fanout)` is a domain error, not a
  silent truncation.
