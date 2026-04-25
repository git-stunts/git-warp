---
id: API_delete-warpruntime-class
blocked_by: []
blocks:
  - API_kill-warpruntime
  - TS_publish-pipeline
feature: api-capabilities
---

# Delete the WarpRuntime class and exports

Once the `openWarpRuntime()` bridge is gone from `openWarpGraph()` and the
`WarpCore` prototype/runtime bridge is gone, the remaining delete becomes
honest:

- remove `WarpRuntime` as the public/internal graph product
- delete `openWarpRuntime()` and `getWarpRuntimePrototype()`
- migrate tests, helpers, and adapters that still import `WarpRuntime`

This is the final executable delete cut, not the old umbrella.
