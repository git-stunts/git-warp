# Stream Architecture — Honest APIs for Unbounded Data

**Effort:** XL

## Invariant: TRAVERSAL-TRUTH

Unbounded data flows through streams (traversal). Bounded truth
crosses ports (contracts). Never conflated. Persistence ordering
is canonical regardless of stream timing.

A stream is a linear projection of a worldline traversal. A port
defines what must be true at a boundary. These are orthogonal
axes — not competing abstractions.

### Violations

- A port returning `AsyncIterable` for a bounded artifact (lying
  about traversal — a single patch IS bounded)
- A stream establishing truth without a port (bypassing contracts)
- Domain code consuming raw stream elements without artifact identity
  (vibes pipeline — `AsyncIterable<Record<string, unknown>>`)
- Persistence ordering depending on async completion timing
  (non-deterministic truth — finalization must restore canonical order)

### Standing Playback Question

Does this code route unbounded data through streams and bounded
truth through ports? Is persistence ordering canonical?

### Connection to the Papers

| DSM Property | Paper | Mechanism |
|---|---|---|
| Artifacts are first-class | I (WARP inductive def) | P1 runtime-backed forms |
| Ports define truth boundaries | III (boundary encoding) | Hexagonal architecture |
| Streams are worldline projections | II (tick sequences) | AsyncIterable traversal |
| Ordering restored before persistence | II (tick-level confluence) | TreeAssemblerSink sorts |
| Concurrency semantically erased | II (admissible batches) | Transforms are pure |
| Replay produces identical results | III (computational holography) | Deterministic finalization |

A stream IS a worldline projection:
- `scanPatchRange(from, to)` = projecting a worldline segment
- `mux(writerA, writerB)` = merging worldlines (materialization)
- Backpressure = causal ordering (can't consume tick N+1 before N)
- Stream identity = frontier position (version vector advances)
- Observer `O: Hist(U,R) → Tr` (Paper IV) = stream transform

## The Two Cases

### Case 1 — Bounded artifact (port)

A single patch, checkpoint, shard. The semantic object is
reasonable. The port speaks `Promise<T>`:

```text
readPatch(oid) → Promise<Patch>
writeCheckpoint(record) → Promise<WriteResult>
```

### Case 2 — Unbounded traversal (stream)

Patch history, index shards, provenance walks. The dataset can
exceed memory. The API speaks `AsyncIterable<SemanticUnit>`:

```text
scanPatchRange(...) → WarpStream<PatchEntry>
yieldShards() → Generator<IndexShard>
```

The API shape tells the caller: you can't slurp this.

## Naming Convention

| Name | Meaning |
|---|---|
| `scan*`, `stream*`, `enumerate*` | Honest: incremental, unbounded-safe |
| `get*List()`, `getAll*()` | Dangerous: whole-materialization |
| `collect()` | Explicitly dangerous opt-in |

## Source

P5 codec dissolution → stream architecture design (2026-04-04).
Formalized as TRAVERSAL-TRUTH invariant.
