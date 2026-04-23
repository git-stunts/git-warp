---
title: "Close the remaining big files card now that the named files are already below the threshold"
cycle: "0058-remaining-big-files-closeout"
---

# Close Remaining Big Files

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

`GOD_remaining-big-files` is now stale in the same way `0056` was stale:

- the note still claims four `808–835` LOC gods
- repo truth now says those files are:
  - `StreamingBitmapIndexBuilder.ts` — `277` LOC
  - `AuditVerifierService.ts` — `136` LOC
  - `VisibleStateComparison.ts` — `172` LOC
  - `TrustAssessment.ts` — `52` LOC
- cycle `0057` already closed the only still-serious index-builder residue by
  moving it onto a real streaming git-cas seam
- the remaining open work now belongs to narrower owner notes, not to a fake
  live god-slaying card

As long as this stale card stays live, `API_migrate-consumers-to-capabilities`
keeps pretending it is blocked on a god that no longer exists.

## Hill

A contributor can tell, from repo truth alone, that the
`GOD_remaining-big-files` card is obsolete, that the API migration is no longer
blocked on it, and that any surviving residue has already moved under the real
owner notes.

## Playback questions

### Agent

- Can I point to the current file sizes and the `0057` outcome to show the
  card is obsolete?
- Do downstream notes stop teaching `GOD_remaining-big-files` as a live
  blocker?
- Does the release ledger explain where the real remaining residue lives?

### Human

- Is it obvious why this closes a god card without another refactor pass?
- Is it obvious that the remaining work is narrower than "big files" and
  already tracked elsewhere?

## Accessibility / assistive reading posture

Relevant. The release ledger and workload view should read cleanly without code
archeology.

## Localization / directionality posture

Not especially relevant. This is planning-truth maintenance.

## Agent inspectability / explainability posture

Relevant. The cycle should leave explicit evidence:

- current file sizes
- the `0057` closeout of the remaining streaming index-builder residue
- updated blocker graphs
- release/workload ledgers that no longer teach the dead god

## Non-goals

- No new `StreamingBitmapIndexBuilder` refactor in this cycle
- No fresh comparison or audit rewrite in this cycle
- No bad-code retirement sweep outside the direct closeout surface

## Core diagnosis

The old card bundled two different concerns:

1. large-file splitting
2. narrower residue inside the former large files

The first concern is already materially done. The second now belongs to the
real residue owners:

- `CORE_streaming-memory-audit` for remaining bounded-residency work
- `PROTO_purge-boundary-leaks` for raw-shape and comparison/index boundary debt

## Design

### 1. Remove the stale god card from the live lane

The live backlog note should leave `v17`.

### 2. Update the release and workload ledgers

They should stop presenting `GOD_remaining-big-files` as active work and stop
treating it as a blocker inside `WL-37`.

### 3. Re-home the remaining residue explicitly

The closeout should point at:

- `CORE_streaming-memory-audit`
- `PROTO_purge-boundary-leaks`

### 4. Remove fake downstream blockers

Tasks that still name `GOD_remaining-big-files` in `blocked_by` or `blocks`
should be updated to reflect repo truth.

## Test plan

### RED

Add a doc-shape ratchet that fails until:

- the `v17` release ledger explains why the god card is closed
- the stale live note and `WL-37` entry are gone
- downstream notes stop naming the dead god as an active blocker
- the historical wave/scorecard surfaces stop teaching the obsolete
  `808–835` LOC story as live repo truth

### GREEN

- update release/workload/backlog ledgers
- remove the stale god note
- re-home the residue in the release ledger and scorecard/wave docs
- refresh downstream blockers

### Witness

- `npm exec vitest run test/unit/scripts/remaining-big-files-closeout-shape.test.ts`
- `git diff --check`
