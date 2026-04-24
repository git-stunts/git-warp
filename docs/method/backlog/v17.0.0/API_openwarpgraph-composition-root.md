---
id: API_openwarpgraph-composition-root
blocked_by: []
blocks:
  - PORT_delete-runtime-controller-host-types
  - API_kill-warpruntime
feature: api-capabilities
---

# Move openWarpGraph and WarpCore boot off WarpRuntime.open

After cycles `0067` through `0069`, the remaining public/runtime bridge is the
composition root itself:

- `src/domain/warp/WarpGraphRuntimeBridge.ts`
- `src/domain/warp/WarpCoreRuntimeBridge.ts`
- `WarpRuntime.open()`

Those seams still teach the boot path as “open a `WarpRuntime`, then expose the
public surface from it.”

The next honest cut is:

- move open options and runtime boot orchestration behind public composition
  roots
- stop importing `WarpRuntime` directly from the `WarpGraph` / `WarpCore`
  bridges
- shrink `WarpRuntime` until it is no longer the public boot carrier

This does not delete `WarpRuntime`; it removes the composition-root residue so
the final kill does not have to drag `open()` along with it.
