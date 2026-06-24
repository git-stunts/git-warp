---
accuracy_report: true
schema: git-warp-doc-accuracy-v1
source_document: docs/GUIDE.md
created: 2026-06-24
last_updated: 2026-06-24
reviewer: codex
evidence_policy: source-code-only
lifecycle: temporary_planning
planning_phase: documentation_reorganization
retire_after: recommendations_executed
status: active
score: 70
score_label: useful_patterns_too_broad
disposition: split
keep:
  - builder_pattern_examples
  - redaction_not_encryption_warning
  - sync_refspec_guidance
  - provenance_diagnostic_pattern
roll_into:
  - docs/topics/getting-started.md
  - docs/topics/observers.md
  - docs/topics/querying.md
  - docs/topics/sync.md
  - docs/topics/provenance.md
cut:
  - standalone_builder_guide
  - unverified_example_outputs
  - broad_large_graph_safety_language
---

# Guide accuracy report

## Verdict

The builder guide contains many useful recipes, but it has become a second
README plus tutorial plus reference. It should be split into topic pages by
reader task.

Score: **70/100**.

Disposition: **split**.

Lifecycle rule: this report is temporary planning evidence for the docs
reorganization pass and should be deleted after the guide is split.

## Worth keeping

- Keep worldline write/read patterns. The methods are runtime-backed on
  `WarpWorldline` and `ProjectionHandle` ([WarpWorldline.ts:75](../src/domain/WarpWorldline.ts#L75),
  [ProjectionHandle.ts:245](../src/domain/services/ProjectionHandle.ts#L245)).
- Keep the observer redaction warning. Source-level `Aperture` is a visibility
  policy, and `Observer` filters matched nodes and properties; it is not
  storage encryption ([Aperture.ts:7](../src/domain/types/Aperture.ts#L7),
  [Observer.ts:290](../src/domain/services/query/Observer.ts#L290)).
- Keep query builder patterns. `match`, `where`, `outgoing`, `incoming`,
  `select`, `aggregate`, `supportRule`, and `run` are source-backed
  ([QueryBuilder.ts:175](../src/domain/services/query/QueryBuilder.ts#L175),
  [QueryBuilder.ts:183](../src/domain/services/query/QueryBuilder.ts#L183),
  [QueryBuilder.ts:260](../src/domain/services/query/QueryBuilder.ts#L260)).
- Keep provenance diagnostics as lower-level graph usage. The capability marks
  `materializeSlice()` diagnostic/provenance inspection, not first-use reading
  ([ProvenanceCapability.ts:22](../src/domain/capabilities/ProvenanceCapability.ts#L22)).

## What to cut or rewrite

- Split this page. It combines tutorial, how-to, explanation, reference, and
  architecture.
- Remove or label large output comments that are not produced by executable
  examples.
- Move redaction/encryption material to an observer or security topic and keep
  the builder guide task-focused.
- Narrow large-graph safety language to per-surface cost posture.

## Roll-in recommendation

Create topic pages for querying, sync, observers, and provenance. Keep only the
first-use path in the getting-started tutorial.
