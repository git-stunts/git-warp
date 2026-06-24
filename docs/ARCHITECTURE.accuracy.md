---
accuracy_report: true
schema: git-warp-doc-accuracy-v1
source_document: docs/ARCHITECTURE.md
created: 2026-06-24
last_updated: 2026-06-24
reviewer: codex
evidence_policy: source-code-only
lifecycle: temporary_planning
planning_phase: documentation_reorganization
retire_after: recommendations_executed
status: active
score: 58
score_label: structurally_useful_with_storage_drift
disposition: rewrite_as_root_architecture
keep:
  - hexagonal_architecture_principles
  - public_root_boundaries
  - capability_bag_moments
  - stream_port_boundaries
roll_into:
  - ARCHITECTURE.md
  - docs/topics/git-substrate.md
  - docs/topics/contributor-guide.md
cut:
  - docs_top_level_architecture_copy
  - empty_tree_storage_model
  - outdated_controller_inventory_if_unverified
---

# Architecture accuracy report

## Verdict

The architecture doc has the right durable job, but it should become the root
`ARCHITECTURE.md` and its storage model needs correction. It also mixes
architecture explanation with file inventory.

Score: **58/100**.

Disposition: **rewrite_as_root_architecture**.

Lifecycle rule: this report is temporary planning evidence for the docs
reorganization pass and should be deleted after architecture consolidation.

## Worth keeping

- Keep the public-root boundary: `openWarpWorldline()` for applications and
  `openWarpGraph()` for advanced capability access ([WarpWorldline.ts:150](../src/domain/WarpWorldline.ts#L150),
  [WarpGraph.ts:345](../src/domain/WarpGraph.ts#L345)).
- Keep the admission-moment capability grouping. The source constructs frozen
  `commitment`, `folding`, `revelation`, and `governance` objects with flat
  aliases to the same capability instances ([WarpGraph.ts:371](../src/domain/WarpGraph.ts#L371),
  [WarpGraph.ts:377](../src/domain/WarpGraph.ts#L377)).
- Keep stream-port boundaries. `WarpStream` exists as the domain stream
  primitive, and advanced ports use streamed commit, patch, and index surfaces
  ([WarpStream.ts:34](../src/domain/stream/WarpStream.ts#L34),
  [PatchJournalPort.ts:57](../src/ports/PatchJournalPort.ts#L57)).
- Keep materialization as compatibility/diagnostic architecture, not app
  read doctrine ([MaterializeCapability.ts:45](../src/domain/capabilities/MaterializeCapability.ts#L45)).

## What to cut or rewrite

- Rewrite the Git storage model. The current text says all graph data is stored
  as empty-tree commits, but patch commits write patch/content trees and
  checkpoint creation writes checkpoint tree data ([PatchCommitter.ts:115](../src/domain/services/PatchCommitter.ts#L115),
  [PatchCommitter.ts:137](../src/domain/services/PatchCommitter.ts#L137),
  [checkpointCreate.ts:219](../src/domain/services/state/checkpointCreate.ts#L219)).
- Verify controller and adapter inventories before preserving them. Architecture
  should explain boundaries first and list files only where that helps safe
  changes.
- Move from `docs/ARCHITECTURE.md` to root `ARCHITECTURE.md` as a standard
  repository artifact.

## Roll-in recommendation

Create root `ARCHITECTURE.md` from the durable pieces: product roots,
hexagonal boundary, admission moments, storage truth, read-cost posture, and
safe-change guidance. Move storage detail to `docs/topics/git-substrate.md`.
