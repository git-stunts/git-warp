# CAS-First Memoized Materialization

Use this page when you need to understand `git-warp`'s constant-memory streaming
materialization pipeline, `@git-stunts/git-cas` boundary encapsulation, and
rolling hash deduplication mechanics.

## The Materialization Lifecycle

In `git-warp`, materialization is the bounded projection of raw CRDT graph
events into structural checkpoints, working set views, or specialized hologram
slices.

To guarantee constant-memory `O(1)` runtime footprints and eliminate redundant
CPU/memory computation across stigmergic peers, `git-warp` enforces a
**CAS-First memoization pipeline**.

```text
+++++++> [git-cas] ---------> (materialization) ------> * (object)
            ^                            |
            |                            |
            +----------------------------+
```

## CAS-First Memoization Rules

Every materialization request must execute the following strict lifecycle:

### 2.1. Is object already in git-cas?

Before executing any projection logic or buffering events into V8 heap memory,
`git-warp` derives a deterministic materialization coordinate key:
`key = sha256(baseFrontierSha + opticLensSha + queryParams)`.

The runtime immediately interrogates `git-cas` (`await cas.has(key)`). If the
object exists in storage, `git-warp` bypasses the entire projection calculation
and streams the pre-calculated object directly to the caller.

### 2.2. No? Materialize via streaming

If the CAS interrogation returns a miss, `git-warp` initializes a lazy, chunked
streaming materialization pipeline. Events are pulled from the underlying CRDT
log in bounded batches, processed through the projection kernel, and immediately
piped out to avoid accumulating unbounded memory buffers.

### 2.3. Write materialized git-object to git-cas always

As the object is materialized, the resulting buffer is simultaneously piped
directly into `git-cas` (`cas.writeStream(key)`). This permanently memoizes the
structural reality for all future causal code paths, background daemons, and
remote peers.

## Strict @git-stunts/git-cas Encapsulation

All CAS operations must route through the formal `@git-stunts/git-cas` library
API. Direct invocation of raw git storage commands (`git hash-object`,
`git cat-file`, `git mktree`) is strictly banned within `git-warp`.

### Buzhash Content-Defined Chunking (CDC)

Routing through `@git-stunts/git-cas` unlocks advanced rolling hash capabilities:

- **Dynamic Chunking**: `@git-stunts/git-cas` employs a Buzhash rolling hash
  algorithm to dynamically split streaming data into variable-length chunks
  based on actual data content rather than fixed byte boundaries.
- **Structural Deduplication**: If 99% of a materialized graph snapshot remains
  unchanged between two consecutive frontiers, Buzhash CDC produces the exact
  same block OIDs for the unchanged sub-trees. `@git-stunts/git-cas` instantly
  deduplicates these blocks in memory before anything touches disk storage.

## See also

- [Content and CAS](content-and-cas.md)
- [Git substrate](git-substrate.md)
- [Optic reads](optic-reads.md)
- [Troubleshooting](troubleshooting.md)
