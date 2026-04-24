---
id: API_kill-warpruntime
blocks:
  - TS_publish-pipeline
blocked_by:
  - API_openwarpgraph-composition-root
  - PORT_delete-runtime-controller-host-types
  - PORT_delete-internal-runtime-shim
feature: api-capabilities
---

# Delete WarpRuntime and the remaining bridge residue

Final step of the API redesign. Remove:

- the remaining `WarpRuntime` class as a bridge/composition-root carrier
- the remaining `_internal.ts` shim
- any host typing that still teaches controllers and helpers to name
  `WarpRuntime` directly

Cycles `0067` through `0069` already removed the old public/runtime helper
surface:

- `WarpGraph.ts` no longer imports `WarpRuntime` directly
- helper-wrapper seams no longer name `WarpRuntime`
- `runtimeWiring.ts` and `_wiredMethods.d.ts` are gone
- the old defineProperty delegation surface is gone

What remains is smaller and more structural:

- composition-root boot still lives on `WarpRuntime.open()`
- controller/service host types still name `WarpRuntime` in a few places
- `_internal.ts` still exists as a compatibility alias

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

Cycle `0066` proved this is not one slice. Cycle `0070` then rewrote the
remaining kill around the actual final order:

- `API_openwarpgraph-composition-root`
- `PORT_delete-runtime-controller-host-types`
- `PORT_delete-internal-runtime-shim`
