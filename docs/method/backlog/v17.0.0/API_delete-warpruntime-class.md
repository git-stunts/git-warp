---
id: API_delete-warpruntime-class
blocked_by:
  - DX_migrate-tests-and-seed-helpers-off-warpruntime
blocks:
  - API_kill-warpruntime
  - TS_publish-pipeline
feature: api-capabilities
---

# Delete the WarpRuntime class and exports

The `openWarpGraph()` bridge, the `WarpCore` runtime bridge, and the internal
runtime host-product extraction are all done. The class delete is still not one
patch, but the remaining prerequisite is now singular:

- `DX_migrate-tests-and-seed-helpers-off-warpruntime`

Only after those land does the remaining delete become honest:

- remove `WarpRuntime` as the public/internal graph product
- delete `openWarpRuntime()` and `getWarpRuntimePrototype()`
- migrate tests, helpers, and adapters that still import `WarpRuntime`

This note is now the umbrella over that final executable delete.
