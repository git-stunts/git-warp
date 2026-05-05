---
title: "Remaining WARP drift release slotting"
cycle: "0037-remaining-warp-drift-release-slotting"
design_doc: "docs/design/0037-remaining-warp-drift-release-slotting.md"
outcome: hill-met
drift_check: yes
---

# Cycle 0037 Retro — Remaining WARP Drift Release Slotting

**Status:** HILL MET

## Hill

Sort the unresolved WARP drift honestly across `v19`, `v20`, and `v21` so the
repo no longer treats the remaining doctrine/runtime work as one mushy future
bucket.

## What ground was taken

### The remaining drift now has release homes

[0037-remaining-warp-drift-release-slotting.md](../../../design/0037-remaining-warp-drift-release-slotting.md)
now says, plainly:

- `v19` owns doctrine/runtime correction and the first honest
  observer/admission surfaces
- `v20` owns operational slice-first runtime realization
- `v21` owns plural/distributed semantics such as common-basis braid and
  fuller admission reality

That is the practical center of the cycle.

### The drift ledger now knows about the slotting note

[WARP_DRIFT.md](../../../audits/WARP_DRIFT.md)
now points to `0037` as part of the relevant design context instead of stopping
at the glossary, ladder, and horizon.

That matters because `0036` solved discoverability for the wall-chart. `0037`
solved discoverability for the release split.

### The release horizon now says the split out loud

[release-horizon-v20-v21.md](../../../design/release-horizon-v20-v21.md)
now references `0037` directly and includes an explicit slotting rule section.

That turns the horizon from a reasonable sketch into a more disciplined
planning surface.

### The `v19` lane now says where its responsibility ends

[docs/method/backlog/v19.0.0/README.md](../../backlog/v19.0.0/README.md)
now includes a `Release handoff` section so the lane itself records:

- what `v19` owns
- what `v20` owns
- what `v21` owns

That keeps `v19` from silently inflating into “everything after `v18`.”

## Verification

Passed:

- `git diff --check`
- `npm exec vitest run test/unit/scripts/warp-drift-release-slotting-shape.test.ts test/unit/scripts/warp-drift-crosslinks-shape.test.ts test/unit/scripts/glossary-shape.test.ts test/unit/scripts/observer-geometry-ladder-shape.test.ts`

Key witness commits:

- `10387c11` — `docs(design): pull remaining warp drift slotting cycle`
- `5038ceca` — `test(docs): add warp drift slotting reds`
- `3c6351fc` — `docs(drift): slot remaining warp drift across releases`

## Playback

### Agent

1. *Can I tell which unresolved drift items are `v19`, `v20`, and `v21`
   work?*
   Yes.
2. *Does the split preserve the `v18` / `v19` release law?*
   Yes.
3. *Does the repo now have one explicit answer to “what remains after the
   observer/read-side ladder?”*
   Yes.

### Human

The cycle succeeded because it did not try to solve the drift. It sorted it.

That makes later planning less confusing and keeps the release schedule from
collapsing back into vague future-parity language.

## Drift

The drift was additive and correct:

- the slotting law propagated into the drift ledger
- the horizon note was sharpened
- the `v19` lane README now records the handoff boundary

No negative drift undercut the hill.

## Cycle-end upkeep

No new backlog notes were required to keep the split honest.

The existing promoted `v19` ladder items remain the right next-order work, and
the existing horizon note plus `up-next` backlog still provide enough planning
surface for later-major follow-through.

## What remains

This cycle did not resolve strand semantics, braid/common-basis semantics, or
full witnessed admission reality.

It made their release homes explicit.

That is enough to return to normal backlog hygiene with a cleaner answer to:

- what still belongs in `v19`
- what must wait for `v20`
- what should stay in `v21`
