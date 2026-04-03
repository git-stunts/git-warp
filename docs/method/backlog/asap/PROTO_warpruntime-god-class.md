# WarpRuntime God Class Decomposition

**Effort:** XL — **Status: MOSTLY COMPLETE**

## Problem (original)

The WarpRuntime class delegated to 12 method-mixin files in `src/domain/warp/` via `wireWarpMethods()` + `_wire.js`, which defeated static analysis and made the API surface invisible.

## Resolution

### PR #74 — Phase 1-3 (6 controllers)
StrandController, ComparisonController, SubscriptionController, ProvenanceController, ForkController, QueryController. Extracted from independent mixin files.

### This PR — Phase 4 (kernel extraction)
PatchController, CheckpointController, MaterializeController. Extracted from the tightly coupled mutation core (patch.methods.js, checkpoint.methods.js, materialize.methods.js, materializeAdvanced.methods.js).

**`wireWarpMethods()` and `_wire.js` are deleted.** All methods use `defineProperty` delegation through 9 controllers. WarpRuntime is now a thin facade: constructor + delegation loops.

## Remaining work

- **Phase 5 (kernel tightening)**: The 3 kernel controllers still reach into `this._host` for 20+ fields. These field accesses could be narrowed to explicit constructor-injected capabilities. Lower priority — the organizational win is already delivered.
- The SyncController (extracted in M10 era) predates the defineProperty delegation pattern — could be unified but is not blocking.
