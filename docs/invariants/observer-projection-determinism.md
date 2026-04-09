# Observer Projection Determinism

## What must remain true?

Every query, traversal, or materialized view is a deterministic
function of the materialized state. Given the same `WarpState`,
identical queries must return identical results, regardless of
runtime, timing, or execution environment.

## Why does it matter?

Paper IV, Definition 3.1 defines an observer as a functor from the
history category to a trace space. The functor contract requires
determinism: the same history must map to the same trace. In the
codebase, observers manifest as queries (`QueryBuilder`), traversals
(`GraphTraversal`), materialized views (`MaterializedViewService`),
and bitmap indexes (`LogicalIndexReader`). If any of these produce
non-deterministic results -- due to `Map` iteration order, hash table
randomization, or floating-point non-determinism -- then the observer
contract is violated.

OG-1's aperture and degeneracy coordinates (Definitions 14-16) are
only meaningful if the observer projection is a well-defined function.
Non-deterministic observers would make aperture measurements
themselves non-deterministic, collapsing the entire observer geometry
framework.

## Paper grounding

- **Paper IV, Definition 3.1** (Observer): a functor `O : Hist -> Tr`,
  which is a deterministic map by definition.
- **Paper IV, Definition 3.2** (Resource-bounded observer): the
  implementation must produce the same output for the same input
  within the given budgets.
- **OG-1, Definition 8** (Terminal accumulated structural
  description): `O_hat(h)` is the terminal accumulated description,
  which must be well-defined.

## How the codebase upholds it

- `QueryBuilder` builds queries declaratively and executes them
  against materialized state. Results are sorted deterministically
  (by node ID for node queries, by edge key for edge queries).
- `GraphTraversal` implements 11 traversal algorithms. All produce
  deterministic results because they operate on the adjacency
  structure of the materialized graph, which is itself deterministic
  (tick confluence).
- Bitmap indexes (`LogicalIndexReader`, `BitmapIndexBuilder`) produce
  deterministic shard content because shard keys are derived from
  SHA prefixes via `shardKey.js`.
- `JoinReducer` LWW tiebreaking uses a total order (Lamport
  timestamp > writer ID > patch SHA), eliminating any ambiguity.

## How do you check?

1. **Idempotency test**: Materialize, query, materialize again, query
   again. Assert identical results. Covered by query and traversal
   unit tests.

2. **Cross-runtime consistency**: The multi-runtime Docker test matrix
   (Node, Bun, Deno) runs identical query tests. Results must match
   across runtimes.

3. **Sort stability audit**: Any code that returns arrays of results
   must use a deterministic sort:
   ```bash
   grep -rn "\.sort(" src/domain/ --include="*.js"
   ```
   Every `.sort()` call must have an explicit comparator function.
   No reliance on default sort order or implementation-defined
   behavior.
