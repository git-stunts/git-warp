---
accuracy_report: true
schema: git-warp-doc-accuracy-v1
source_document: docs/READINGS_AND_OPTICS.md
created: 2026-06-24
last_updated: 2026-06-24
reviewer: codex
evidence_policy: source-code-only
lifecycle: temporary_planning
planning_phase: documentation_reorganization
retire_after: recommendations_executed
status: active
score: 76
score_label: accurate_but_duplicate
disposition: merge
keep:
  - worldline_first_read_contract
  - coordinate_optic_path
  - observer_read_path
  - optic_error_boundaries
roll_into:
  - docs/topics/optics.md
  - docs/topics/observers.md
  - docs/topics/bounded-reads.md
cut:
  - standalone_top_level_doc
  - duplicate_examples
  - broad_first_use_friendliness
---

# Readings and optics accuracy report

## Verdict

The runtime claims are mostly aligned with source, but the page overlaps with
the existing `docs/topics/optics.md`, `docs/topics/observers.md`, and
`docs/topics/bounded-reads.md`. It should be merged into those topics, not kept
as another top-level guide.

Score: **76/100**.

Disposition: **merge**.

Lifecycle rule: this report is temporary planning evidence for the docs
reorganization pass and should be deleted after this page is merged or
superseded.

## Worth keeping

- Keep the worldline-first contract. `openWarpWorldline()` returns a frozen
  handle with commit/read/observer/optic methods ([WarpWorldline.ts:51](../src/domain/WarpWorldline.ts#L51),
  [WarpWorldline.ts:72](../src/domain/WarpWorldline.ts#L72)).
- Keep coordinate optics. `prepareOpticBasis()` verifies checkpoint-tail basis
  evidence, `coordinate()` requires a prepared basis, and coordinate optics
  recreate the worldline from a coordinate source ([CheckpointTailBasisVerifier.ts:27](../src/domain/services/optic/CheckpointTailBasisVerifier.ts#L27),
  [WarpWorldline.ts:124](../src/domain/WarpWorldline.ts#L124),
  [WarpWorldlineCoordinate.ts:41](../src/domain/WarpWorldlineCoordinate.ts#L41)).
- Keep optic error distinctions. The source throws `E_OPTIC_NO_BOUNDED_BASIS`
  for missing basis and uses schema errors for invalid optic targets
  ([ProjectionHandle.ts:123](../src/domain/services/ProjectionHandle.ts#L123),
  [Optic.ts:150](../src/domain/services/optic/Optic.ts#L150)).
- Keep the lower-level graph/provenance distinction. Provenance slice
  materialization is explicitly diagnostic, not first-use app reading
  ([ProvenanceCapability.ts:11](../src/domain/capabilities/ProvenanceCapability.ts#L11)).

## What to cut or rewrite

- Cut this as a standalone top-level document after its content is folded into
  topic pages.
- Rewrite "first-use friendly" language to reflect row-specific cost posture.
  The runtime memory report classifies checkpoint-tail optics as transitional,
  graph-wide materialization as diagnostic, and legacy query arrays as legacy
  ([createBoundedMemoryCapabilityReport.ts:25](../src/domain/memory/createBoundedMemoryCapabilityReport.ts#L25),
  [createBoundedMemoryCapabilityReport.ts:31](../src/domain/memory/createBoundedMemoryCapabilityReport.ts#L31)).
- Remove duplicate examples once topics own the read-model story.

## Roll-in recommendation

Fold coordinate optics into `docs/topics/optics.md`, observer material into
`docs/topics/observers.md`, and cost/support posture into
`docs/topics/bounded-reads.md`.
