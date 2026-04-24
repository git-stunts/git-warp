---
id: PROTO_delete-runtime-wiring-surface
blocked_by:
  - API_warpgraph-runtime-bridge
  - PORT_runtime-helper-wrapper-seams
blocks:
  - API_kill-warpruntime
feature: runtime-boundaries
---

# Delete runtime wiring and _wiredMethods surface

The final runtime deletion cannot happen while these still exist:

- `src/domain/runtimeWiring.ts`
- `src/domain/warp/_wiredMethods.d.ts`
- the defineProperty-based delegation surface on `WarpRuntime.prototype`

This task is to replace that wiring with a truthful static surface or remove it
entirely after the composition root and helper wrappers stop depending on it.
