---
id: API_delete-warpruntime-class
blocked_by:
  - PORT_extract-runtime-host-product
  - DX_migrate-tests-and-seed-helpers-off-warpruntime
blocks:
  - API_kill-warpruntime
  - TS_publish-pipeline
feature: api-capabilities
---

# Delete the WarpRuntime class and exports

The `openWarpGraph()` bridge and the `WarpCore` runtime bridge are both gone,
but the class delete is still not one patch. The remaining residue splits into
two real prerequisites:

- `PORT_extract-runtime-host-product`
- `DX_migrate-tests-and-seed-helpers-off-warpruntime`

Only after those land does the remaining delete become honest:

- remove `WarpRuntime` as the public/internal graph product
- delete `openWarpRuntime()` and `getWarpRuntimePrototype()`
- migrate tests, helpers, and adapters that still import `WarpRuntime`

This note is now the umbrella over that final executable delete.
