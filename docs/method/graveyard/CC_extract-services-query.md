# Extract query/ from domain/services/

Move the 5 query/traversal files into `src/domain/services/query/`.

## Files

- QueryBuilder.js (852)
- GraphTraversal.js (1617)
- LogicalTraversal.js (590, deprecated facade)
- Observer.js (576)
- AdjacencyNeighborProvider.js (175)

Note: QueryController.js (964) stays in controllers/.

## Why

Read-path query and traversal. GraphTraversal is the unified engine
(11 algorithms). Observer is the standing-query abstraction.
QueryBuilder provides the fluent API. All tightly coupled through
the query execution path.

## Scope

Move files, update imports. No behavioral changes.

## Source

Cycle 0004 analysis.
