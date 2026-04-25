---
id: API_kill-warpruntime
blocks:
  - TS_publish-pipeline
blocked_by:
  - API_delete-warpruntime-class
feature: api-capabilities
---

# Delete WarpRuntime and the remaining bridge residue

Final umbrella for the runtime-deletion sequence. This note no longer means
"delete the class right now." It now means "close the remaining runtime kill
chain and then land the final delete."

Cycles `0067` through `0069` already removed the old public/runtime helper
surface:

- `WarpGraph.ts` no longer imports `WarpRuntime` directly
- helper-wrapper seams no longer name `WarpRuntime`
- `runtimeWiring.ts` and `_wiredMethods.d.ts` are gone
- the old defineProperty delegation surface is gone

What remains is now explicitly split:

- `PORT_delete-warpcore-runtime-bridge`
- `API_delete-warpruntime-class`

Cycle `0075` completed the first exposed cut:

- `openWarpGraph()` no longer reaches `openWarpRuntime()`
- `WarpGraphRuntimeBridge.ts` no longer imports `WarpRuntime`
- the bridge now returns a structural runtime surface instead of the runtime
  instance

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

Cycle `0074` resplit the exposed remainder, and cycle `0075` completed the
first of those cuts. The live remaining order is now:

1. delete the `WarpCore` runtime bridge and escape hatch
2. delete the `WarpRuntime` class and exports
3. close the umbrella

This umbrella closes only after those two remaining cuts land.
