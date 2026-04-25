---
id: API_kill-warpruntime
blocks:
  - TS_publish-pipeline
blocked_by: []
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

The class-delete cut is done. Cycle `0083` renamed the remaining internal host
to `RuntimeHost`, removed `openWarpRuntime()` / `getWarpRuntimePrototype()`,
and routed CLI/runtime product boot through the explicit host-product seam.

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

Cycle `0074` resplit the exposed remainder, cycle `0075` completed the public
bridge cut, cycle `0076` then completed the `WarpCore` bridge cut, cycle
`0078` then extracted the remaining source-side runtime host product, cycle
`0079` then proved the test/helper blocker still needed an internal split,
cycle `0080` then completed the helper/seed half of that split, and cycle
`0081` then completed the runtime-facing suite half of that split. Finally,
cycle `0082` then closed the test/helper migration umbrella by proving both
ratchets and deleting the completed backlog card. Cycle `0083` then deleted
the old `WarpRuntime` class/file/open-function residue. The live remaining
order is now:

1. close the umbrella

This umbrella closes after the final ledger/count cleanup lands.
