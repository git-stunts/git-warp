# Deduplicate openDetachedReadGraph / openDetachedObserverGraph

## The sludge

`openDetachedReadGraph` appears in MaterializeController AND in
Worldline.ts. `openDetachedObserverGraph` appears in QueryController.
Both do the same thing: clone a graph instance for isolated reads.
Three copies of the same logic, each with slightly different field
access patterns.

## The fix

One function, one file. `src/domain/services/DetachedGraphFactory.ts`.
Takes typed dependencies (persistence, ports, config) and returns a
read-only graph handle. All three consumers import from here.

When the capability API lands, "detached read graph" becomes
`openWarpGraph()` with the same persistence and
`autoMaterialize: false`. The factory function dissolves.
