---
cycle: 0161
task_id: V18_tickpatch_tickreceipt_witness_ladder
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
completed_at: 2026-05-22
release_home: v18.0.0
bearing_task: 13
backlog_source: docs/method/backlog/up-next/PROTO_tickpatch-tickreceipt-witness-ladder-audit.md
---

# V18 TickPatch TickReceipt Witness Ladder

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Name the runtime-backed ladder that separates patch replay core, receipt
witness core, and receipt shell explanation for git-warp tick evidence.

## Playback Questions

- Can a `Patch` plus matching `TickReceipt` be summarized into explicit replay
  core, witness core, and receipt shell concepts?
- Does the ladder reject mismatched patch SHA, writer, or Lamport facts instead
  of letting unrelated objects appear causally connected?
- Can `warp-ttd` and Wesley target named layers without reinterpreting
  `TickReceipt` as one undifferentiated witness blob?
- Does the promoted backlog item stop living in `up-next/` once this design
  owns the work?

## Accessibility / Assistive Reading Posture

This slice introduces code-level nouns and text documentation only. The ladder
layers are ordered and named in plain text so the distinction survives without
visual hierarchy.

## Localization / Directionality Posture

No UI text is introduced. Runtime labels are stable ASCII family/layer labels
and should not be localized.

## Agent Inspectability / Explainability Posture

The ladder gives future agents one inspected runtime object to ask:

- what is the replay core;
- what is the local witness core;
- what is explanatory receipt shell;
- whether the supplied patch and receipt actually agree.

This avoids adapter-local summary code inferring the split differently in
`warp-ttd`, Wesley fixtures, or future projections.

## Design

Add four domain concepts:

- `GitWarpTickPatchReplayCore` for substrate replay facts from `Patch`;
- `GitWarpTickReceiptWitnessCore` for outcome counts from `TickReceipt`;
- `GitWarpTickReceiptShell` for explanatory receipt-shell facts;
- `GitWarpTickWitnessLadder` for validated patch/receipt alignment.

The current codebase does not have a concrete `TickPatch` class. The source
runtime noun is `Patch`; this slice treats "TickPatch" from the backlog note
as the patch-at-one-tick concept represented by `Patch` plus the commit SHA.

## Non-Goals

- Do not redesign `Patch`.
- Do not redesign `TickReceipt`.
- Do not emit Continuum receipt, runtime-boundary, or settlement family values
  from this slice.
- Do not claim native Continuum witnesshood.
- Do not change reducer semantics.

## RED

Observed first failure:

```text
npx vitest run test/unit/domain/continuum/GitWarpTickWitnessLadder.test.ts --reporter=verbose
Error: Cannot find module '../../../../src/domain/continuum/GitWarpTickPatchReplayCore.ts'
```

The test failed because the ladder nouns did not exist yet.

## GREEN

Implemented the ladder classes, public exports, backlog promotion, changelog
entry, and BEARING task 13 closeout.

## Verification

```text
npx vitest run test/unit/domain/continuum/GitWarpTickWitnessLadder.test.ts \
  test/unit/domain/index.exports.test.ts --reporter=verbose
npm run typecheck
npx eslint src/domain/continuum/GitWarpTickPatchReplayCore.ts \
  src/domain/continuum/GitWarpTickReceiptWitnessCore.ts \
  src/domain/continuum/GitWarpTickReceiptShell.ts \
  src/domain/continuum/GitWarpTickWitnessLadder.ts \
  test/unit/domain/continuum/GitWarpTickWitnessLadder.test.ts \
  test/unit/domain/index.exports.test.ts
npx markdownlint-cli2 CHANGELOG.md docs/BEARING.md \
  docs/design/0161-v18-tickpatch-tickreceipt-witness-ladder/v18-tickpatch-tickreceipt-witness-ladder.md
```

## Closeout

The promoted backlog item now lives as this design cycle rather than as an
`up-next/` backlog note. The runtime ladder rejects mismatched patch SHA,
writer, or Lamport facts and exposes named replay core, witness core, and
receipt shell layers for later projections.

## SSJS Scorecard

- Runtime-backed forms: expected green; the new layers are classes.
- Boundary validation: expected green; the ladder accepts existing domain
  objects, not raw wire values.
- Behavior ownership: expected green; `Patch` owns replay facts and
  `TickReceipt` owns local outcome facts.
- Message parsing: expected green.
- Ambient time or entropy: expected green.
- Fake shape trust or cast-cosplay: expected green; patch and receipt alignment
  is validated at construction.
