---
id: API_kill-warpruntime
blocks:
  - TS_publish-pipeline
blocked_by:
  - API_migrate-consumers-to-capabilities
feature: api-capabilities
---

# Delete WarpRuntime and all defineProperty sludge

Final step of the API redesign. Remove:

- `src/domain/WarpRuntime.js` (1041 LOC god object)
- `src/domain/warp/_wiredMethods.d.ts` (708 LOC hand-maintained lies)
- All 9 `defineProperty` loops (~230 LOC of identical boilerplate)
- The `_internal.ts` shim

Boot logic (constructor, `open()`) migrates into `openWarpGraph()`.
Controller instantiation moves into the factory.

## Boot migration: WarpRuntime → openWarpGraph()

The following construction steps currently split across
`WarpRuntime.constructor` and `WarpRuntime.open()` move into
`openWarpGraph()`:

1. **Resolve writerId** — read from config or generate a new UUID.
2. **Normalize trust config** — merge caller-supplied trust options
   with defaults, validate key material.
3. **Build effect pipeline** — wire persistence, codec, crypto, clock,
   and logger ports into an effect context.
4. **Construct controllers** — instantiate QueryController,
   MaterializeController, StrandService, IncrementalIndexUpdater with
   their typed dependencies.
5. **Wire capabilities** — create capability objects (QueryCapability,
   MaterializeCapability, SyncCapability, etc.) backed by the
   controllers.
6. **Freeze** — `Object.freeze()` the returned `WarpGraph` instance.
   No further mutation of the capability surface.

`openWarpGraph()` is the single public entry point. It is async
(persistence discovery requires I/O). The returned `WarpGraph` is a
frozen capability bag — no `defineProperty` loops, no `_internal`
shim, no god object.

Depends on: all consumers migrated to capability interfaces.
