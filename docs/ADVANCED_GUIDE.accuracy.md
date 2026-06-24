---
accuracy_report: true
schema: git-warp-doc-accuracy-v1
source_document: docs/ADVANCED_GUIDE.md
created: 2026-06-24
last_updated: 2026-06-24
reviewer: codex
evidence_policy: source-code-only
lifecycle: temporary_planning
planning_phase: documentation_reorganization
retire_after: recommendations_executed
status: active
score: 52
score_label: mixed_engine_room_truth_and_falsehoods
disposition: split_and_rewrite
keep:
  - public_roots_and_boundaries
  - redaction_not_encryption
  - cas_content_encryption_policy
  - stream_port_boundaries
  - diagnostic_api_scope
roll_into:
  - ARCHITECTURE.md
  - docs/topics/git-substrate.md
  - docs/topics/security-and-trust.md
  - docs/topics/streams-and-storage.md
cut:
  - empty_tree_patch_anatomy
  - checkpoint_500_default_claim
  - standalone_engine_room_guide
  - issue_backlog_links_as_current_truth
---

# Advanced guide accuracy report

## Verdict

The advanced guide has useful engine-room material, but it contains hard
storage and checkpoint inaccuracies. It should be split into architecture and
focused advanced topics.

Score: **52/100**.

Disposition: **split_and_rewrite**.

Lifecycle rule: this report is temporary planning evidence for the docs
reorganization pass and should be deleted after the advanced guide is split.

## Worth keeping

- Keep the public-root boundary. The source supports `openWarpWorldline()`,
  `openWarpGraph()`, and legacy facade compatibility as distinct surfaces
  ([WarpWorldline.ts:150](../src/domain/WarpWorldline.ts#L150),
  [WarpGraph.ts:345](../src/domain/WarpGraph.ts#L345),
  [index.ts:334](../index.ts#L334)).
- Keep observer redaction as non-encryption. The source models `Aperture` as a
  visibility policy, while encryption is a separate CAS content policy
  ([Aperture.ts:7](../src/domain/types/Aperture.ts#L7),
  [CasContentEncryptionPolicy.ts:99](../src/infrastructure/adapters/CasContentEncryptionPolicy.ts#L99)).
- Keep vault-backed CAS encryption details after tightening them to source.
  Supported schemes are `whole`, `framed`, and `convergent`; legacy schemes are
  rejected for current writes ([CasContentEncryptionPolicy.ts:3](../src/infrastructure/adapters/CasContentEncryptionPolicy.ts#L3),
  [CasContentEncryptionPolicy.ts:223](../src/infrastructure/adapters/CasContentEncryptionPolicy.ts#L223)).
- Keep stream-port boundaries. The source has `WarpStream` and streamed patch,
  commit-log, and index surfaces ([WarpStream.ts:34](../src/domain/stream/WarpStream.ts#L34),
  [PatchJournalPort.ts:57](../src/ports/PatchJournalPort.ts#L57)).

## What to cut or rewrite

- Rewrite patch anatomy. Patch commits can write patch/content trees and use
  `commitNodeWithTree`; they do not universally point at the empty tree
  ([PatchCommitter.ts:115](../src/domain/services/PatchCommitter.ts#L115),
  [GitGraphAdapter.ts:200](../src/infrastructure/adapters/GitGraphAdapter.ts#L200)).
- Cut `checkpointPolicy: { every: 500 }` as a default. Runtime options accept
  optional `checkpointPolicy`, and undefined means no policy
  ([RuntimeHostBoot.ts:72](../src/domain/warp/RuntimeHostBoot.ts#L72),
  [RuntimeHostBoot.ts:210](../src/domain/warp/RuntimeHostBoot.ts#L210)).
- Replace issue-backlog links with focused topic pages or generated issue
  views.
- Split the page into durable architecture and topic material.

## Roll-in recommendation

Move stable boundaries to root `ARCHITECTURE.md`, Git storage to
`docs/topics/git-substrate.md`, encryption/trust to
`docs/topics/security-and-trust.md`, and stream internals to
`docs/topics/streams-and-storage.md`.
