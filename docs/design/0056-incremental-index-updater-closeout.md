---
title: "Close the IncrementalIndexUpdater god card without losing the real shard-boundary debt"
cycle: "0056-incremental-index-updater-closeout"
---

# Close IncrementalIndexUpdater God Card

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

`GOD_incremental-index-updater` is stale in the same way several recent
cleanup cards were stale:

- the file is no longer the `955` LOC monster the note claims
- `IndexNodeUpdater`, `IndexEdgeUpdater`, and `ShardPort` already exist
- the file is now `495` LOC, which means the original god-slaying hill is
  materially satisfied
- the real remaining work is narrower and already has owners:
  - `PROTO_purge-boundary-leaks`
  - `MODEL_incremental-index-updater-shape-sludge`

So the repo should stop treating this as an open god kill and instead point at
the remaining boundary/model cleanup honestly.

## Hill

A contributor can now tell, from repo truth alone, that the
`IncrementalIndexUpdater` god split already landed and that the only remaining
work is shard-I/O and raw-shape cleanup tracked by existing boundary/model
owners.

## Playback questions

### Agent

- Can I point to the existing split helpers and current LOC to show the god
  card is obsolete?
- Do downstream tasks stop pretending they are blocked on an un-slain god?
- Does the release ledger explain where the remaining updater debt moved?

### Human

- Is it clear why this cycle closes a god card without rewriting the updater
  again?
- Is it clear that the real remaining work is boundary/model cleanup, not file
  size surgery?

## Accessibility / assistive reading posture

Relevant. The closeout should be readable from the release ledger and the
remaining owner notes without requiring code archeology.

## Localization / directionality posture

Not especially relevant. This is planning-truth maintenance.

## Agent inspectability / explainability posture

Relevant. The cycle should leave explicit evidence:

- current file size
- existing `IndexNodeUpdater` / `IndexEdgeUpdater` / `ShardPort` seams
- updated blocker graphs
- explicit re-home to the remaining owner notes

## Non-goals

- No `ShardPort` cutover in this cycle
- No additional `IncrementalIndexUpdater` code refactor here
- No rewrite of `MaterializedViewService.applyDiff()` in this slice

## Core diagnosis

The old card bundled two different problems:

1. a giant god-object split
2. the remaining shard-serde and raw-shape debt inside the slimmer
   orchestrator

The first is already materially done. The second is still real, but it belongs
under the boundary/model cleanup trunks, not as a fake live god-slaying card.

## Design

### 1. Remove the stale god card from the live lane

The live backlog note should leave `v17`.

### 2. Update the release and workload ledgers

They should stop presenting `GOD_incremental-index-updater` as open work and
stop treating it as a blocker inside `WL-37`.

### 3. Re-home the remaining residue explicitly

The closeout should point to the notes that still own the real debt:

- `PROTO_purge-boundary-leaks`
- `MODEL_incremental-index-updater-shape-sludge`

### 4. Remove fake downstream blockers

Tasks that still name `GOD_incremental-index-updater` in `blocked_by` or
`blocks` should be updated to reflect repo truth.

## Test plan

### RED

Add a doc-shape ratchet that fails until:

- the `v17` release ledger explains why the god card is closed
- the stale live note and `WL-37` entry are gone
- downstream notes stop naming the dead god as an active blocker

### GREEN

- update release/workload/backlog ledgers
- remove the stale god note
- re-home the residue in the release ledger and wave docs
- refresh downstream blockers

### Witness

- `npm exec vitest run test/unit/scripts/incremental-index-updater-closeout-shape.test.ts`
- `git diff --check`

## Playback

### Agent

- Yes. The current repo already shows the god split landed:
  `IncrementalIndexUpdater.ts` is 495 LOC, `IndexNodeUpdater.ts` and
  `IndexEdgeUpdater.ts` already own the split behavior, and `ShardPort.ts`
  already exists.
- Yes. Downstream blocker lists now stop naming
  `GOD_incremental-index-updater` as if it were still a live prerequisite.
- Yes. The `v17` ledger now explains that the remaining updater residue belongs
  to `PROTO_purge-boundary-leaks` and
  `MODEL_incremental-index-updater-shape-sludge`.

### Human

- Yes. It is now clear why this cycle closed a god card without another big
  refactor.
- Yes. It is clear that the remaining work is shard-I/O and raw-shape cleanup,
  not a file-size emergency.

### Verdict

`hill met`

## Drift check

No negative drift.

Positive drift only:

- the cycle also corrected the historical wave and scorecard surfaces so they
  stop teaching the obsolete 955-LOC god story
