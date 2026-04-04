# Stream Architecture — Honest APIs for Unbounded Data

**Effort:** XL

## Invariant

If the caller must not assume whole-materialization, expose an
incremental semantic interface. "Everything fits in memory" is not an
invariant — it is a prayer.

## The Two Cases

### Case 1 — Single bounded artifact

A single patch blob, a single checkpoint state, a single shard. The
semantic object is reasonable. The port can stay semantic:

```js
readPatch(oid) → Promise<Patch>        // fine
readState(oid) → Promise<WarpStateV5>  // fine
```

The adapter can stream bytes underneath if the single blob is large,
but the domain-facing API is `Promise<T>`.

### Case 2 — Unbounded collection / graph-scale enumeration

Patch history, index shards, provenance walks, traversals, transfer
planning inputs, out-of-core materialization. The dataset can exceed
memory. The public API MUST be stream-first:

```js
scanPatches(...)     → AsyncIterable<PatchEnvelope>
scanIndexShards(...) → AsyncIterable<IndexShard>
readProvenanceEntries(...) → AsyncIterable<ProvenanceEntry>
materializeStream(...) → AsyncIterable<StateDelta>
```

Not:

```js
getAllPatches() → Promise<Patch[]>     // LIAR
```

The API shape tells the caller: you can't slurp this.

## Stream the Semantic Unit

`AsyncIterable<IndexShard>`, not `AsyncIterable<Uint8Array>`. Streaming
raw bytes through the domain rebrands the byte-layer leak instead of
fixing it. The repo's content-streaming work was careful about this:
streaming was the contract for content blobs, the port contract was
the boundary, and whole-state vs blob streaming were separate concerns.

## Composable Primitives

| Primitive | What |
|---|---|
| `xformStream(fn)` | Generic async transform: `(T) → U` per element |
| `mux(streams)` | Fan-in: merge multiple streams |
| `demux(stream, classifier)` | Fan-out: route to different pipes |
| `tee(stream)` | Duplicate to multiple consumers |
| Backpressure | Producers slow down when consumers can't keep up |

The codec is just `xformStream(codec.encode)` — a transform, not an
endpoint. Blob I/O is a sink/source. Tree assembly is a finalizer.

## What This Subsumes

- **P5 codec dissolution (Slices 3-4)**: codec transforms in adapters,
  composed into pipelines. Index builders stream shards through encode
  transforms. Readers consume decode transforms.
- **Memory-bounded materialization**: patch stream → JoinReducer → state.
- **Memory-bounded indexing**: state diffs → builder → shard stream → storage.
- **Memory-bounded sync**: patch exchange as streams.

## API Audit Targets

Every API that returns a graph-scale aggregate. Candidates:

- `loadPatchRange()` → returns `Array<{patch, sha}>` — should be
  `AsyncIterable<{patch, sha}>`
- Index builder `serialize()` → returns `Record<string, Uint8Array>` —
  should yield `[path, domainObj]` entries
- `materialize()` → loads all patches into memory — could stream
- Traversal result sets already partially streaming
  (`transitiveClosureStream`)

## Naming Convention

| Name | Meaning |
|---|---|
| `scan*`, `stream*`, `enumerate*` | Honest: incremental, unbounded-safe |
| `get*List()`, `getAll*()` | Dangerous: whole-materialization |
| `collect*()` | Explicitly dangerous opt-in (for tests/tooling) |

## The Killer Test

Run with `--max-old-space-size=64` on a dataset that would normally
need 512MB. If the pipeline is stream-based, it completes. If anything
buffers, it blows up. The test IS the architecture proof.

## Existing Streaming Work

The repo already has the pattern in places:
- `getContentStream()` / `storeStream()` / `retrieveStream()` on
  `AsyncIterable<Uint8Array>` (content attachment I/O)
- `transitiveClosureStream()` for lazy reachability
- `StreamingBitmapIndexBuilder` — memory-bounded index building
- Security model calls out "streaming-first" large traversals

## Source

P5 codec dissolution Slice 3 planning (2026-04-04). Discovered that
per-artifact ports don't scale for collections. The stream architecture
is the universal pattern.
