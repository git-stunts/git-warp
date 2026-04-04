# Cycle 0008 — Stream Architecture

**Sponsor (human):** James
**Sponsor (agent):** Claude
**Status:** DESIGN

## Hill

A developer can pipe domain objects through a composable stream
pipeline where encoding, persistence, and tree assembly are transforms
and sinks — never called directly by domain code. The pipeline shape
is identical for patches, checkpoints, indexes, and provenance. The
system is memory-bounded: a dataset exceeding available heap completes
without OOM if the pipeline is fully stream-based.

## Playback Questions

1. Can a developer identify WHAT a stream carries via `instanceof`
   without inspecting element contents?
2. Does the pipeline produce byte-identical output to the legacy
   `serialize()` + `codec.encode()` path?
3. Does a constrained-heap test (`--max-old-space-size=64`) complete
   for a dataset that would otherwise need 512MB?
4. Is the stream hierarchy honest? Does every subclass add behavior
   or semantic identity, not just a name?

## Non-Goals

- Automatic parallelization of pipeline stages
- Web Streams API compatibility (we use AsyncIterable)
- Replacing bounded single-artifact reads (`readPatch(oid) → Promise<Patch>`)
  with streams — those are correctly `Promise<T>` per the two-case rule

## Stream Hierarchy

### Base Primitives (domain — `src/domain/stream/`)

```
WarpStream<T>                — Composable async iterable
  pipe(transform) → WarpStream<U>
  tee() → [WarpStream<T>, WarpStream<T>]
  mux(...streams) → WarpStream<T>
  demux(classify, keys) → Map<string, WarpStream<T>>
  drain(sink) → Promise<R>
  reduce(fn, init) → Promise<R>
  forEach(fn) → Promise<void>
  collect() → Promise<T[]>     ← poison pill name
  [Symbol.asyncIterator]()
```

### Domain Stream Subclasses (domain — `src/domain/stream/`)

```
CborStream<T> extends WarpStream<T>
  — Marker: elements can be CBOR-encoded. CborEncodeTransform
    requires this as input type. Subclasses carry domain semantics.

PatchStream extends CborStream<PatchV2>
  — Yields PatchV2 objects
  — .normalize(): apply context VV normalization
  — .filterByWriter(writerId): filter to a single writer

StateStream extends CborStream<WarpStateV5>
  — Yields WarpStateV5 objects
  — .project(): yield visible state projection
  — .compact(appliedVV): yield compacted state

FrontierStream extends CborStream<Frontier>
  — Yields Frontier maps

AppliedVVStream extends CborStream<VersionVector>
  — Yields VersionVector objects

IndexShardStream extends CborStream<[string, unknown]>
  — Yields [path, shardData] entries
  — .byShardType(): demux into meta/fwd/rev/props/labels sub-streams
```

### Why Subclasses, Not String Tags

SSJS P1: domain concepts require runtime-backed forms.
SSJS P7: `instanceof` dispatch over tag switching.

A stream of patches IS a different concept than a stream of index
shards. `instanceof PatchStream` replaces `path === 'patch.cbor'`.
The subclass carries semantic identity that survives runtime dispatch.

Subclasses also carry domain-specific behavior (P3): `PatchStream`
has `.normalize()`, `IndexShardStream` has `.byShardType()`. These
methods make sense on their owning type, not on base `WarpStream`.

### Pipeline Stages

