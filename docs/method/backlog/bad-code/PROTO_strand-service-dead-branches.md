# PROTO_strand-service-dead-branches

## Why

`StrandService.js` reached `98.56%` line coverage during cycle `0010`, but the remaining uncovered lines appear to be structurally dead or blocked by stricter upstream validation rather than honestly untested behavior.

That matters because continued branch-chasing here is likely to produce fake tests instead of useful executable spec.

## Evidence

Coverage residue after the latest `npm run test:coverage` pass:

- `src/domain/services/strand/StrandService.js:388`
- `src/domain/services/strand/StrandService.js:404`
- `src/domain/services/strand/StrandService.js:449`
- `src/domain/services/strand/StrandService.js:580`
- `src/domain/services/strand/StrandService.js:861`

Observed causes:

1. `normalizeQueuedIntents()` dead-ish guards
   - `388` is the non-array fallback.
   - `404` is the malformed-entry drop path.
   - These are effectively blocked by `parseStrandBlob()`, which already requires `intentQueue.intents` to be an array of valid intent objects before `StrandService` hydrates the descriptor.

2. `normalizeRejectedCounterfactuals()` fallback
   - `449` is the non-array fallback.
   - This is also blocked by `parseStrandBlob()`, which validates `evolution.lastTick.rejected` as an array before hydration.

3. `readOverlaysEqual()` missing-candidate branch
   - `580` is reached only through `normalizedDescriptorMatches()`.
   - In `_hydrateOverlayMetadata()`, both `descriptorReadOverlays` and `braidedReadOverlays` are normalized from the same persisted `descriptor.braid?.readOverlays` source, so the “missing candidate” branch appears impossible under current control flow.

4. `normalizeBraidedStrandIds()` null branch after normalization
   - `861` throws `braidedStrandIds[] must not be empty`.
   - In practice, `normalizeOptionalString()` throws first for empty or whitespace-only strings, so this branch looks unreachable.

## Why It Stinks

- The code advertises defensive branches that current runtime flow cannot actually take.
- Coverage residue becomes misleading, because it looks like missing behavior when it is really dead logic or redundant fallback.
- This creates pressure for dishonest tests instead of honest simplification.

## Suggested Fix

1. Remove or collapse the dead fallback branches whose inputs are already ruled out by `parseStrandBlob()`.
2. Inline or simplify `readOverlaysEqual()` / `normalizedDescriptorMatches()` if the compared arrays are always derived from the same source.
3. Simplify `normalizeBraidedStrandIds()` so the empty-entry case is handled in one place instead of split between `normalizeOptionalString()` and the later null check.
4. Re-run coverage after cleanup and ratchet only against reachable behavior.

## Scope

Small cleanup / honesty pass. This is not the full `StrandService` decomposition task.
