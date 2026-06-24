---
accuracy_report: true
schema: git-warp-doc-accuracy-v1
source_document: docs/PUBLIC_API_COSTS.md
created: 2026-06-24
last_updated: 2026-06-24
reviewer: codex
evidence_policy: source-code-only
lifecycle: temporary_planning
planning_phase: documentation_reorganization
retire_after: recommendations_executed
status: active
score: 66
score_label: useful_contract_needs_generation
disposition: generate_or_merge
keep:
  - cost_label_vocabulary
  - first_use_vs_diagnostic_distinction
  - machine_inventory_pointer
roll_into:
  - docs/topics/bounded-reads.md
  - docs/generated/public-api-costs.md
  - docs/catalog.yaml
cut:
  - live_release_gate_snapshot
  - hand_maintained_issue_claims
  - standalone_top_level_doc
---

# Public API costs accuracy report

## Verdict

The concept is source-backed and important, but this should become generated or
validated reference rather than a hand-maintained top-level prose page.

Score: **66/100**.

Disposition: **generate_or_merge**.

Lifecycle rule: this report is temporary planning evidence for the docs
reorganization pass and should be deleted after the cost inventory is merged or
generated.

## Worth keeping

- Keep the posture vocabulary. The runtime defines `safe`, `transitional`,
  `diagnostic`, and `legacy` posture tokens, and exposes query helpers on
  `MemoryCapabilityReport` ([MemoryCapabilityPosture.ts:3](../src/domain/memory/MemoryCapabilityPosture.ts#L3),
  [MemoryCapabilityReport.ts:8](../src/domain/memory/MemoryCapabilityReport.ts#L8)).
- Keep the first-use-vs-diagnostic distinction. The runtime report explicitly
  classifies checkpoint-tail optics as transitional, graph-wide materialization
  as diagnostic, and legacy query arrays as legacy
  ([createBoundedMemoryCapabilityReport.ts:25](../src/domain/memory/createBoundedMemoryCapabilityReport.ts#L25),
  [createBoundedMemoryCapabilityReport.ts:31](../src/domain/memory/createBoundedMemoryCapabilityReport.ts#L31)).
- Keep support-rule language. Query plans can expose a `BoundedSupportRule`,
  and support fragments can identify global fallback versus support-fragment
  posture ([QueryBuilder.ts:175](../src/domain/services/query/QueryBuilder.ts#L175),
  [SupportFragmentPlan.ts:74](../src/domain/services/query/SupportFragmentPlan.ts#L74)).

## What to cut or rewrite

- Cut release-gate bullets tied to issue numbers or milestone state. That is
  live status and should be generated or linked, not manually copied into prose.
- Replace the standalone page with generated reference or a topic section that
  links to the machine-readable inventory.
- Reconcile label names. The prose labels include `bounded`, `streaming`,
  `cursor`, and `offline`, while the runtime posture object currently exposes
  `safe`, `transitional`, `diagnostic`, and `legacy`.

## Roll-in recommendation

Move the human explanation into `docs/topics/bounded-reads.md` and generate the
exact inventory into `docs/generated/public-api-costs.md` or a catalog-backed
reference page.