After `pipe()`, the stream type reverts to `WarpStream` (the pipeline
loses the specific subclass, which is correct — after encoding,
it's no longer a `PatchStream`).

```
PatchStream → pipe(cborEncode) → WarpStream<Uint8Array>
                                  → pipe(blobWrite) → WarpStream<string>
                                                       → drain(treeSink) → treeOid
```

The subclass identity exists at the domain boundary (before the
pipeline). The pipeline itself is generic WarpStream composition.

### Infrastructure Transforms (infrastructure — `src/infrastructure/adapters/`)

```
CborEncodeTransform   [path, obj] → [path, bytes]    (or obj → bytes for non-keyed)
CborDecodeTransform   [path, bytes] → [path, obj]
GitBlobWriteTransform [path, bytes] → [path, oid]
GitBlobReadTransform  [path, oid] → [path, bytes]     (future)
TreeAssemblerSink     [path, oid] → finalize → treeOid
```

## Persistence Pipeline — One Shape for Everything

### Write

```js
// Patches (single artifact)
PatchStream.of(patch)
  .pipe(cborEncode)
  .pipe(blobWrite)
  .drain(treeAssembler)

// Checkpoints (multiple artifacts)
new CborStream(async function*() {
  yield ['state.cbor', state];
  yield ['frontier.cbor', frontier];
  yield ['appliedVV.cbor', appliedVV];
}())
  .pipe(cborEncode)
  .pipe(blobWrite)
  .drain(treeAssembler)

// Indexes (many shards, streaming)
IndexShardStream.from(builder.yieldShards())
  .pipe(cborEncode)
  .pipe(blobWrite)
  .drain(treeAssembler)
```

Same pipeline. Different source. `CborEncodeTransform` +
`GitBlobWriteTransform` + `TreeAssemblerSink` is the universal
persistence stack.

### Read

```js
// Read tree → decode entries
WarpStream.from(Object.entries(treeOids))
  .pipe(blobRead)
  .pipe(cborDecode)
  .forEach(([path, obj]) => consumer.ingest(path, obj))
```

## What This Replaces

| Current (per-artifact ports) | Stream architecture |
|---|---|
| `PatchJournalPort.writePatch(patch)` | `PatchStream.of(patch).pipe(encode).pipe(write).drain(sink)` |
| `PatchJournalPort.readPatch(oid)` | Stays as `Promise<PatchV2>` (bounded single artifact) |
| `CheckpointStorePort.writeState(state)` | `CborStream` of checkpoint artifacts piped through |
| `CheckpointStorePort.readState(oid)` | Stays as `Promise<WarpStateV5>` (bounded) |
| `LogicalBitmapIndexBuilder.serialize()` | `IndexShardStream.from(builder.yieldShards()).pipe(...)` |
| N/A | Unbounded scans: `scanPatches() → PatchStream` |

Single bounded reads (`readPatch`, `readState`) stay as `Promise<T>`.
Only the write paths and unbounded reads move to streams.

## Error Propagation

No custom error channel. The async iterator protocol handles it:

- **Downstream throws** (blob write fails): `for await` stops,
  JS calls `return()` on upstream iterator, generator's `finally`
  block runs. Teardown propagates up the whole chain.
- **Cooperative cancellation**: `AbortSignal` threaded through
  WarpStream constructor. Checked between yields.

## Memory-Bounded Tests (The Killer Witness)

Run with `--max-old-space-size=64` on a dataset that would normally
need 512MB:

1. Build index with 1M nodes via streaming builder → stream pipeline
2. Materialize a graph with 100K patches via patch stream → reducer
3. Checkpoint a large state via CborStream → pipeline

If anything buffers the full dataset, it blows up. The test IS the
architecture proof.

## Migration Plan

### Phase 1 — Subclass hierarchy (this cycle)

- Add CborStream, PatchStream, StateStream, FrontierStream,
  AppliedVVStream, IndexShardStream to `src/domain/stream/`
- Tests for each subclass (instanceof, domain methods)

### Phase 2 — Write path migration

- PatchBuilderV2: pipe patch through PatchStream → pipeline
  (replaces PatchJournalPort.writePatch)
- CheckpointService: pipe artifacts through CborStream → pipeline
  (replaces CheckpointStorePort.writeState/writeFrontier/writeAppliedVV)
- LogicalBitmapIndexBuilder: already has yieldShards(), wrap in
  IndexShardStream
- PropertyIndexBuilder: add yieldShards(), wrap in IndexShardStream

### Phase 3 — Read path migration

- SyncProtocol: scanPatches() → PatchStream (unbounded)
- IndexReader: decode via CborDecodeTransform pipeline
- CheckpointService.load: stays Promise<T> (bounded)

### Phase 4 — Cleanup

- Remove PatchJournalPort, CborPatchJournalAdapter
- Remove CheckpointStorePort, CborCheckpointStoreAdapter
- Remove defaultCodec from all domain files
- Delete defaultCodec.js, canonicalCbor.js
- Expand tripwire to all migrated files

### Phase 5 — Memory-bounded tests

- Constrained-heap tests for index build, materialization, sync
- Naming audit: rename slurp APIs to `collect*()` (poison pill)

## Accessibility / Localization / Agent-Inspectability

- **Accessibility**: N/A (internal infrastructure)
- **Localization**: N/A
- **Agent-Inspectability**: Stream subclasses are `instanceof`-dispatchable.
  Agents can introspect pipeline stages. WarpStream carries AbortSignal
  for cooperative cancellation. Sink.consume() returns a typed result.

## Backlog Items

1. `PERF_stream-subclass-hierarchy` — CborStream + domain subclasses
2. `PERF_stream-write-migration` — Migrate write paths to stream pipeline
3. `PERF_stream-read-migration` — Migrate read paths + unbounded scans
4. `PERF_stream-cleanup` — Remove per-artifact ports + defaultCodec
5. `PERF_stream-memory-tests` — Constrained-heap witnesses
