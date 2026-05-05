# 0127 Runtime Error Reading-Basis Guidance Retro

- Date: 2026-05-04
- Cycle: [0127-runtime-error-reading-basis-guidance](../../design/0127-runtime-error-reading-basis-guidance.md)
- Source task: `SPEC_runtime-error-reading-basis-guidance`

## What Happened

The public docs now taught readings and optics, but runtime diagnostics still
told users to call materialize. That made the code path sound like the old v16
frontdoor even when the public v17 contract had moved on.

This cycle added behavior-level REDs that execute the throwing query and
provenance paths, then replaced the recovery hints with readings/worldline and
provenance-diagnostics guidance.

## What Got Better

- Shared `E_NO_STATE` and `E_STALE_STATE` messages now point to
  `docs/READINGS_AND_OPTICS.md`.
- Provenance missing-index and degraded-cache errors no longer recommend direct
  materialization.
- One stale spy assertion in the error-code tests was replaced with observable
  behavior.

## What Still Smells

- Test files still contain broader materialize-spy clusters and comments that
  belong to `SPEC_materialize-spy-test-clusters`.
- Controller seams may still use `_materializeGraph()` internally until their
  dedicated DAG nodes run.
- Checkpoint schema drift still blocks checkpoint-controller cleanup.

## Next

Pull `BND_checkpoint-schema-contract-drift` next. It is open, contained, and
unblocks checkpoint-controller reading-basis work.
