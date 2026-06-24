---
accuracy_report: true
schema: git-warp-doc-accuracy-v1
source_document: README.md
created: 2026-06-24
last_updated: 2026-06-24
reviewer: codex
evidence_policy: source-code-only
lifecycle: temporary_planning
planning_phase: documentation_reorganization
retire_after: recommendations_executed
status: active
score: 64
score_label: useful_but_drifted
disposition: revise
keep:
  - product_positioning
  - quick_start_worldline_path
  - optic_first_use_story
  - concise_faq_shape
roll_into:
  - README.md
  - docs/topics/optics.md
  - docs/topics/bounded-reads.md
  - docs/topics/git-substrate.md
cut:
  - live_release_status_snapshot
  - universal_empty_tree_storage
  - vision_doc_dependency
  - unverified_production_ready_claim
---

# README accuracy report

## Verdict

The root README is the right public entry point, but it is carrying too much
release-status and doctrine baggage. It should stay, shrink, and route into
focused topic pages.

Score: **64/100**.

Disposition: **revise**.

Lifecycle rule: this report is temporary planning evidence for the docs
reorganization pass and should be deleted after the README recommendations are
executed.

## Worth keeping

- Keep `openWarpWorldline()` as the first-use entry. The package exports it,
  and the runtime handle exposes `commit`, `live`, `seek`, `observer`,
  `prepareOpticBasis`, `coordinate`, and `optic` ([index.ts:323](index.ts#L323),
  [WarpWorldline.ts:75](src/domain/WarpWorldline.ts#L75),
  [WarpWorldline.ts:150](src/domain/WarpWorldline.ts#L150)).
- Keep `openWarpGraph()` as the lower-level compatibility and diagnostics root.
  The source marks it deprecated for application workflows and freezes the
  capability bag with flat and moment-scoped aliases ([WarpGraph.ts:345](src/domain/WarpGraph.ts#L345),
  [WarpGraph.ts:371](src/domain/WarpGraph.ts#L371)).
- Keep the optic read path, but keep it bounded and transitional. The runtime
  exports `Optic`, verifies checkpoint-tail basis evidence, captures coordinates,
  and fails with `E_OPTIC_NO_BOUNDED_BASIS` when basis evidence is missing
  ([index.ts:327](index.ts#L327), [CheckpointTailBasisVerifier.ts:27](src/domain/services/optic/CheckpointTailBasisVerifier.ts#L27),
  [WarpWorldlineCoordinate.ts:49](src/domain/WarpWorldlineCoordinate.ts#L49)).
- Keep the bounded-read framing. `BoundedSupportRule` distinguishes exact
  entity, neighborhood, global-discovery, and interval-diff support postures
  ([BoundedSupportRule.ts:26](src/domain/services/query/BoundedSupportRule.ts#L26),
  [CausalIndexPlan.ts:50](src/domain/services/query/CausalIndexPlan.ts#L50)).

## What to cut or rewrite

- Rewrite every claim that graph history commits point at Git's empty tree.
  Patch commits build a tree containing patch/content entries and use
  `commitNodeWithTree`; only `commitNode` uses the empty tree path
  ([PatchCommitter.ts:115](src/domain/services/PatchCommitter.ts#L115),
  [PatchCommitter.ts:137](src/domain/services/PatchCommitter.ts#L137),
  [GitGraphAdapter.ts:196](src/infrastructure/adapters/GitGraphAdapter.ts#L196)).
- Cut live release status from the README. The README should not maintain a
  prose release dashboard; route readers to changelog and releases instead.
- Replace the `Vision` link with focused topics. `VISION.md` is a retirement
  target, not a future public dependency.
- Rewrite "production ready" into supported-use wording tied to shipped,
  transition, and diagnostic surfaces. Runtime source supports transitional
  and diagnostic labels; it does not make a blanket production claim
  ([createBoundedMemoryCapabilityReport.ts:15](src/domain/memory/createBoundedMemoryCapabilityReport.ts#L15)).

## Roll-in recommendation

Keep the README as the product front door: problem, fit, shortest install,
small worldline example, small optic example, and links to topics. Move concept
maps, Continuum theory, storage internals, cost posture, and release status out
of the root page.
