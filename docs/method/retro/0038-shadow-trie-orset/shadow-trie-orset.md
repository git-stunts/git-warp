---
title: "ShadowTrieORSet"
cycle: "0038-shadow-trie-orset"
design_doc: "docs/design/0038-shadow-trie-orset.md"
outcome: hill-met
drift_check: yes
---

# Cycle 0038 Retro — ShadowTrieORSet

**Status:** HILL MET

## Hill

Define and ship the first truthful async trie-backed ORSet engine:

- not a fake sync subtype
- not a public domain seam
- not a cache/cursor port leak

## What ground was taken

### The async engine now exists

[ShadowTrieORSet.ts](/Users/james/git/git-stunts/git-warp/src/domain/orset/shadow/ShadowTrieORSet.ts)
now exists as a concrete storage-backed ORSet engine over the trie substrate.

It owns the honest async behavior surface for this slice:

- `contains()`
- `getDots()`
- `add()`
- `remove()`
- `scan()`
- `flush()`

That is the core win of the cycle.

### The session seam stayed honest

The engine constructor consumes:

- a `TrieCursor`
- a `TrieFlusher`

It does **not** allocate its own cache, and it does **not** publish cursor or
cache abstractions upward. That preserves the `StateSession` ownership law set
earlier in the lane.

### The scan path is now actually async all the way down

The first green cut briefly had `ShadowTrieORSet.scan()` wrapping
`TrieCursor.elements()`, which would have been stream-shaped over a buffered
array.

That was corrected in the same cycle:

- [TrieCursor.ts](/Users/james/git/git-stunts/git-warp/src/domain/orset/trie/TrieCursor.ts)
  now has a real async scan walk
- `elements()` now collects from that walk instead of owning the traversal
- `ShadowTrieORSet.scan()` delegates to the cursor’s async iterator directly

That correction matters because `v17` is explicitly trying to burndown the
bounded-residency ORSet line, not just rename it.

### The engine is protected by a focused red/green matrix

[ShadowTrieORSet.test.ts](/Users/james/git/git-stunts/git-warp/test/unit/domain/orset/shadow/ShadowTrieORSet.test.ts)
now covers:

- constructor invariants
- empty-engine behavior
- add/remove/getDots/contains
- async scanning
- flush/reopen round-trip
- split-geometry reachability
- invalid input and delegated store failure paths

## Verification

Passed:

- `npm exec vitest run test/unit/domain/orset/shadow/ShadowTrieORSet.test.ts test/unit/domain/orset/trie/TrieCursor.test.ts test/unit/domain/orset/trie/TrieFlusher.test.ts test/unit/domain/orset/trie/PageCache.test.ts`
- `npm run typecheck`
- `git diff --check`

Key witness commits:

- `7fe7c3da` — `docs(design): pull shadow trie orset cycle`
- `f366af01` — `test(orset): add shadow trie orset reds`
- `39e045fc` — `feat(orset): add shadow trie orset engine`
- `a03eeb25` — `refactor(trie): stream cursor-backed scans`

## Playback

### Agent

1. *Is `ShadowTrieORSet` now a truthful async engine instead of a fake parent
   seam?*
   Yes.
2. *Does `scan()` avoid the old “stream-shaped over buffered array” lie?*
   Yes.
3. *Is `StateSession` still the next owner-facing seam instead of the engine
   leaking outward?*
   Yes.

### Human

The cycle succeeded because it kept the shape small and honest. It did not try
to solve session lifecycle or compaction early; it just made the async engine
real.

## Drift

The only additive drift was introducing
[ShadowTrieORSetError.ts](/Users/james/git/git-stunts/git-warp/src/domain/errors/ShadowTrieORSetError.ts).

That turned out to be the right move because constructor validation is a real
engine-owned invariant and did not belong on `TrieCursorError`.

No negative drift undercut the hill.

## Cycle-end upkeep

The pulled backlog card is gone. Repo-truth follow-through for this cycle is:

- mark `PROTO_shadow-trie-orset` done in the `v17` release ledger
- update the ORSet seam inventory to show `src/domain/orset/shadow/` as landed
- leave `PROTO_trie-compaction` as the next direct trunk task

## What remains

This cycle did **not** do:

- trie compaction
- semilattice proof work
- `StateSession` lifecycle
- reducer / GC / materialize integration

That is correct. The next honest follow-through is:

1. `PROTO_trie-compaction`
2. `PROTO_state-session-async`
3. `PROTO_materialize-integration`
