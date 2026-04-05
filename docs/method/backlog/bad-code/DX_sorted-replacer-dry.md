# sortedReplacer and validation helpers duplicated across 3 files

**Effort:** XS

## What's Wrong

`sortedReplacer()` is copy-pasted identically in `TickReceipt.js`,
`EffectEmission.js`, and `DeliveryObservation.js`. The helpers
`requireNonEmptyString()` and `validateTimestamp()` are also duplicated
across these files. `canonicalStringify.js` already exists in the
codebase and could host the shared replacer.

## Suggested Fix

- Move `sortedReplacer()` into `canonicalStringify.js` (or re-export
  from it).
- Extract `requireNonEmptyString()` and `validateTimestamp()` into a
  shared validation-helpers module under `src/domain/utils/`.
- Update the three consuming files to import from the shared modules.
