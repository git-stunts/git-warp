# Extract controllers/ from domain/services/

Move the 10 controller files into `src/domain/services/controllers/`.

## Files

- CheckpointController.js (424)
- ComparisonController.js (1198)
- ForkController.js (293)
- MaterializeController.js (1004)
- PatchController.js (500)
- ProvenanceController.js (243)
- QueryController.js (964)
- StrandController.js (182)
- SubscriptionController.js (247)
- SyncController.js (680)

## Why

Controllers are the WarpRuntime delegation targets — the only files
that reference `this._host`. Separating them makes the remaining
services clearly "internal domain services" vs "API surface".

## Scope

Move files, update imports in WarpRuntime.js and any cross-references,
verify lint + tests. No behavioral changes.

## Source

Cycle 0004 analysis.
