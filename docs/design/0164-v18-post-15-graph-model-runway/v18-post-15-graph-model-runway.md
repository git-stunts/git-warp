---
cycle: 0164
task_id: V18_post_15_graph_model_runway
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
completed_at: 2026-05-22
release_home: v18.0.0
bearing_task: 16
---

# V18 Post-15 Graph-Model Runway

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Close the stale post-merge planning gap after PR #95 and make the next v18
runway explicit: slices 17 through 20 now move from translated Continuum
source-fact compatibility into the graph-model substrate lane.

## Playback Questions

- Can an agent see that PR #95 merged slices 11 through 15 and that the active
  branch is now `v18-continuum-slices-16-20`?
- Does BEARING stop telling the operator to run slices that are already
  complete?
- Does the next runway connect directly to
  `WL-4A-v18-graph-substrate-convergence` instead of drifting into generic
  adapter or observer work?
- Are Echo references still framed as graph-model pressure evidence, not Echo
  ownership of git-warp's Continuum role?

## Accessibility / Assistive Reading Posture

This is a text-first planning slice. BEARING uses numbered task entries and
stable design links so the sequence works in linear reading order and does not
depend on tables, color, or chat context.

## Localization / Directionality Posture

The wording avoids visual-direction assumptions and keeps repository nouns,
branch names, and task names as stable ASCII identifiers. No UI copy or
locale-sensitive formatting is introduced.

## Agent Inspectability / Explainability Posture

The slice records the merge evidence for PR #95 and names the next four
implementation slices. Future agents should not need chat history to understand
why v18 pivots from generated-family source facts to graph substrate nouns.

## Evidence Snapshot

Current inspected sources at this boundary:

| Source | Head / ref | Evidence |
| --- | --- | --- |
| `git-warp` | `origin/main` at `c848f5d4` | PR #95 merge, BEARING, cycles 0159 through 0163 |
| V18 backlog | `docs/method/backlog/v18.0.0/` | node records, edge records, attachment plane, graph-op algebra, migration, replay proof |
| Workload index | `docs/method/backlog/WORKLOADS.md` | `WL-4A-v18-graph-substrate-convergence` |

## What PR #95 Proved

- The generated-family inventory has runtime-backed readiness rows for the
  four current Continuum families.
- Receipt and settlement remain projection-ready; neighborhood core and
  runtime boundary remain authored-only until Wesley profiles and fixtures
  exist.
- `TickPatch` and `TickReceipt` now have an explicit witness ladder split into
  replay core, receipt witness core, and receipt shell.
- Runtime-boundary reading-envelope and witnessed-suffix source facts can be
  expressed as translated git-warp evidence without claiming native Continuum
  witnesshood.
- Review repair tightened constructor invariants and witnessed-suffix ordering
  before the merge.

## Re-Plan

The next four implementation slices should work through the first graph-model
substrate layer:

| Slice | Boundary | Purpose |
| ---: | --- | --- |
| 17 | Node records | Introduce runtime-backed node identity and node record nouns. |
| 18 | Edge records | Separate stable edge identity from legacy `(from, to, label)` keys. |
| 19 | Attachment plane | Split graph skeleton records from payload attachment slots. |
| 20 | Graph-op algebra | Start the explicit node, edge, and attachment op algebra. |

These slices are graph-model convergence work inside v18's Continuum
compatibility campaign. They are not a full v19 observer rewrite and they do
not make Echo the owner of git-warp's role.

## Non-Goals

- Do not implement node records, edge records, the attachment plane, or the
  graph-op algebra in this planning slice.
- Do not claim native Continuum witnesshood for translated git-warp facts.
- Do not move migration tooling or genesis replay proof ahead of the substrate
  nouns they depend on.
- Do not reintroduce "cold runtime" or substrate-hierarchy language.

## RED

Observed before this slice:

```text
docs/BEARING.md still named v18-continuum-slices-11-15 as the branch,
origin/main at a4c5467e as the inspected head, PR #94 as the latest merged PR,
and slices 11 through 15 as the next work even after PR #95 merged.
```

## GREEN

This slice updates BEARING to:

- record `origin/main` at `c848f5d4` and PR #95 as the current merge boundary;
- mark slice 16 complete;
- add slices 17 through 20 as the active execution runway;
- preserve the equal-sibling Continuum participant doctrine.

## Verification

```text
npx markdownlint-cli2 CHANGELOG.md docs/BEARING.md docs/design/0164-v18-post-15-graph-model-runway/v18-post-15-graph-model-runway.md
```

## Closeout

Slice 16 closes the post-15 planning gap. The next commit should implement
slice 17 by designing and adding the first runtime-backed node record substrate
concepts.

## SSJS Scorecard

- Runtime-backed forms: green; this slice introduces no runtime code.
- Boundary validation: green; no boundary parser or adapter change.
- Behavior ownership: green; Continuum remains protocol authority, Wesley
  remains generated-artifact compiler, and git-warp remains an independent
  participant.
- Message parsing: green; no behavior branches introduced.
- Ambient time or entropy: green; no runtime code introduced.
- Fake shape trust or cast-cosplay: green; this slice is planning-only and
  does not create transport-shaped domain values.
