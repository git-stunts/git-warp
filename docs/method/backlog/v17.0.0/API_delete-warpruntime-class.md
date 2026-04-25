---
id: API_delete-warpruntime-class
blocked_by: []
blocks:
  - API_kill-warpruntime
  - TS_publish-pipeline
feature: api-capabilities
---

# Delete the WarpRuntime class and exports

The `openWarpGraph()` bridge, the `WarpCore` runtime bridge, the internal
runtime host-product extraction, helper migration, and runtime-suite migration
are all done. Cycle `0082` closed the test/helper migration gate by rerunning
the helper and suite ratchets.

The remaining delete is now honest:

- remove `WarpRuntime` as the public/internal graph product
- delete `openWarpRuntime()` and `getWarpRuntimePrototype()`
- remove the source file/export residue that remains after the test and helper
  migrations

This note is now the next executable runtime-kill cut.
