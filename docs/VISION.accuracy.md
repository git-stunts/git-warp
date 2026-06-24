---
accuracy_report: true
schema: git-warp-doc-accuracy-v1
source_document: docs/VISION.md
created: 2026-06-24
last_updated: 2026-06-24
reviewer: codex
evidence_policy: source-code-only
lifecycle: temporary_planning
planning_phase: documentation_reorganization
retire_after: recommendations_executed
status: active
score: 40
score_label: useful_direction_not_current_truth
disposition: delete
keep:
  - product_boundary_positioning
  - continuum_boundary_vocabulary
  - ownership_boundaries
  - git_substrate_alignment
roll_into:
  - README.md
  - ARCHITECTURE.md
  - docs/topics/witnessed-causal-history.md
  - docs/topics/git-substrate.md
cut:
  - current_truth_status
  - empty_tree_storage_claim
  - release_ladder
  - engineering_doctrine_duplication
---

# VISION accuracy report

## Verdict

`VISION.md` contains useful direction, but it should not survive as "current
truth." It mixes product positioning, target doctrine, roadmap, architecture,
and engineering policy. Delete it after extracting a small set of durable
concepts.

Score: **40/100**.

Disposition: **delete**.

Lifecycle rule: this report is temporary planning evidence for the docs
reorganization pass and should be deleted after `VISION.md` is removed.

## Worth keeping

- Keep concise product positioning in root `README.md`: Git-native causal
  history, offline-first writes, provenance-aware graph reads. The first-use
  runtime root is source-backed by `openWarpWorldline()` ([WarpWorldline.ts:150](../src/domain/WarpWorldline.ts#L150)).
- Keep ownership boundaries if they are rewritten as product context, not
  roadmap law.
- Keep Continuum/admission vocabulary only in a focused explanation topic and
  with explicit shipped/transition/target boundaries. The source contains
  translated Continuum evidence posture for current optics, not native
  Continuum witnesshood ([WorldlineOptic.ts:26](../src/domain/services/optic/WorldlineOptic.ts#L26)).
- Keep Git substrate alignment after correcting storage truth. Writer refs are
  real under `refs/warp/<graph>/writers/<writer>` ([RefLayout.ts:200](../src/domain/utils/RefLayout.ts#L200)).

## What to cut or rewrite

- Cut "current truth" framing. This is vision/proposition prose, not runtime
  evidence.
- Rewrite the Git substrate section. Patch commits do not universally point at
  the empty tree ([PatchCommitter.ts:115](../src/domain/services/PatchCommitter.ts#L115),
  [GitGraphAdapter.ts:200](../src/infrastructure/adapters/GitGraphAdapter.ts#L200)).
- Cut the major-version ladder and release gate language. That belongs in
  GitHub milestones, release evidence, or changelog, not a vision document.
- Cut duplicated engineering doctrine; keep policy in contributor/process
  docs.

## Roll-in recommendation

Move one product-positioning paragraph to `README.md`, storage truth to
`docs/topics/git-substrate.md`, and Continuum/admission explanation to
`docs/topics/witnessed-causal-history.md`. Then delete `docs/VISION.md`.
