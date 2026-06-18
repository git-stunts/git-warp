---
title: "WARP drift ledger crosslinks"
cycle: "0036-warp-drift-ledger-crosslinks"
design_doc: "docs/design/0036-warp-drift-ledger-crosslinks.md"
outcome: hill-met
drift_check: yes
---

# Cycle 0036 Retro — WARP Drift Ledger Crosslinks

**Status:** HILL MET

## Hill

Make [`docs/audits/WARP_DRIFT.md`](../../../audits/WARP_DRIFT.md)
point readers at the canonical post-`0035` runtime/doctrine surfaces without
turning the audit into a duplicate of those docs.

## What ground was taken

### The drift ledger now points at the wall-chart

`WARP_DRIFT.md` now says explicitly that it is the drift ledger, not the
canonical noun wall-chart or the full runtime architecture guide.

It now links directly to:

- [docs/GLOSSARY.md](../../../GLOSSARY.md)
- [0035-observer-geometry-architecture-ladder.md](../../../design/0035-observer-geometry-architecture-ladder.md)
- [release-horizon-v20-v21.md](../../../design/release-horizon-v20-v21.md)

That means a reader can now start at the drift audit and reach the noun
wall-chart, the runtime ladder, and the later-major framing in one hop.

### The audit stayed a ledger instead of becoming a second design doc

This cycle did not pour the glossary or the ladder back into the audit.

That restraint matters. The useful shape is:

- audit = problem ledger
- glossary = noun source of truth
- `0035` = runtime architecture ladder
- horizon note = later-major framing

The cycle succeeded because it kept those responsibilities distinct.

### The crosslink contract is now ratcheted

The cycle added
`test/unit/scripts/warp-drift-crosslinks-shape.test.ts` so the repo would fail
loudly if those crosslinks disappeared later.

That historical ratchet has since been retired. Current successor coverage lives
at
[warp-drift-doc-graph.test.ts](../../../../test/unit/scripts/warp-drift-doc-graph.test.ts).

For a small docs hygiene slice, that is the right outcome: the fix is now
structural instead of purely editorial.

## Verification

Passed at cycle close:

- `git diff --check`
- `npm exec vitest run test/unit/scripts/warp-drift-crosslinks-shape.test.ts test/unit/scripts/glossary-shape.test.ts test/unit/scripts/observer-geometry-ladder-shape.test.ts`

Current successor coverage:

- `npm exec vitest run test/unit/scripts/warp-drift-doc-graph.test.ts test/unit/scripts/glossary-shape.test.ts test/unit/scripts/observer-geometry-ladder-shape.test.ts`

Key witness commits:

- `bf316356` — `docs(design): pull warp drift crosslink cycle`
- `8fce2c95` — `docs(audit): crosslink warp drift ledger`

## Playback

### Agent

1. *If I start at `WARP_DRIFT.md`, can I find the canonical noun wall-chart in one hop?*
   Yes.
2. *Can I find the runtime architecture ladder in one hop?*
   Yes.
3. *Can I tell the difference between the audit, the glossary, and the ladder?*
   Yes.

### Human

The cycle did the small thing it was supposed to do. The audit now feels
connected to the glossary and the runtime ladder instead of freezing the repo’s
drift story before `0035`.

## Drift

No negative drift.

The only additive drift was that the docs change immediately got a ratchet
test. That improves the slice instead of changing its meaning.

## Cycle-end upkeep

The source `up-next` card was removed when the cycle was pulled. The remaining
queued follow-through is still:

- PROTO_remaining-warp-drift-release-slotting.md

That is the right next cycle because this one connected the audit to the wall
chart, but it did not yet sort the remaining unresolved drift across `v19`,
`v20`, and `v21`.

## What remains

This cycle did not resolve the remaining WARP drift.

It made the repo harder to misread by connecting the audit to the canonical
surfaces that now own:

- noun meaning
- runtime architecture direction
- later-major horizon framing

What remains is the next-order design question: after the observer/read-side
ladder, where do the remaining strand, braid, and admission drifts actually
land in the release schedule?
