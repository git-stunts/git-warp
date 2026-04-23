---
title: "Close dead-code cleanup as blocked residue under the real Op-model owner"
cycle: "0052-dead-code-cleanup"
---

# Close Dead-Code Cleanup

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

`SLUDGE_dead-code-cleanup` still appears in the active `v17` ledger as if it
were a standalone cleanup slice.

Repo truth says otherwise:

- `OpStrategies.ts`, `OpStrategy.ts`, and `OpLike.ts` are still live
- `src/domain/services/strand/conflictTargetIdentity.ts` still imports
  `OP_STRATEGIES` from `JoinReducer.ts`
- the root cause is the broader fake-model / op-dispatch debt already owned by
  `PROTO_purge-fake-models`

So this cycle exists to stop carrying a duplicate residue card as if it were an
independent deletions task.

## Hill

A contributor can now answer, from repo truth alone, that
`SLUDGE_dead-code-cleanup` was not a deletions slice but blocked residue already
owned by `PROTO_purge-fake-models`.

## Playback questions

### Agent

- Can I point to the live import path that proves the code is not dead?
- Can I point to the backlog note that now explicitly owns the remaining work?
- Does the `v17` ledger stop presenting this as a standalone pending cleanup?

### Human

- Is it clear why this cycle closed as `not met` instead of inventing dead-code
  deletions?
- Is it clear which trunk now owns the real work?

## Accessibility / assistive reading posture

Relevant. The closeout should be understandable from the release ledger and the
owning backlog note without reconstructing history from grep output.

## Localization / directionality posture

Not especially relevant. This is backlog and architecture truth maintenance.

## Agent inspectability / explainability posture

Relevant. The cycle should leave:

- the live blocker evidence (`conflictTargetIdentity.ts`)
- the owning trunk (`PROTO_purge-fake-models`)
- the release-ledger correction

## Non-goals

- No fake deletion of `OpStrategies.ts`, `OpStrategy.ts`, or `OpLike.ts`
- No opportunistic rewrite of the conflict-analysis pipeline in this cycle
- No attempt to finish `PROTO_purge-fake-models` here

## Core diagnosis

The old sludge note was already telling the truth in prose:

- the files are not dead
- the blocker is `ConflictCandidateCollector` / conflict-target dispatch
- the real fix is op-class dispatch and fake-model purge

What was still wrong was the planning posture:

> the repo kept the note live as if "delete dead code" were still a separate
> executable task in the active foundation lane

It is not. It is duplicate residue under the real owner.

## Design

### 1. Remove the standalone residue card from the active lane

The live note should leave `v17.0.0/`.

### 2. Mark the outcome as `not met`, not `done`

The original hill was not achieved because the code is still live.

That is not a failure of implementation in this cycle. It is a premise error in
task decomposition.

### 3. Strengthen the owning note instead of minting another successor

`PROTO_purge-fake-models` already owns:

- `OpLike`
- `PatchLike`
- `OpStrategy` / `OpStrategies` collapse

This cycle should make that ownership more explicit rather than creating yet
another backlog note for the same seam.

## Test plan

### RED

Add a docs ratchet that fails until:

- the `v17` release ledger marks `SLUDGE_dead-code-cleanup` closed as `not met`
- `PROTO_purge-fake-models` explicitly names the `ConflictCandidateCollector` /
  `conflictTargetIdentity` blocker

### GREEN

- update the release ledger
- strengthen the owning backlog note
- remove the duplicate live card and refresh backlog/workload counts

### Witness

- `npm exec vitest run test/unit/scripts/dead-code-cleanup-shape.test.ts`
- `git diff --check`

## Playback

### Agent

- Yes. `src/domain/services/strand/conflictTargetIdentity.ts` still imports
  `OP_STRATEGIES` from `JoinReducer.ts`, which proves the strategy registry and
  adjacent files are not dead.
- Yes. `docs/method/backlog/v17.0.0/PROTO_purge-fake-models.md` now explicitly
  owns the `ConflictCandidateCollector` / conflict-target dispatch residue.
- Yes. The `v17` release ledger no longer presents
  `SLUDGE_dead-code-cleanup` as a standalone pending cleanup.

### Human

- Yes. It is clear why the cycle closed as `not met`: the files are still live,
  so deleting them here would have been fake progress.
- Yes. It is clear that the real owner is `PROTO_purge-fake-models`, not a
  separate deletions card.

### Verdict

`not met`

## Drift check

No negative drift.

Positive drift only:

- the cycle converted a blocked residue card into explicit ownership under the
  fake-model purge trunk instead of minting yet another follow-up note
