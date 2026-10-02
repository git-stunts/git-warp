# Public node and edge byte attachments

Status: implementation plan for [#901](https://github.com/git-stunts/git-warp/issues/901). The API is implemented on draft PR #927; this record distinguishes completed witnesses from remaining merge gates. Prerequisite: [#818](https://github.com/git-stunts/git-warp/issues/818), delivered by [#926](https://github.com/git-stunts/git-warp/pull/926). All slices remain in one #901 PR, which lands after #818.

Implementation checkpoint: #926 is merged. Draft #927 implements `Lane.stageContent()` and node/edge attach/clear intents with Runtime-owned staging provenance, atomic publication roots, bounded owner observation, retained-intent recovery and strand settlement. Real-Git tests cover replacement, clearing, rollback, foreign staging, pruned staging and bytes surviving settlement/reopen/GC. Pinned public node/edge observers now stream through Runtime-owned activity leases using bounded full-history projection. Docker regressions cover historical reads, concurrent writes, strand reopening and GC. The installed packed-artifact witness covers both owner types, staging failures, rollback, historical reads, checkpoint/reopen/GC and a 64 MiB generated stream. Full validation and final review are still required before this PR can merge. Existing internal readers in the write tests do not establish supported public stream-read reachability.

## Observable outcome

A consumer importing the packed supported package can attach, replace, clear and stream bytes on nodes and edges through Runtime/Lane, with explicit ownership, admission and observation evidence. The same operations survive reopen, checkpoint, garbage collection, historical observation and concurrent writes.

## Write boundary

Stage bytes asynchronously through Runtime-owned storage and activity lifetime. A staged value is immutable and carries validated identity, MIME metadata and plaintext size; it contains no retained byte buffer. Construction alone does not authorize publication: the Runtime must validate the staging binding and storage provenance.

Build serializable attach/clear intents from the staged value and an explicit node or edge owner. Streams and callbacks never enter canonical intent descriptors. Attach also implements replacement. Owner creation and attachment must compose in an atomic intent array. Staging failure and a later failed intent publish no partial graph result.

Extend lowering, admission and publication inspection together. Attachment metadata emits multiple operations; publication inspection must verify their exact order, owner and values. Persisted-intent recovery and strand settlement must preserve the attachment operation and retention requirements. Staged bytes become retained through the same publication as the owner attachment; orphan staging is not successful graph publication.

## Observation boundary

Resolve owner liveness, content identity and metadata at one captured observer coordinate. Opening a stream from a historical reading must use that reading's immutable content identity, even after a later replacement or clear. Activity lifetime and cancellation cover stream consumption as well as metadata lookup.

Preserve the existing ContentAttachmentProjection lineage rule: MIME and size are accepted only when they belong to the winning content write. Three independent scalar-property reads do not establish this. The public implementation must preserve the relevant event identities and lifecycle rules.

The existing bounded optic has node-property reads but lacks the equivalent edge-content read. Resolve that implementation before exposing the public reader. A targeted reader must retain provenance; a full pinned-state replay must describe its cost and evidence honestly. Do not attach checkpoint-tail indexed evidence to a full replay.

## Public vocabulary

Runtime remains the sole runtime value exported from the package root. Public semantic types and advanced builders must pass the entire declaration-closure firewall. Do not expose storage adapters or internals to restore attachments. Final API names are decided with the executable consumer prototype.

## Acceptance matrix

- Node and edge attach, replace, clear, metadata and stream reads through supported package imports.
- Atomic owner creation plus attachment; rollback when a later intent fails.
- Missing storage, invalid owners, failed staging, malformed chunks, declared-size mismatch and interrupted reads.
- Shutdown during work, single-owner activity leases and producer finalization.
- Historical reads after replacement and clearing, including metadata from the same winning write.
- Concurrent attachment updates with deterministic owner/content outcomes and witnessed evidence.
- Retained-intent recovery and strand settlement preserve atomicity and retention.
- Reopen, checkpoint and Git garbage collection preserve reachable payloads.
- Packed-consumer proof without internal source imports, plus executable public examples.
- COPY-only Docker for every test, benchmark and consumer witness; no host repository mounts.

## Exclusions and completion

Byte attachments do not establish recursive structural WARP ownership (#903). No eager unbounded getter and no git-warp release are part of this issue. #902 expands the consumer gate; it does not receive missing minimum proof from this PR.

Completion requires the complete acceptance matrix, current-head independent review, green CI, a normal merge to main and linked issue/PR/integration evidence in GitHub and Linear. The implementation checkpoint above records completed evidence; it is not a release announcement.
