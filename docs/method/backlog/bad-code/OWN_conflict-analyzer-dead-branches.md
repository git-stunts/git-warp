---
id: OWN_conflict-analyzer-dead-branches
blocked_by: []
blocks: []
---

# ConflictAnalyzerService has dead and self-cancelling branches

**Effort:** S

## What's wrong

`src/domain/services/strand/ConflictAnalyzerService.js` contains a few branches that either cannot fire through the public analysis path or cancel themselves out:

- `normalizeOptions()` uses `raw.strandId ?? raw.strandId`, which is a no-op expression and likely a typo or leftover refactor seam.
- `emitTruncationDiagnostic()` guards against `scannedFrames.length === 0`, but its caller only invokes it when truncation happened with a positive `maxPatches`, so the empty case should be unreachable.
- `normalizeEffectPayload()` has a `BlobValue` branch, but `buildTargetIdentity()` has no `BlobValue` target builder, so the analyzer returns early with `anchor_incomplete` before the `BlobValue` effect normalization can ever run.
- `matchesTargetSelector()` has a null/undefined fast-path, but `matchesTargetFilter()` already returns early when `normalized.target` is nullish, so that branch is bypassed by the public `analyze()` path.
- `buildTargetIdentity()` still has a legacy raw `PropSet` builder arm, but `normalizeRawOp()` canonicalizes raw `PropSet` into `NodePropSet` or `EdgePropSet` before target construction, so that branch is effectively unreachable unless internals are monkeypatched.
- `addEventualOverrideCandidates()` skips history entries with no `propertyWinnerByTarget`, but `trackAppliedRecord()` populates history and winner state together for applied property writes, so the skip path appears self-cancelling.
- `compareConflictTraces()` still has a deepest fallback for same-kind, same-target, same-winner conflicts ordered by `conflictId`; current grouping behavior makes that tie shape difficult or impossible to produce through public analysis.

## Suggested fix

- Replace the self-nullish `strandId` normalization with a single `raw.strandId`.
- Either remove the unreachable `emitTruncationDiagnostic()` empty guard or make the caller semantics explicit so the branch can be justified.
- Decide whether `BlobValue` should be analyzable:
  - If yes, add a target-identity strategy for it.
  - If no, remove the dead `BlobValue` effect-normalization branch.
- Collapse duplicated null handling so target-selector matching has one gate, not two.
- Either delete the legacy raw `PropSet` target branch or move normalization later so the branch has a reason to exist.
- Tighten the collector invariants around applied property history and final winners so dead defensive branches can be removed or justified.
- Revisit the trace grouping contract and either prove the final `conflictId` tiebreak can occur or simplify the comparator to the tie shapes that actually exist.
