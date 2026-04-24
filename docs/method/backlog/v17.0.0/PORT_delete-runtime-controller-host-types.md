---
id: PORT_delete-runtime-controller-host-types
blocked_by:
  - API_openwarpgraph-composition-root
blocks:
  - PORT_delete-internal-runtime-shim
  - API_kill-warpruntime
feature: runtime-boundaries
---

# Replace remaining controller and service WarpRuntime host typing

The runtime-wiring surface is gone, but a few controller/service seams still
name `WarpRuntime` directly:

- `src/domain/services/controllers/StrandController.ts`
- `src/domain/services/strand/ConflictAnalyzerService.ts`
- `src/domain/services/controllers/CheckpointController.ts`
- `src/domain/services/controllers/PatchController.ts`
- `src/domain/services/controllers/ForkController.ts`
- `src/domain/services/controllers/SyncControllerTypes.ts`

That residue makes the class deletion look smaller than it really is.

The next honest cut is:

- replace those direct `WarpRuntime` host types with explicit narrower
  contracts
- stop deriving controller surfaces from a concrete runtime class
- leave only the compatibility alias/shim as the final runtime-tail artifact
