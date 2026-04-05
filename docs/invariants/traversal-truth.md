# Traversal-Truth

## What must remain true?

Unbounded data flows through streams (traversal); bounded truth
crosses ports (contracts). These two paths are never conflated.
Persistence ordering is canonical regardless of stream timing.

## Why does it matter?

OG-1's structural observer model (Definition 3) separates projection
(what is seen), basis (what is natively expressible), and
accumulation (what is built over time). In the codebase, this maps
to a clear architectural boundary: streams handle traversal of
potentially unbounded data (walking commit DAGs, iterating patch
chains, scanning indexes), while ports handle truth assertions
(reading a specific blob, resolving a ref, persisting a materialized
view).

If traversal logic is mixed into port contracts, ports become
unbounded (they stream data they should not). If truth assertions are
made through streams, ordering becomes non-deterministic (streams may
deliver records out of order). The TRAVERSAL-TRUTH invariant prevents
both failure modes.

Paper IV's observer projections (Section 3.4) distinguish boundary
observers (compact, bounded) from bulk observers (potentially large,
streaming). The codebase mirrors this: ports are boundary observers
(they answer specific bounded questions), streams are bulk observers
(they traverse the full history).

## Paper grounding

- **OG-1, Definition 3** (Structural observer): separates projection,
  basis, and accumulation as independent primitives.
- **Paper IV, Section 3.3** (Canonical observer families): boundary
  observers operate on `(U_0, P)` (bounded); bulk observers inspect
  interior states (potentially unbounded).
- **Paper III, Theorem 5.1** (Slicing): partial materialization
  requires traversing only the causal cone -- a streaming concern --
  while the slice result is a bounded truth.

## How the codebase upholds it

- `WarpStream` is the single stream class. It provides `pipe()`,
  `tee()`, `mux()`, `demux()`, `drain()`, `collect()`. No subclasses.
- Artifact records (`CheckpointArtifact`, `IndexShard`, `PatchEntry`,
  `ProvenanceEntry`) are the typed payloads that flow through streams.
- Ports (`GraphPersistencePort`, `BlobStoragePort`, `RefPort`,
  `IndexStoragePort`) are bounded interfaces that answer specific
  questions: "what SHA does this ref point to?", "give me the blob
  at this SHA."
- `CommitDagTraversalService` walks the commit DAG via streams but
  delegates truth assertions (reading commit content, resolving
  parents) to ports.

## How do you check?

1. **Port interface audit**: Every method on a port must return a
   bounded value (a single object, a fixed-size array, a boolean).
   No port method returns a stream or async iterator:
   ```bash
   grep -n "AsyncIterator\|AsyncGenerator\|WarpStream" src/ports/*.js
   ```
   Must return zero hits.

2. **Stream containment audit**: `WarpStream` must not import from
   `src/ports/`:
   ```bash
   grep -n "from.*ports" src/domain/stream/WarpStream.js
   ```
   Must return zero hits.

3. **Design doc**: `docs/design/0008-stream-architecture/` documents
   the stream architecture and its 7 invariants. Review at cycle
   boundaries.
