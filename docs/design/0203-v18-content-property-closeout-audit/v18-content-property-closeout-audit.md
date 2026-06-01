---
cycle: 0203
task_id: V18_content_property_closeout_audit
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-24
completed_at: 2026-05-24
release_home: v18.0.0
bearing_task: 55
promotes_backlog:
  - docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md
  - docs/method/backlog/v18.0.0/PROTO_legacy-props-as-projection.md
---

# V18 Content Property Closeout Audit

## Sponsor Human

James.

## Sponsor Agent

Codex.

## Hill

Close this v18 batch by making remaining raw content/property compatibility
boundaries explicit before the drift check.

## Playback Questions

- Which `src/domain` files still mention raw compatibility content or property
  storage?
- Are those files named boundaries rather than accidental public read leaks?
- Does a test fail if a new raw compatibility boundary appears without review?
- Does BEARING record the remaining release blockers honestly?
- Does this closeout avoid claiming storage migration is complete?

## Existing Shape

Slices 46 through 54 built persisted-history fixtures, source inventory,
operation lowering, scratch writing, equivalence gating, finalization safety,
archive-preserving finalization, command wiring, and runtime conformance
evidence gating.

The content/property storage plane is still not fully cut over. Legacy
`_content*` and raw property-map state remain compatibility inputs for the
current runtime and for migration evidence.

## Chosen Boundary

Run the raw compatibility audit over `src/domain` for:

```text
decodePropKey|decodeEdgePropKey|state\.prop|_content
```

Then add an executable shape test that requires every matching file to appear
in this design document.

## Current Raw Compatibility Files

The current audited files are:

- `src/domain/graph/LegacyContentPropertyKeys.ts`
- `src/domain/services/KeyCodec.ts`
- `src/domain/services/PatchCommitter.ts`
- `src/domain/services/state/StateDiff.ts`
- `src/domain/services/state/WarpState.ts`
- `src/domain/services/state/checkpointHelpers.ts`
- `src/domain/services/strand/StrandPatchService.ts`

## Retired Raw Compatibility Files

Retired files must stay retired:

- `src/domain/services/CoordinateFactExport.ts` retired in slice 93 after
  transfer operation spelling moved behind constants owned by
  `src/domain/services/transfer/transferOps.ts`.
- `src/domain/services/ContentAttachmentProjection.ts` retired after migrating
  to `state.getNodeProp()` and `state.getEdgeProp()` point-access methods.
- `src/domain/services/ImmutableSnapshot.ts` retired after migrating snapshot
  construction to `state.allPropEntries()`.
- `src/domain/services/OpStrategies.ts` retired after migrating `ReceiptBuilder`
  calls to accept `WarpState` directly.
- `src/domain/services/OpStrategy.ts` retired after migrating to
  `state.mutatePropLWW()`, `state.getEncodedProp()`.
- `src/domain/services/PatchBuilderValidation.ts` retired after migrating
  attached-data scanning to `WarpState.allPropEntriesFromState()`.
- `src/domain/services/TemporalQuery.ts` retired after migrating to
  `WarpState.nodePropertiesFromState()` typed iterators.
- `src/domain/services/VisibleStateScope.ts` retired after migrating to
  `state.nodeProperties()` and `state.edgeProperties()` typed iterators.
- `src/domain/services/index/LogicalIndexBuildService.ts` retired after
  migrating snapshot construction to `state.allPropEntries()`.
- `src/domain/services/state/CheckpointSerializer.ts` retired after migrating
  checkpoint serialization to `WarpState.allPropEntriesFromState()`.
- `src/domain/services/state/StateSerializer.ts` retired after migrating
  visible projection to `WarpState.nodePropertiesFromState()`.
- `src/domain/types/ops/EdgePropSet.ts` retired after migrating `ReceiptBuilder`
  calls to accept `WarpState` directly.
- `src/domain/types/ops/NodePropSet.ts` retired after migrating `ReceiptBuilder`
  calls to accept `WarpState` directly.
- `src/domain/types/ops/PropSet.ts` retired after migrating `ReceiptBuilder`
  calls to accept `WarpState` directly.
- `src/domain/types/ops/propHelpers.ts` retired after migrating to
  `state.mutatePropLWW()`, `state.getEncodedProp()`.

## Classification

These files fall into bounded categories:

- Legacy content compatibility key ownership:
  `LegacyContentPropertyKeys`.
- Runtime mutation and compatibility operation execution:
  `PatchCommitter` and `StrandPatchService`.
- Guard, replay, serialization, snapshot, scope, and index boundaries:
  `StateDiff`, `WarpState`, and `checkpointHelpers`.
- Codec ownership: `KeyCodec`.

## Non-Goals

- Do not remove legacy raw storage in this slice.
- Do not claim native runtime replay over migrated scratch history.
- Do not modify reducers or serializers during the audit.
- Do not add release version changes.

## RED Plan

Add a test that scans `src/domain` for the audit pattern and fails when the
matching file set differs from this documented list.

## GREEN Plan

Document every current match and make the test compare against the list.
Future work that adds or removes raw compatibility boundaries must update the
design evidence deliberately.

## Verification

```text
npx vitest run test/unit/scripts/v18-content-property-closeout-audit.test.ts --reporter=verbose
npx eslint --no-warn-ignored test/unit/scripts/v18-content-property-closeout-audit.test.ts
npm run typecheck
npm run lint:md
npm run lint:sludge
npm run lint:semgrep
git diff --check
```

## Closeout Criteria

- The raw compatibility file set is explicit.
- The design document contains every audited file path.
- A test fails on unreviewed boundary drift.
- BEARING names the remaining release blockers.

## Closeout

Slice 55 closes the branch batch, not the v18 migration program. The audit
proves that raw content/property compatibility surfaces are still present and
bounded. The remaining public-release work is to build real-history reading
construction and a real runtime conformance provider, then reduce this audited
legacy storage surface through subsequent migration slices.

## SSJS Scorecard

- Runtime-backed forms: green; no new runtime model was invented.
- Boundary validation: green; raw boundaries are enumerated.
- Behavior ownership: green; audit does not move behavior.
- Message parsing: green; no message parsing.
- Ambient time or entropy: green; no clocks or randomness.
- Fake shape trust or cast-cosplay: green; remaining gaps are explicit.
