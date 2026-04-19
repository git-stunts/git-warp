# Bad-Code Legend Doc Renames Batch 05

The `MODEL` and `CAST` sections are now canonically defined, but these
paths still expose old prefixes or non-normalized names.

This slice keeps the churn capped at 10 files while finishing the
remaining awkward cases at the edge of `MODEL`.

## Fix

Rename each file below, preserve body content, update
`docs/method/backlog/bad-code/README.md`, and repair any in-repo
references to the old path.

## Files

- `docs/method/backlog/bad-code/IncrementalIndexUpdater-shape-sludge.md` -> `docs/method/backlog/bad-code/MODEL_incremental-index-updater-shape-sludge.md`
- `docs/method/backlog/bad-code/PROTO_neighbor-edge-typedef.md` -> `docs/method/backlog/bad-code/MODEL_neighbor-edge-typedef.md`
- `docs/method/backlog/bad-code/PROTO_strand-typedef-corridor.md` -> `docs/method/backlog/bad-code/MODEL_strand-typedef-corridor.md`
- `docs/method/backlog/bad-code/PROTO_typedef-statediffresult-to-class.md` -> `docs/method/backlog/bad-code/MODEL_typedef-statediffresult-to-class.md`
- `docs/method/backlog/bad-code/TRUST_trust-assessment-typedef.md` -> `docs/method/backlog/bad-code/MODEL_trust-assessment-typedef.md`
- `docs/method/backlog/bad-code/TRUST_trust-state-validation.md` -> `docs/method/backlog/bad-code/MODEL_trust-state-validation.md`
- `docs/method/backlog/bad-code/CC_call-internal-runtime-method.md` -> `docs/method/backlog/bad-code/CAST_call-internal-runtime-method.md`
- `docs/method/backlog/bad-code/CC_openWarpGraph-cast-cosplay.md` -> `docs/method/backlog/bad-code/CAST_openWarpGraph-cast-cosplay.md`
- `docs/method/backlog/bad-code/CC_reducer-silent-unknown-op-type.md` -> `docs/method/backlog/bad-code/CAST_reducer-silent-unknown-op-type.md`
- `docs/method/backlog/bad-code/CC_warpstate-prop-unknown-value.md` -> `docs/method/backlog/bad-code/CAST_warpstate-prop-unknown-value.md`
