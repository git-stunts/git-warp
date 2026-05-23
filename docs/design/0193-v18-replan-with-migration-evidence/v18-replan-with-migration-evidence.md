---
cycle: 0193
task_id: V18_replan_with_migration_evidence
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
release_home: v18.0.0
bearing_task: 45
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
  - docs/method/backlog/v18.0.0/TRUST_genesis-replay-equivalence.md
---

# V18 Replan With Migration Evidence

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Pause after property projection, dry-run migration planning, and first
equivalence evidence to decide the next v18 slices from source evidence
rather than guesswork.

## Playback Questions

- Does the replan cite actual source files, tests, and command results?
- Does it say whether property projection is closed or still leaking?
- Does it say whether the dry-run migration planner is enough to start write
  planning?
- Does it say whether genesis equivalence is credible or still fixture-only?
- Does it produce the next ten to twenty slices with backlog updates?

## Existing Shape

The v18 compatibility campaign is larger than one branch. By slice 45, the
repo should have property projection, property write intent, migration
manifest, dry-run planner, dry-run CLI, and first equivalence proof surfaces.
That is enough evidence to stop and plan the next branch honestly.

## Chosen Boundary

This slice is a cycle-boundary planning and documentation pass. It should
inspect:

- source locations still reading raw property maps;
- migration domain and script surfaces;
- dry-run fixture output;
- equivalence proof results;
- backlog acceptance criteria;
- CI and local verification history.

Then update:

- `docs/BEARING.md`;
- relevant backlog notes;
- new design docs for the next slice set;
- changelog planning notes if externally meaningful.

## Non-Goals

- Do not sneak in implementation changes during replanning.
- Do not mark migration complete without a write path and equivalence gate.
- Do not claim Continuum native witnesshood unless proven.
- Do not open a release branch from planning evidence alone.
- Do not replace source evidence with optimistic roadmap prose.

## RED Plan

The failing condition is insufficient evidence:

- source audit commands have not been run;
- tests for property projection, migration planning, and equivalence have not
  run;
- backlog notes remain stale;
- `BEARING.md` does not reflect reality;
- next slices lack design docs.

## GREEN Plan

Run the audits and relevant tests, collect exact evidence, then write the next
plan. If any planned v18 premise is false, say so directly and move the next
slice toward repair rather than feature expansion.

The replan should preserve the Continuum participant posture: `git-warp` is a
sibling runtime exchanging witnessed causal history through the Continuum
protocol.

## Verification

```text
rg "decodePropKey|decodeEdgePropKey|state\\.prop" src/domain
npm run test:local
npm run typecheck
npm run lint
npx markdownlint-cli2 CHANGELOG.md docs/BEARING.md docs/method/backlog/v18.0.0/*.md docs/design/0193-v18-replan-with-migration-evidence/v18-replan-with-migration-evidence.md
git diff --check HEAD
```

## Closeout Criteria

- Evidence-backed status is written into `BEARING.md`.
- Backlog notes reflect completed, blocked, and remaining work.
- Next slice docs exist.
- No implementation edits are mixed into the replan commit.

## SSJS Scorecard

- Runtime-backed forms: not applicable for documentation-only replan.
- Boundary validation: green when the plan cites source and test evidence.
- Behavior ownership: green when future work is assigned to owning surfaces.
- Message parsing: green; no runtime behavior changes.
- Ambient time or entropy: green; no code changes.
- Fake shape trust or cast-cosplay: green; no code changes.
