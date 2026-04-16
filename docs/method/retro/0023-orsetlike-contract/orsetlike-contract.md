---
title: "Extract ORSetLike contract from concrete ORSet and retype consumers"
cycle: "0023-orsetlike-contract"
design_doc: "docs/design/0023-orsetlike-contract/orsetlike-contract.md"
outcome: not-met
drift_check: yes
---

# Cycle 0023 Retro — ORSetLike Contract

**Status:** NOT MET (premise invalid)

## Hill

`ORSetLike` abstract class lives at `src/domain/orset/ORSetLike.ts`.
`ORSet` extends it. Every consumer that today types against the
concrete `ORSet` class is retyped to `ORSetLike`. Internal-field
leaks eliminated.

## What actually happened

Cycle opened with the backlog item's wording in hand: "define an
`ORSetLike` abstract class or interface ... synchronous, in-memory
contract." Design doc locked a 16-method surface. `ORSetLike.ts`
written. `ORSet` made to extend it. Consumer retyping started.

Mid-retype, the user flagged: **`ORSetLike` is sludge.**

## Why the premise was wrong

Per SSTS (`docs/SYSTEMS_STYLE_TYPESCRIPT.md`), domain concepts must
be **runtime-backed**. An abstract class is technically runtime-backed.
But "runtime-backed" is necessary, not sufficient. The question
behind the class is: *does this abstraction correspond to a real
plurality of runtime forms?*

- The abstract class captures a **synchronous, in-memory** contract.
- The only existing impl is `ORSet`.
- The cycle's own design explicitly says `ShadowTrieORSet` is
  **async**, lives **behind `StateSession`**, and does **NOT**
  implement `ORSetLike`.
- Therefore `ORSetLike` has exactly one implementation — now and
  forever. It is a fake parent class for a single concrete type.

That is the exact pattern SSTS calls out: *"an `interface` that
erases at runtime is not an authoritative contract"* — and in our
case, an abstract class **with one impl** is the same pathology
dressed in runtime clothing. A seam between representations that
doesn't actually span two representations is a ceremony, not a seam.

The `-Like` suffix was the giveaway. Systems-style names describe
what a thing **is**, not what it vaguely resembles. The name itself
was telling us the abstraction didn't have a real referent.

## The real seam

The genuine cut between representations is **`StateSession`** (async,
domain-facing). That is where trie-backed state enters the program.
`ORSet` stays concrete on the sync side; `ShadowTrieORSet` stays
concrete on the trie side; `StateSession` arbitrates. No phantom
intermediate class.

## What ground was actually taken

Before reversing, the cycle did identify and fix a real problem:
consumers were reaching directly into `orset.entries` and
`orset.tombstones` (private-ish internals leaking through public
fields). This ossification is real, regardless of how many
implementations exist.

The corrective work — clean contract methods on concrete `ORSet`
and leak-elimination in the consumer bodies — lands in cycle 0024
(`PROTO_orset-internal-encapsulation`). No abstract parent. Concrete
class. Consumers type against `ORSet`.

## What was reverted

- `src/domain/orset/ORSetLike.ts` — deleted (never committed).
- `ORSet extends ORSetLike` — reverted to plain class.
- `join(other: ORSetLike)` — narrowed back to `join(other: ORSet)`.
- `tombstonesIter`, `_mergeEntriesFromIter`, `_unionFromIter`
  helpers that existed only to support the widened `join` — removed.
- `ORSetLike` import churn across WarpState, traversalHelpers —
  fully reverted.

The reversion is a single dirty working tree (no commits survived
the bad premise).

## What was kept (pending 0024 commit)

- New methods on concrete `ORSet`: `hasDot`, `isTombstoned`,
  `entriesIter`, `entryDotsIter`, `scopedClone`.
- Leak elimination in consumers: `DiffCalculator`, `ReceiptBuilder`,
  `VisibleStateScope`, `CheckpointSerializer` all stopped touching
  `orset.entries` / `orset.tombstones` directly.

These land in cycle 0024 with a clean premise.

## Playback

### Agent

1. *Was there more than one candidate implementation of the
   abstract contract?* No. `ORSet` was the only impl.
   `ShadowTrieORSet` is async, lives behind a different seam.
2. *Did the `-Like` suffix indicate a real domain concept?* No.
   It indicated a shape-shaped hole where a concept should be.
3. *Did eliminating internal-field leakage require an abstract
   parent?* No. Methods on the concrete class achieve the same
   encapsulation without the fake seam.

### Human

Deferred to review.

## Drift

- **Scope drift.** The backlog item said "abstract class **or**
  interface." That "or" hid the real question: *should this
  abstraction exist at all?* Neither form was right, because the
  abstraction itself was wrong.
- Compounding factor: cycle 0018's design doc explicitly carved
  `ORSetLike` into the seam plan. The backlog item inherited that
  carve without re-examining it after cycle 0020 (which rejected the
  related `warp-orset` extraction on similar grounds). Both cycles
  now agree: the real seams are `StateSession` (async) and —
  later — the publish pipeline, not sync-in-memory parent classes.

## New debt

- **0018 design doc references `ORSetLike`.** The Shadow-Trie design
  doc references `ORSetLike` as part of the seam plan. That
  reference needs updating when 0024 lands to reflect "concrete ORSet
  on the sync side; `StateSession` is the real seam."
- **`src/domain/orset/README.md` was scoped to include
  `ORSetLike.ts`.** Already updated in-flight to mark the entry as
  "✗ cycle 0023 (not-met)" — the README keeps `crdt/ORSet.ts` plus
  future `trie/`, `session/`, `shadow/` entries.

## What comes next

- **Cycle 0024: `PROTO_orset-internal-encapsulation`** — ship the
  actual encapsulation with no fake abstract.
- **Backlog: 0018 Shadow-Trie design doc update** — reconcile the
  seam plan with the 0023 diagnosis.
- **Bad-code: `IncrementalIndexUpdater.ts` `Record<string, unknown>`
  and `WarpStateLike` duck type** — surfaced during 0023, filed
  separately so 0024 stays focused.

## Backlog maintenance

- [x] Seam README updated (marks `ORSetLike.ts` as not-met)
- [x] Successor backlog item filed
       (`PROTO_orset-internal-encapsulation` in up-next/)
- [x] Bad-code item filed for IncrementalIndexUpdater sludge
