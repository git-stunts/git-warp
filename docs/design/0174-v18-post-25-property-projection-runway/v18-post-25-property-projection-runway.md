---
cycle: 0174
task_id: V18_post_25_property_projection_runway
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-23
release_home: v18.0.0
bearing_task: 26
promotes_backlog:
  - docs/method/backlog/v18.0.0/PROTO_legacy-props-as-projection.md
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
  - docs/method/backlog/v18.0.0/TRUST_genesis-replay-equivalence.md
---

# V18 Post-25 Property Projection Runway

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Reset the v18 signpost after the content-cutover branch and define the next
twenty slices as one evidence-gathering runway: property projection first,
migration dry-run second, genesis replay equivalence third.

## Playback Questions

- Does `BEARING.md` point at the merged post-slice-25 head instead of stale
  pre-PR state?
- Are slices 26 through 45 named in one ordered list with design documents?
- Does the plan keep `git-warp` as an independent Continuum participant?
- Does the plan preserve the distinction between compatibility projection and
  substrate truth?
- Does the runway explain which future slices may change code and which are
  evidence or planning slices?

## Existing Shape

The v18 line already has graph substrate nouns, generic attachments, content
payload nouns, content attachment projection, public content reads routed
through that projection, and typed content write intent lowering.

The remaining backlog pressure is concentrated in three notes:

- legacy property bags must become compatibility projections;
- graph-model migration must be planned before any destructive history write;
- genesis replay equivalence must prove migration before it can be trusted.

`BEARING.md` is intentionally updated at cycle boundaries. After the content
cutover branch merges, the file must stop pointing at the old branch, old
remote head, and old "open PR" task.

## Chosen Boundary

This slice is documentation-only. It creates the next twenty design records
and rewrites `BEARING.md` so that later implementation slices have a stable
map.

The runway is split into four batches:

- slices 26 through 30: property projection read surface;
- slices 31 through 35: state-reader, write-intent, and closeout work;
- slices 36 through 40: migration manifest and dry-run planner;
- slices 41 through 45: dry-run CLI, equivalence proof, divergence reporting,
  and evidence-backed replanning.

The documentation does not claim that compatibility is complete. It names the
work needed to make that claim later.

## Non-Goals

- Do not implement property projection in this slice.
- Do not alter public APIs.
- Do not add migration scripts.
- Do not mark any v18 backlog item complete.
- Do not open or merge a PR from this planning-only slice.

## RED Plan

No regression test is required for the documentation-only slice. The failure
condition is stale or missing planning evidence:

- `BEARING.md` still describes the pre-PR-97 branch;
- slices 26 through 45 are not all represented by design documents;
- the new text reintroduces false subordinate-runtime language;
- markdown checks fail.

## GREEN Plan

Add one design file for each slice from 26 through 45. Rewrite `BEARING.md`
around the current main-line state, the merged slice-21-through-25 work, and
the next twenty planned moves.

The text must describe property bags as compatibility views and graph
attachments as the emerging substrate. It must also preserve the honest
status of content persistence: typed content reads and writes exist, but the
stored compatibility representation still uses legacy `_content*` properties.

## Verification

```text
npx markdownlint-cli2 CHANGELOG.md docs/BEARING.md docs/design/0174-v18-post-25-property-projection-runway/v18-post-25-property-projection-runway.md
git diff --check HEAD
```

## Closeout Criteria

- `BEARING.md` names the current merged PR #97 state.
- Slices 26 through 45 are listed and linked.
- Each planned slice has a design document.
- The changelog records the planning update under `Unreleased`.

## SSJS Scorecard

- Runtime-backed forms: not applicable; documentation-only slice.
- Boundary validation: green; the plan separates compatibility views,
  migration adapters, and domain substrate concepts.
- Behavior ownership: green; future behavior is assigned to owning services
  instead of generic helpers.
- Message parsing: green; no behavior depends on parsed prose.
- Ambient time or entropy: green; no runtime code changes.
- Fake shape trust or cast-cosplay: green; no code changes.
