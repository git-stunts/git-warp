---
title: "Reality check for PROTO_orsetlike-contract"
legend: "PROTO"
cycle: "0032-orsetlike-contract-reality-check"
source_backlog: "docs/method/backlog/v17.0.0/PROTO_orsetlike-contract.md"
---

# Reality check for PROTO_orsetlike-contract

Source backlog item:
`docs/method/backlog/v17.0.0/PROTO_orsetlike-contract.md`
Legend: PROTO

## Sponsors

- Human: Backlog operator
- Agent: Implementation agent

## Hill

Determine whether `PROTO_orsetlike-contract` still represents real
open work in `v17.0.0`.

This cycle is intentionally a repo-truth validation cycle:

- write the design/checklist for what would have to be true for the
  backlog item to still be valid
- skip implementation
- go straight to playback against the current code, backlog, and prior
  cycle records

The hill is met only if one of these is true:

1. `ORSetLike` is still a necessary, honest abstraction that unlocks
   remaining `v17` work, or
2. current repo truth already satisfies the real need behind the note,
   making the note safe to retire or rewrite without new code.

## Playback Questions

### Human

- [ ] Is there any remaining value in a synchronous `-Like` parent
      abstraction once `StateSession` is the async seam and `ORSet`
      stays the only sync in-memory implementation?
- [ ] If the code already took the real encapsulation ground, is the
      remaining work now backlog/doc cleanup rather than TypeScript
      implementation?

### Agent

- [ ] Is there more than one honest synchronous in-memory runtime form
      that could implement `ORSetLike`?
- [ ] Does any `src/` consumer still require `ORSetLike` to eliminate
      direct reads of `ORSet.entries` or `ORSet.tombstones`?
- [ ] Does `src/` contain any surviving `ORSetLike` symbol or parent
      abstraction?
- [ ] Do the live backlog and release docs consistently agree with the
      cycle 0023 / 0024 outcome?

## Accessibility and Assistive Reading

- Linear truth posture: the document distinguishes code truth from
  backlog truth, then asks whether they still agree.
- No visual assumptions.

## Localization and Directionality

- None.

## Agent Inspectability and Explainability

- Every judgment in playback must point to a concrete file, not to
  memory.
- A "pass" is allowed only if the repo's source and planning docs agree.
- A "fail" must identify whether the failure is code debt or
  documentation/backlog drift.

## Non-goals

- [ ] No `ORSetLike` implementation.
- [ ] No source-code edits in `src/` for this cycle unless playback
      proves the note is still technically real.
- [ ] No `StateSession` or `ShadowTrieORSet` implementation work.
- [ ] No package extraction work.

## Backlog Context

The live `v17` note still says:

- introduce `ORSetLike` as the synchronous in-memory seam
- make `ORSet` implement or extend that contract
- retype consumers to the contract instead of the concrete class

But repo history already contains two relevant cycles:

- cycle 0023 closed `ORSetLike` as `not-met` because the abstraction
  had one implementation forever and was therefore sludge
- cycle 0024 shipped the real value: concrete `ORSet` methods that
  removed consumer leaks without introducing the fake parent

This cycle exists to resolve that contradiction against current repo
truth before anyone spends more implementation time on the stale note.

## Problem

`PROTO_orsetlike-contract` still exists as a live blocker in the `v17`
lane, but the repository already teaches the opposite lesson in
multiple authoritative places.

If the note is truly still open, we need to know exactly what source
work remains.

If the note is stale, we need to know exactly which live planning docs
still depend on the stale story.

## Fix

Treat this as a reality-check cycle, not a coding cycle.

1. Inspect the current concrete `ORSet` surface.
2. Inspect the main source consumers that previously leaked internals.
3. Inspect the cycle 0023 and 0024 records.
4. Inspect live backlog / release docs that still mention
   `ORSetLike`.
5. Decide whether the remaining gap is:
   - real source work, or
   - stale backlog/doc language

## Evidence targets

### Source of truth in code

- `src/domain/crdt/ORSet.ts`
- `src/domain/services/DiffCalculator.ts`
- `src/domain/services/ReceiptBuilder.ts`
- `src/domain/services/VisibleStateScope.ts`

### Prior cycle truth

