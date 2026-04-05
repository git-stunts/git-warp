# Auto-materialize when removeNode/removeEdge needs state

**Effort:** S

removeNode/removeEdge now throw `E_PATCH_NO_STATE` when the graph
hasn't been materialized. That's the safe fix — no silent data
corruption. But the user shouldn't have to know about `_cachedState`.

The ideal behavior: if `autoMaterialize` is true and `_cachedState`
is null, materialize automatically before the remove needs dots.

## Current behavior

```javascript
const patch = await graph.createPatch();
patch.removeNode('alice'); // throws E_PATCH_NO_STATE
```

## Desired behavior

```javascript
const patch = await graph.createPatch();
patch.removeNode('alice'); // just works — state was auto-materialized
```

## Approach

The simplest fix: auto-materialize in `createPatch()` when
`autoMaterialize` is true and `_cachedState` is null. One async
call, done once per patch session. The builder always has state.

This avoids making `removeNode` async (breaking API) and avoids
lazy materialization inside a sync method. The cost: one extra
materialization when creating a patch that might only add nodes.
Acceptable — materialization is idempotent and cached.

## Why asap/

This is the #1 DX complaint from the graft project. The workaround
(explicit materialize before removes) works but violates the
principle of least surprise.
