---
title: "WARP drift ledger crosslinks"
cycle: "0036-warp-drift-ledger-crosslinks"
---

# WARP Drift Ledger Crosslinks

## Why this exists

Cycle `0035` created the missing wall-chart for the repo’s current
observer/read-side doctrine:

- `docs/GLOSSARY.md`
- `docs/design/0035-observer-geometry-architecture-ladder.md`
- `docs/design/release-horizon-v20-v21.md`

The drift ledger in [WARP_DRIFT.md](../audits/WARP_DRIFT.md) still describes the
problem accurately, but it does not yet point readers at those new canonical
surfaces.

That leaves the repo with two correct but partially disconnected doc islands:

- the drift diagnosis
- the noun/runtime ladder

This cycle closes that gap.

## Hill

A reader who starts from `docs/audits/WARP_DRIFT.md` can now find:

- the canonical noun source of truth
- the observer/read-side runtime ladder
- the later-major horizon framing

without having to already know that cycle `0035` happened.

## Design goals

1. Keep `WARP_DRIFT.md` as the doctrinal problem ledger.
2. Make the audit explicitly point to the new wall-chart artifacts.
3. Do this without rewriting the audit into a duplicate of the ladder docs.
4. Keep the boundary clear:
   - audit = drift ledger
   - glossary = noun source of truth
   - `0035` = runtime architecture ladder
   - horizon note = later-major framing

## Non-goals

- No new doctrine.
- No attempt to rewrite the entire audit in this cycle.
- No change to release-lane ownership.

## What should change

### 1. Canonical noun crosslink

`WARP_DRIFT.md` should explicitly point to:

- `docs/GLOSSARY.md`

This tells readers where the repo now keeps the canonical meaning of:

- `Observer`
- `Aperture`
- `Worldline`
- `Witness`
- `GraphDiff`
- related read/runtime nouns

### 2. Runtime ladder crosslink

The audit should explicitly point to:

- `docs/design/0035-observer-geometry-architecture-ladder.md`

This tells readers where the repo now says:

- what runtime machinery is missing
- what the architectural ladder is
- which backlog items implement that ladder

### 3. Horizon crosslink

The audit should point to:

- `docs/design/release-horizon-v20-v21.md`

This does not make the audit responsible for future release planning. It only
gives readers the answer to:

> where do the unresolved observer/read-side and distributed/runtime drifts
> likely land after `v19`?

### 4. Keep the audit as a ledger, not a tutorial

The cycle should resist the temptation to pour the full glossary or ladder into
the audit itself.

The right shape is:

- short explicit crosslinks
- small scope notes where needed
- preserve the audit’s role as the problem ledger

## Candidate edit sites in `WARP_DRIFT.md`

The most likely places to touch are:

- the “Backlog capture status” section
- the “Relevant design context” section
- the “Practical rule” close, if a short glossary/ladder pointer helps

## Playback questions

### Agent

- If I start at `WARP_DRIFT.md`, can I find the canonical noun wall-chart in one
  hop?
- Can I find the runtime architecture ladder in one hop?
- Can I tell the difference between the audit, the glossary, and the ladder?

### Human

- Does the audit now feel connected to the newer design work instead of frozen
  before it?
- Does the crosslinking improve discoverability without turning the audit into a
  duplicate of the design docs?

## Test plan

This is a docs-only cycle. The red/green contract should be:

### Golden path

- `WARP_DRIFT.md` references:
  - `docs/GLOSSARY.md`
  - `docs/design/0035-observer-geometry-architecture-ladder.md`
  - `docs/design/release-horizon-v20-v21.md`
- the links resolve to tracked files

### Edge cases

- the audit still reads like a drift ledger rather than a glossary dump
- the crosslinks appear in the “relevant context” / “backlog status” surfaces,
  not buried in one stray paragraph

### Known failure modes

- crosslink only one of the three artifacts, leaving the wall-chart incomplete
- rewrite the audit so heavily that it duplicates `0035`
- add release-horizon claims to the audit without keeping the horizon note as
  the authoritative source

## Playback

### Witness

The witness for this cycle is small and explicit:

- `docs/audits/WARP_DRIFT.md` now points to:
  - `docs/GLOSSARY.md`
  - `docs/design/0035-observer-geometry-architecture-ladder.md`
  - `docs/design/release-horizon-v20-v21.md`
- the audit now says directly that it is the drift ledger rather than the
  canonical wall-chart
- the ratchet coverage exists at
  `test/unit/scripts/warp-drift-doc-graph.test.ts`

Verification command:

```sh
npm exec vitest run \
  test/unit/scripts/warp-drift-doc-graph.test.ts \
  test/unit/scripts/glossary-shape.test.ts \
  test/unit/scripts/observer-geometry-ladder-shape.test.ts
```

### Agent playback

Question:

> If I start at `WARP_DRIFT.md`, can I find the canonical noun wall-chart in
> one hop?

Answer:

Yes.

Question:

> Can I find the runtime architecture ladder in one hop?

Answer:

Yes.

Question:

> Can I tell the difference between the audit, the glossary, and the ladder?

Answer:

Yes. The audit now says explicitly that it is the drift ledger, while the
glossary and ladder own the noun/runtime explanation surfaces.

Verdict: pass.

### Human playback

Question:

> Does the audit now feel connected to the newer design work instead of frozen
> before it?

Answer:

Yes.

Question:

> Does the crosslinking improve discoverability without turning the audit into a
> duplicate of the design docs?

Answer:

Yes. The change stayed small and left the audit readable as a ledger instead of
  a glossary dump.

Verdict: pass.

## Drift check

No meaningful drift.

This cycle did exactly what it said it would:

- add the crosslinks
- preserve the audit’s role
- ratchet the doc contract

The only mild additive drift is that the ratchet test landed immediately,
turning the small docs hygiene slice into a protected docs hygiene slice. That
is a net improvement, not a contradiction.