- `docs/method/retro/0023-orsetlike-contract/orsetlike-contract.md`
- `docs/method/retro/0024-orset-internal-encapsulation/orset-internal-encapsulation.md`
- `src/domain/orset/README.md`
- `docs/ANTI_SLUDGE_DECISIONS.md`

### Live planning truth

- `docs/method/backlog/v17.0.0/PROTO_orsetlike-contract.md`
- `docs/design/0040-state-session-async.md`
- `docs/design/0038-shadow-trie-orset.md`
- `docs/design/0042-gc-state-session.md`
- `docs/releases/v17.0.0/README.md`

## Expected pass/fail semantics

### Pass

Playback passes if:

- no source work remains for `ORSetLike`
- the real encapsulation work already landed on concrete `ORSet`
- and live backlog/release docs no longer depend on `ORSetLike` as a
  future seam

In that case the note can be retired or rewritten with no further
implementation.

### Fail

Playback fails if either:

- source still needs a real abstraction, or
- source no longer needs it but live planning docs still model it as
  future work

The second case is still a real failure because it corrupts the
dependency graph even without code debt.

## Playback results

### Agent

1. *Is there more than one honest synchronous in-memory runtime form
   that could implement `ORSetLike`?*
   No. Current repo truth still has exactly one sync in-memory form:
   concrete `ORSet`. `ShadowTrieORSet` is async behind `StateSession`,
   exactly as cycle 0023 said.

   Evidence:
   - `docs/method/retro/0023-orsetlike-contract/orsetlike-contract.md`
   - `src/domain/orset/README.md`

2. *Does any `src/` consumer still require `ORSetLike` to eliminate
   direct reads of `ORSet.entries` or `ORSet.tombstones`?*
   No. The leak-replacement methods already exist on concrete `ORSet`:
   `hasDot`, `isTombstoned`, `entriesIter`, `entryDotsIter`,
   `scopedClone`. The consumer sites inspected in this cycle use those
   concrete methods.

   Evidence:
   - `src/domain/crdt/ORSet.ts`
   - `src/domain/services/DiffCalculator.ts`
   - `src/domain/services/ReceiptBuilder.ts`
   - `src/domain/services/VisibleStateScope.ts`
   - `docs/method/retro/0024-orset-internal-encapsulation/orset-internal-encapsulation.md`

3. *Does `src/` contain any surviving `ORSetLike` symbol or parent
   abstraction?*
   No. Current `src/` truth has no `ORSetLike` symbol at all.

4. *Do the live backlog and release docs consistently agree with the
   cycle 0023 / 0024 outcome?*
   Not fully.

   Initial playback found conflicts in:
   - `docs/method/backlog/v17.0.0/PROTO_orsetlike-contract.md`
   - `docs/design/0040-state-session-async.md`
   - `docs/design/0038-shadow-trie-orset.md`
   - `docs/design/0042-gc-state-session.md`
   - `docs/releases/v17.0.0/README.md`

   During cycle close, the downstream backlog items and release ledger
   were updated to use the truthful nouns:
   - concrete `ORSet` on the synchronous in-memory side
   - `StateSession` as the async domain-facing seam
   - `ShadowTrieORSet` as an internal engine

   The remaining contradiction is the source backlog note itself:
   - `docs/method/backlog/v17.0.0/PROTO_orsetlike-contract.md`

   That note was intentionally left in place for historical continuity
   in this cycle, per operator direction.

### Human

Deferred to review.

## Result

**Playback status: PARTIAL**

The unresolved issue is **not** missing TypeScript implementation work.

Most downstream planning docs now use the correct nouns. The remaining
inconsistency is that the source backlog note still encodes the rejected
`ORSetLike` seam premise.

## What work remains if we honor repo truth

1. Rewrite or reclassify `PROTO_orsetlike-contract` itself when the
   operator wants the lane graph to fully align with repo truth.
2. Keep successor planning docs on the current truthful model:
   - concrete `ORSet` on the sync side
   - `StateSession` as the domain-facing async seam
   - `ShadowTrieORSet` as an internal engine behind the session
3. Remove any remaining dependency edges that treat `ORSetLike` as an
   unlock once the source note is reconciled.

## Drift

- This cycle deliberately skipped RED/green because the point was to
  validate whether implementation should exist at all.
- The backlog note turned out to be a graph-truth problem, not a code
  problem.
- The cycle closed with downstream noun cleanup landed, while the
  source note itself was intentionally preserved.
