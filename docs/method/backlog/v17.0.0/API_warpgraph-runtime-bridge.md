---
id: API_warpgraph-runtime-bridge
blocked_by: []
blocks: []
feature: api-capabilities
---

# Remove direct WarpRuntime typing from openWarpGraph

`WarpGraph.ts` still imports `WarpRuntime` directly and still builds the public
capability bag by binding a live runtime instance.

That residue is smaller than the old consumer migration tail, but it is still
part of the runtime bridge. The next honest cut is:

- move the runtime-dependent types and opener behind a dedicated bridge seam
- keep `WarpGraph.ts` focused on the public capability bag and composition law
- stop teaching the composition root as “just bind methods off WarpRuntime”

This does not delete `WarpRuntime`; it isolates the composition-root residue so
the final kill is smaller and more truthful.

Cycle `0067` satisfied this cut:

- `WarpGraph.ts` no longer imports `WarpRuntime`
- `openWarpGraph()` now opens through `warp/WarpGraphRuntimeBridge.ts`
- the runtime-kill umbrella no longer waits on this successor
