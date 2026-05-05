---
title: "Encapsulate ORSet internals behind contract methods on the concrete class"
cycle: "0024-orset-internal-encapsulation"
design_doc: "docs/design/0024-orset-internal-encapsulation/orset-internal-encapsulation.md"
outcome: hill-met
drift_check: yes
---

# Cycle 0024 Retro — ORSet Internal Encapsulation

**Status:** HILL MET

## Hill

Zero reads of `orset.entries` or `orset.tombstones` in any source
file outside `src/domain/crdt/ORSet.ts`. Concrete `ORSet` exposes
five new methods. Consumers stay typed to `ORSet`. No abstract
parent.

## What ground was taken

### New methods on `src/domain/crdt/ORSet.ts`

- `hasDot(element, encodedDot): boolean` — raw entry membership.
- `isTombstoned(encodedDot): boolean` — pure tombstone lookup.
- `entriesIter(): IterableIterator<[string, ReadonlySet<string>]>` —
  yields pairs with the inner set marked readonly to prevent
  consumer mutation.
- `entryDotsIter(): IterableIterator<string>` — flattens dots across
  all entries.
- `scopedClone(includeElement): ORSet` — predicate-filtered clone
  that preserves all tombstones verbatim (matches prior
  `VisibleStateScope.cloneScopedOrSet` semantics).

### Consumer rewrites (4 files)

- `DiffCalculator.buildDotToElement` → `entriesIter()`
- `ReceiptBuilder.hasEffectiveRemoval` → `isTombstoned(...)`
- `ReceiptBuilder.nodeAddOutcome` / `edgeAddOutcome` →
  `hasDot(x, y)`
- `CheckpointSerializer.computeAppliedVV` → `entryDotsIter()`
- `VisibleStateScope` → `scopedClone(predicate)` for the clone
  case, plus `.elements()` for the scope-collection loops that
  were iterating keys and then filtering by `.contains()`.

### What stayed

- `ORSet.entries` and `ORSet.tombstones` public fields are
  preserved on the concrete class. Tests inspect them directly and
  the `ImmutableSnapshot` cloner walks them by generic shape via
  its cloneImmutableObjectValue path. The contract is a source-
  consumer seam, not an all-reads seam.

## Playback

### Agent

1. *Does any source file outside `src/domain/crdt/ORSet.ts` read
   `orset.entries` or `orset.tombstones`?* No — `rg` confirms zero
   matches in `src/` outside the ORSet module.
2. *Do the four consumer files still type against concrete
   `ORSet`?* Yes — none were retyped to an abstract parent.
3. *Are tests unchanged?* Yes — 6321/6321 pass, same tests, no
   behavior modifications.
4. *Do the new methods introduce any `any`, `unknown`, `as`, or
   `*Like`?* No. All returns are concrete (`boolean`, `number`,
   `IterableIterator<...>`, `Set<string>`, `ORSet`).

### Human

Deferred to review.

## Design decisions locked

- **No abstract parent class.** The `ORSetLike` attempt in cycle
  0023 taught us that a sync-in-memory parent with one
  implementation forever is shape-shaped sludge. Methods on the
  concrete class achieve the same encapsulation without the
  ceremony.
- **ReadonlySet in `entriesIter()`.** The yielded dot sets are
  marked `ReadonlySet<string>` so consumers cannot mutate entries
  by accident through the iterator. The underlying `Set<string>`
  on the ORSet can still be mutated by `ORSet` methods themselves
  via the private path.
- **`scopedClone` preserves all tombstones.** Not just the ones
  matching the predicate — this matches what the pre-existing
  `VisibleStateScope.cloneScopedOrSet` did. Floating tombstones
  survive scope projection, which is the correct CRDT semantic.
- **`.elements()` replaces `entries.keys() + contains()`.** Two
  consumer loops in `VisibleStateScope` iterated keys and then
  filtered by liveness. `.elements()` returns only live entries,
  which is what the loops actually wanted.

## Drift

- None. The implementation stayed inside the backlog item's scope.
- `IncrementalIndexUpdater`'s `WarpStateLike` duck type was
  explicitly punted to cycle 0025C (fake-model purge) as the
  design doc's "Out" section called for.

## New debt

- None introduced. Cycle 0025C will remove the quarantined `OpLike`
  / `PatchLike` / `WarpStateLike` family around the patch-
  application pipeline as part of the Op-model introduction —
  that's already-planned cleanup in the successor cycle, not new
  debt from this one.

## What comes next

- **Cycle 0025A-D** — the anti-sludge paydown is the main thing
  standing in the next queue. The seam work in cycle 0024 has no
  direct blockers left; `PROTO_state-session-async`
  (the StateSession async contract) is unblocked but depends on
  the broader trie work (`PROTO_shadow-trie-orset`,
  `PROTO_trie-codec-and-geometry`, etc.).
- **Seam README update** — no change required; the README already
  reflects cycle 0023's outcome and does not reference a removed
  ORSetLike.

## Backlog maintenance

- [x] `PROTO_orset-internal-encapsulation` backlog item removed at
      cycle open (content absorbed into design doc).
- [x] No stale references to the deleted backlog item remain.
