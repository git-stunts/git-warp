---
accuracy_report: true
schema: git-warp-doc-accuracy-v1
source_document: docs/BEARING.md
created: 2026-06-24
last_updated: 2026-06-24
reviewer: codex
evidence_policy: source-code-only
lifecycle: temporary_planning
planning_phase: documentation_reorganization
retire_after: recommendations_executed
status: active
score: 35
score_label: useful_status_snapshot_wrong_artifact
disposition: delete
keep:
  - optic_transition_boundary
  - native_continuum_non_goal
  - blank_optic_target_rule
roll_into:
  - docs/topics/optics.md
  - CHANGELOG.md
  - docs/releases/
cut:
  - live_pr_status
  - issue_status_snapshot
  - release_checklist
  - signpost_role
---

# BEARING accuracy report

## Verdict

`BEARING.md` is a live status warehouse. That made sense for a previous
operating mode, but it conflicts with the new documentation strategy. Delete it
after extracting the small amount of durable product truth.

Score: **35/100**.

Disposition: **delete**.

Lifecycle rule: this report is temporary planning evidence for the docs
reorganization pass and should be deleted after `BEARING.md` is removed.

## Worth keeping

- Keep the `Optic` transition boundary. The runtime exports `Optic` and lowers
  fluent worldline optics through that reified object ([index.ts:327](../index.ts#L327),
  [WorldlineOptic.ts:35](../src/domain/services/optic/WorldlineOptic.ts#L35)).
- Keep the checkpoint-tail basis boundary. Basis verification is explicit and
  fails with `E_OPTIC_NO_BOUNDED_BASIS` when evidence is absent or invalid
  ([CheckpointTailBasisVerifier.ts:35](../src/domain/services/optic/CheckpointTailBasisVerifier.ts#L35),
  [CheckpointTailBasisVerifier.ts:103](../src/domain/services/optic/CheckpointTailBasisVerifier.ts#L103)).
- Keep blank-target schema invalidity in the optic topic. The `Optic` runtime
  validates schema/support posture and raises optic schema errors
  ([Optic.ts:150](../src/domain/services/optic/Optic.ts#L150),
  [OpticReadFailureSchemaError.ts:3](../src/domain/services/optic/OpticReadFailureSchemaError.ts#L3)).

## What to cut or rewrite

- Cut PR numbers, issue counts, release gates, and "where are we" snapshots.
  They are live workflow state, not stable documentation.
- Cut the signpost role. Root `README.md`, root `ARCHITECTURE.md`,
  `CHANGELOG.md`, generated catalogs, and `docs/topics/*` should own the
  current docs shape.
- Move release evidence to `docs/releases/` and release history to
  `CHANGELOG.md`.

## Roll-in recommendation

Extract the optic boundary into `docs/topics/optics.md`, release facts into
release evidence/changelog, then delete `docs/BEARING.md` and update all links.
