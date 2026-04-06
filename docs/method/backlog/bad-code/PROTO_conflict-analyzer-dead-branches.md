# ConflictAnalyzerService has dead and self-cancelling branches

**Effort:** S

## What's wrong

`src/domain/services/strand/ConflictAnalyzerService.js` contains a few branches that either cannot fire through the public analysis path or cancel themselves out:

- `normalizeOptions()` uses `raw.strandId ?? raw.strandId`, which is a no-op expression and likely a typo or leftover refactor seam.
- `emitTruncationDiagnostic()` guards against `scannedFrames.length === 0`, but its caller only invokes it when truncation happened with a positive `maxPatches`, so the empty case should be unreachable.
- `normalizeEffectPayload()` has a `BlobValue` branch, but `buildTargetIdentity()` has no `BlobValue` target builder, so the analyzer returns early with `anchor_incomplete` before the `BlobValue` effect normalization can ever run.

## Suggested fix

- Replace the self-nullish `strandId` normalization with a single `raw.strandId`.
- Either remove the unreachable `emitTruncationDiagnostic()` empty guard or make the caller semantics explicit so the branch can be justified.
- Decide whether `BlobValue` should be analyzable:
  - If yes, add a target-identity strategy for it.
  - If no, remove the dead `BlobValue` effect-normalization branch.
