---
id: API_kill-warpruntime
blocks:
  - TS_publish-pipeline
blocked_by: []
feature: api-capabilities
---

# Delete WarpRuntime and the remaining bridge residue

Final step of the API redesign. Remove:

- the remaining `WarpRuntime` class as a bridge/composition-root carrier
- the remaining internal bridge exports that keep it alive as the repo's
  de facto runtime root
- the remaining tests and internal adapters that still consume it directly

Cycles `0067` through `0069` already removed the old public/runtime helper
surface:

- `WarpGraph.ts` no longer imports `WarpRuntime` directly
- helper-wrapper seams no longer name `WarpRuntime`
- `runtimeWiring.ts` and `_wiredMethods.d.ts` are gone
- the old defineProperty delegation surface is gone

What remains is smaller and more structural:

- `WarpRuntime` still exists as a concrete class and async boot surface
- `openWarpRuntime()` still returns it as the internal runtime product
- internal tests and adapter seams still treat it as the primary graph object

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

Cycle `0066` proved this is not one slice. Cycles `0070` through `0073`
cleared the prerequisite residue:

- `0071` completed the public composition-root cut
- `0072` completed the controller/service host-type cut
- `0073` deleted the `_internal.ts` compatibility shim

This note is now the live remaining runtime-kill cut.
