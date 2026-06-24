---
accuracy_report: true
schema: git-warp-doc-accuracy-v1
source_document: docs/GETTING_STARTED.md
created: 2026-06-24
last_updated: 2026-06-24
reviewer: codex
evidence_policy: source-code-only
lifecycle: temporary_planning
planning_phase: documentation_reorganization
retire_after: recommendations_executed
status: active
score: 72
score_label: mostly_accurate_needs_topic_move
disposition: revise
keep:
  - first_success_tutorial
  - worldline_open_commit_read_path
  - explicit_warp_refspecs
  - observer_intro
roll_into:
  - docs/topics/getting-started.md
  - README.md
cut:
  - unverified_example_outputs
  - duplicate_next_steps_to_retired_docs
  - broad_boundedness_claims
---

# Getting started accuracy report

## Verdict

This is one of the healthier public docs. It has a clear first-success task and
mostly follows the current worldline-first API, but it should move into
`docs/topics/` and lose links into retiring top-level docs.

Score: **72/100**.

Disposition: **revise**.

Lifecycle rule: this report is temporary planning evidence for the docs
reorganization pass and should be deleted after the tutorial recommendations
are executed.

## Worth keeping

- Keep `openWarpWorldline()` as the tutorial entry. It maps `worldlineName` to
  the runtime graph name and returns the frozen `WarpWorldline` handle
  ([WarpWorldline.ts:150](../src/domain/WarpWorldline.ts#L150),
  [WarpWorldline.ts:162](../src/domain/WarpWorldline.ts#L162)).
- Keep `commit()` as the first write. The method delegates to the runtime patch
  path and returns the patch commit SHA ([WarpWorldline.ts:75](../src/domain/WarpWorldline.ts#L75),
  [PatchCommitter.ts:137](../src/domain/services/PatchCommitter.ts#L137)).
- Keep live and pinned reads. `live()` creates a `ProjectionHandle`, and
  `seek()` returns another `ProjectionHandle` over the selected source
  ([WarpWorldline.ts:79](../src/domain/WarpWorldline.ts#L79),
  [ProjectionHandle.ts:113](../src/domain/services/ProjectionHandle.ts#L113)).
- Keep the observer introduction. `Aperture` supports `match`, `expose`,
  `redact`, and optional `basis`; `observer()` delegates through the live
  worldline ([Aperture.ts:7](../src/domain/types/Aperture.ts#L7),
  [WarpWorldline.ts:87](../src/domain/WarpWorldline.ts#L87)).

## What to cut or rewrite

- Rewrite generated-looking example outputs as verified, representative, or
  illustrative. The source supports the methods, but comments like
  `patch1 = 'abc123...'` are not executable evidence.
- Narrow bounded-read claims to exact surfaces. `BoundedSupportRule` marks
  wildcard discovery as global discovery, while exact node ids and bounded
  traversals have bounded support ([BoundedSupportRule.ts:85](../src/domain/services/query/BoundedSupportRule.ts#L85),
  [BoundedSupportRule.ts:111](../src/domain/services/query/BoundedSupportRule.ts#L111)).
- Replace next-step links to retiring top-level guide documents with topic
  links.

## Roll-in recommendation

Move this to `docs/topics/getting-started.md` and keep it as the first-success
tutorial. Do not merge it into the README; the root README should link to it.
