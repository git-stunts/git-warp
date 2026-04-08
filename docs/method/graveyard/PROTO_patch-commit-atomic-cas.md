# Atomic CAS for Patch Commits

**Effort:** M

## Problem

`PatchBuilderV2.commit()` currently does an optimistic stale-parent
check on the writer ref and then advances the ref with plain
`updateRef()`. That leaves a time-of-check/time-of-use window for the
same writer across isolated processes: two builders can validate
against the same parent, create sibling patch commits, and both report
success while the last unconditional ref update wins.

The result is not a clean conflict. It is worse: one mutation can
become unreachable from the visible writer tip even though the caller
was told the commit succeeded.

## Notes

- Use `compareAndSwapRef()` for the final writer-ref advance in the
  patch commit path instead of `readRef()` plus unconditional
  `updateRef()`.
- Keep `WRITER_CAS_CONFLICT` as the real concurrent-advance signal,
  including `expectedSha` and `actualSha`.
- If CAS fails but the ref tip is still unchanged, bounded retry is
  acceptable for transient lock contention. If the tip changed, fail
  and require re-materialization.
- `TrustRecordService` already has the closest in-repo model for CAS
  plus retry; use that shape instead of inventing a second conflict
  policy.

---
**Graveyarded:** 2026-04-08 — CAS logic exists in PatchBuilderV2, RefPort, CasBlobAdapter.
