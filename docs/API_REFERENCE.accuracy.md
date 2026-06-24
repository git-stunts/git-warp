---
accuracy_report: true
schema: git-warp-doc-accuracy-v1
source_document: docs/API_REFERENCE.md
created: 2026-06-24
last_updated: 2026-06-24
reviewer: codex
evidence_policy: source-code-only
lifecycle: temporary_planning
planning_phase: documentation_reorganization
retire_after: recommendations_executed
status: active
score: 62
score_label: valuable_but_untrustworthy_manual_reference
disposition: generate_or_split
keep:
  - public_entry_points
  - worldline_interface_summary
  - graph_capability_summary
  - deprecation_guidance
roll_into:
  - docs/topics/api-reference.md
  - docs/generated/api-reference.md
  - ARCHITECTURE.md
cut:
  - exhaustive_claim
  - manual_option_tables
  - unsupported_adapter_table_entries
  - tutorial_material
---

# API reference accuracy report

## Verdict

This file contains useful public-surface information, but it is too large and
too manual to be the "exhaustive" authority. It should be generated or split
into reference plus topic material.

Score: **62/100**.

Disposition: **generate_or_split**.

Lifecycle rule: this report is temporary planning evidence for the docs
reorganization pass and should be deleted after API reference consolidation.

## Worth keeping

- Keep `openWarpWorldline()` as the first-use API reference entry. The runtime
  validates non-empty identity fields and maps `worldlineName` into the graph
  substrate ([WarpWorldline.ts:150](../src/domain/WarpWorldline.ts#L150),
  [WarpWorldline.ts:180](../src/domain/WarpWorldline.ts#L180)).
- Keep the `WarpWorldline` member table, with source verification. The class
  exposes `commit`, `live`, `seek`, `observer`, `optic`, `prepareOpticBasis`,
  and `coordinate` ([WarpWorldline.ts:75](../src/domain/WarpWorldline.ts#L75),
  [WarpWorldline.ts:114](../src/domain/WarpWorldline.ts#L114)).
- Keep `openWarpGraph()` as the advanced capability bag. The runtime freezes
  commitment, folding, revelation, governance, and flat aliases
  ([WarpGraph.ts:355](../src/domain/WarpGraph.ts#L355),
  [WarpGraph.ts:371](../src/domain/WarpGraph.ts#L371)).
- Keep deprecation guidance for materialization and legacy facades. The
  materialize capability is explicitly deprecated for application reads
  ([MaterializeCapability.ts:45](../src/domain/capabilities/MaterializeCapability.ts#L45)).

## What to cut or rewrite

- Cut "exhaustive" unless the file is generated or coverage-checked from
  exports and type declarations.
- Verify adapter tables against package exports. The source exports
  `BunHttpAdapter` and `DenoHttpAdapter`, while `NodeHttpAdapter` exists in
  infrastructure but is not exported from `index.ts` in the same list
  ([index.ts:303](../index.ts#L303), [NodeHttpAdapter.ts:106](../src/infrastructure/adapters/NodeHttpAdapter.ts#L106)).
- Move tutorial prose and broad product positioning out of reference.
- Generate or validate option/type tables from TypeScript declarations where
  practical.

## Roll-in recommendation

Create a generated or coverage-checked API reference under
`docs/topics/api-reference.md` or `docs/generated/api-reference.md`. Move
architecture-oriented capability grouping to root `ARCHITECTURE.md`.
