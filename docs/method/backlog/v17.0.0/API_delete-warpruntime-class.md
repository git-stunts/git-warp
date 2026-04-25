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

The `openWarpGraph()` bridge, the `WarpCore` runtime bridge, the internal
runtime host-product extraction, helper migration, and runtime-suite migration
are all done. The class delete is still not one patch, but the remaining
prerequisite is now singular:

- `DX_migrate-tests-and-seed-helpers-off-warpruntime`

Only after those land does the remaining delete become honest:

- remove `WarpRuntime` as the public/internal graph product
- delete `openWarpRuntime()` and `getWarpRuntimePrototype()`
- remove the source file/export residue that remains after the test and helper
  migrations

This note is now the umbrella over that final executable delete.
