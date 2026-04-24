---
id: API_delete-openwarpruntime-bridge
blocked_by: []
blocks:
  - API_delete-warpruntime-class
feature: api-capabilities
---

# Delete the openWarpRuntime bridge under openWarpGraph

`openWarpGraph()` no longer imports `WarpRuntime` directly, but
[WarpGraphRuntimeBridge.ts](/Users/james/git/git-stunts/git-warp/src/domain/warp/WarpGraphRuntimeBridge.ts)
still does. The public composition root still reaches the runtime class through
that bridge and therefore still depends on `openWarpRuntime()` as the internal
product.

This cut is to:

- replace the `openWarpRuntime()` bridge under `openWarpGraph()`
- make the bridge return an honest graph runtime product that is not the
  `WarpRuntime` class
- remove the last public-factory dependency on `src/domain/WarpRuntime.ts`

