---
id: PORT_delete-warpcore-runtime-bridge
blocked_by: []
blocks:
  - API_delete-warpruntime-class
feature: runtime-boundaries
---

# Delete the WarpCore runtime bridge and escape hatch

[WarpCoreRuntimeBridge.ts](/Users/james/git/git-stunts/git-warp/src/domain/warp/WarpCoreRuntimeBridge.ts)
still opens a `WarpRuntime`, links `WarpCore.prototype` onto the runtime
prototype, and relies on
[callInternalRuntimeMethod.ts](/Users/james/git/git-stunts/git-warp/src/domain/utils/callInternalRuntimeMethod.ts)
to walk past facade shims.

This cut is to:

- delete the runtime bridge under `WarpCore`
- stop linking `WarpCore.prototype` onto the runtime prototype
- replace `callInternalRuntimeMethod(...)` substrate dispatch with an honest
  explicit core surface

