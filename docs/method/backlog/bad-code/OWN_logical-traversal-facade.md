---
id: OWN_logical-traversal-facade
blocked_by: []
blocks: []
feature: merge-strands-worldlines
release_home: v20.0.0
---

# LogicalTraversal is a deprecated facade with a broad materialization seam

**Effort:** S

## Issue

`src/domain/services/query/LogicalTraversal.ts` is marked as deprecated
and delegates to `GraphTraversal`, but it still owns a broad traversal
host shape:

```ts
interface TraversalGraph {
  hasNode: (nodeId: string) => Promise<boolean>;
  _materializeGraph: () => Promise<{ state: unknown; adjacency: unknown }>;
}
```

That keeps traversal coupled to full materialization and raw
shape-guard helpers after 0105 removed the same kind of dependency from
`QueryRunner`.

The file is no longer accurately described as only "zero dedicated
tests." The sharper smell is ownership and dependency shape:

- it is a deprecated facade that still knows how to materialize;
- it takes a broad graph-shaped object instead of a narrow traversal read
  source;
- it relies on `traversalHelpers.ts` to validate `unknown` state and
  adjacency shapes inside domain query code;
- it constructs `AdjacencyNeighborProvider` from a full adjacency map and
  full alive-node set.

## Fix

Pull this as a narrow seam cycle, not a broad traversal rewrite.

Expected direction:

- Decide whether `LogicalTraversal` should disappear or become a thin
  compatibility wrapper.
- If it remains, replace `TraversalGraph` with a narrow traversal read
  model/provider.
- Do not pass `_materializeGraph` or `unknown` state/adjacency through
  the traversal API.
- Do not introduce a generic `RuntimePort`, `GraphPort`, or traversal
  helper landfill.
- Keep `GraphTraversal` algorithm ownership separate from RuntimeHost
  materialization.

Evidence from 0105:

- `docs/design/0105-runtimehost-query-materialization-port-seam.md`
- `src/domain/services/query/LogicalTraversal.ts`
- `src/domain/services/query/traversalHelpers.ts`
