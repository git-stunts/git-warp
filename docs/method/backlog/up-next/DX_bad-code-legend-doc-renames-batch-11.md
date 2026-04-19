# Bad-Code Legend Doc Renames Batch 11

The `SUB` group is small enough that this batch can finish it and
start the first `SPEC` renames.

That keeps the queue moving without creating an oversized docs change.

## Fix

Rename each file below, preserve body content, update
`docs/method/backlog/bad-code/README.md`, and repair any in-repo
references to the old path.

## Files

- `docs/method/backlog/bad-code/CC_cas-init-duplication.md` -> `docs/method/backlog/bad-code/SUB_cas-init-duplication.md`
- `docs/method/backlog/bad-code/CC_cbor-checkpoint-crdt-serialization.md` -> `docs/method/backlog/bad-code/SUB_cbor-checkpoint-crdt-serialization.md`
- `docs/method/backlog/bad-code/CC_p5-serialization-on-types.md` -> `docs/method/backlog/bad-code/SUB_p5-serialization-on-types.md`
- `docs/method/backlog/bad-code/PERF_toposort-full-adjacency.md` -> `docs/method/backlog/bad-code/SUB_toposort-full-adjacency.md`
- `docs/method/backlog/bad-code/PROTO_bitmap-neighbor-provider-dead-false-branch.md` -> `docs/method/backlog/bad-code/SUB_bitmap-neighbor-provider-dead-false-branch.md`
- `docs/method/backlog/bad-code/PROTO_gc-stale-cache-invalidation.md` -> `docs/method/backlog/bad-code/SUB_gc-stale-cache-invalidation.md`
- `docs/method/backlog/bad-code/PROTO_incremental-index-updater-null-proto-rewrap-dead-branch.md` -> `docs/method/backlog/bad-code/SUB_incremental-index-updater-null-proto-rewrap-dead-branch.md`
- `docs/method/backlog/bad-code/PROTO_streaming-bitmap-index-builder-serialization-tail.md` -> `docs/method/backlog/bad-code/SUB_streaming-bitmap-index-builder-serialization-tail.md`
- `docs/method/backlog/bad-code/CC_audit-tests-vacuous-early-return.md` -> `docs/method/backlog/bad-code/SPEC_audit-tests-vacuous-early-return.md`
- `docs/method/backlog/bad-code/CC_codec-module-untested.md` -> `docs/method/backlog/bad-code/SPEC_codec-module-untested.md`
