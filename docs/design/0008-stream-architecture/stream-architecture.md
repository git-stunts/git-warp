# Cycle 0008 — Stream Architecture

**Sponsor (human):** James
**Sponsor (agent):** Claude
**Status:** DESIGN

## Hill

A developer can pipe domain objects through a composable stream
pipeline where encoding, persistence, and tree assembly are transforms
and sinks — never called directly by domain code. The pipeline shape
is identical for all sharded/unbounded artifacts. Semantic ports
remain for bounded single-artifact operations. The system is
memory-bounded: a dataset exceeding available heap completes without
OOM if the pipeline is fully stream-based.

## Playback Questions

1. Does the pipeline produce byte-identical output to the legacy
   `serialize()` + `codec.encode()` path?
2. Does a constrained-heap test (`--max-old-space-size=64`) complete
   for a dataset that would otherwise need 512MB?
3. Do semantic ports still tell you WHAT is being persisted and WHAT
   lifecycle rules apply?
4. Is CBOR vocabulary absent from domain nouns?

## Non-Goals

- Automatic parallelization of pipeline stages
- Web Streams API compatibility (we use AsyncIterable)
- Replacing bounded single-artifact reads with streams
- Marker subclasses that don't add flow behavior
- CborStream or any codec-named class in the domain

## The Synthesis: Ports for Meaning, Streams for Scale

Ports and streams are not competing ideas. They snap together:

- **Ports** = semantic contract. What is being persisted, what
  lifecycle rules apply, what the caller means.
- **Streams** = execution substrate. How data flows through the
  pipeline at scale.

A pipe does not tell you what is being persisted. A port does.
A port does not tell you how to handle unbounded data. A stream does.

## Architecture

### One Stream Container

```
WarpStream<T>                — domain primitive, composable async iterable
  pipe(transform) → WarpStream<U>
  tee() → [WarpStream<T>, WarpStream<T>]
  mux(...streams) → WarpStream<T>
  demux(classify, keys) → Map<string, WarpStream<T>>
  drain(sink) → Promise<R>
  reduce / forEach / collect
  [Symbol.asyncIterator]()
```

No domain subclasses of WarpStream. Identity lives on the ELEMENTS
(artifact records), not the container. `pipe()` returns `WarpStream<U>`
— subtype identity would evaporate at the first transform anyway.

### Semantic Ports (Bounded Artifacts)

```
PatchJournalPort
  writePatch(patch) → Promise<string>        // one patch, bounded
  readPatch(oid) → Promise<PatchV2>          // bounded read
  scanRange(...) → WarpStream<PatchEntry>    // unbounded — NEW

CheckpointStorePort
  writeCheckpoint(record) → Promise<CheckpointWriteResult>   // COLLAPSED
  readCheckpoint(sha) → Promise<CheckpointData>              // bounded read
  // Internal: adapter fans out state/frontier/vv as stream

IndexStorePort                               // NEW
  writeShards(stream) → Promise<string>      // WarpStream<IndexShard> → tree OID
  scanShards(...) → WarpStream<IndexShard>   // unbounded read

ProvenanceStorePort                          // NEW (Slice 4)
  scanEntries(...) → WarpStream<ProvenanceEntry>
```

Ports that deal with bounded single artifacts stay `Promise<T>`.
Ports that deal with unbounded/sharded data accept or return
`WarpStream<SemanticUnit>`.

### Artifact Records (Runtime Identity on Elements)

Identity belongs on the streamed ITEMS, not the stream container.
SSJS P1: domain concepts require runtime-backed forms.

```
CheckpointArtifact           — discriminated subclass hierarchy
  CheckpointArtifact.State   — carries WarpStateV5
  CheckpointArtifact.Frontier — carries Frontier map
  CheckpointArtifact.AppliedVV — carries VersionVector

IndexShard                   — carries [path, shardData]
  // Path is semantic (e.g., meta shard vs edge shard)
  // Adapter maps to Git tree paths at the last responsible moment

PatchEntry                   — carries { patch: PatchV2, sha: string }
ProvenanceEntry              — carries { nodeId, patchShas }
```

The adapter maps artifact records to `[path, bytes]` → `[path, oid]`
→ tree. Paths belong to Git tree assembly, not to the domain contract.

### Infrastructure Transforms

```
CborEncodeTransform   artifact → [path, bytes]     (adapter knows the path)
CborDecodeTransform   [path, bytes] → artifact
GitBlobWriteTransform [path, bytes] → [path, oid]
TreeAssemblerSink     [path, oid] → finalize → treeOid
```

Encode → blobWrite → treeAssemble stays entirely in infrastructure.
CBOR is boundary vocabulary — never a domain noun.

### CheckpointStorePort Surgery

Current: micro-method soup (writeState, writeFrontier, writeAppliedVV,
computeStateHash) that CheckpointService immediately fans out in
Promise.all. The port leaks storage decomposition.

After: `writeCheckpoint(record)` — one domain event with one call.
The adapter internally streams the checkpoint artifacts through the
encode → blobWrite → treeAssemble pipeline. The domain doesn't know
or care about the internal fan-out.

```js
// Domain:
const result = await checkpointStore.writeCheckpoint({
  state: compactedState,
  frontier,
  appliedVV,
  stateHash,
  provenanceIndex,  // optional
});

// Adapter internally:
async writeCheckpoint(record) {
  const treeOid = await WarpStream.from(this._yieldArtifacts(record))
    .pipe(this._encodeTransform)
    .pipe(this._blobWriteTransform)
    .drain(this._treeAssembler);
  return { treeOid, stateHash: record.stateHash };
}
```

### First Streaming Wins (Graph-Scale Liars)

The obvious targets — APIs that return graph-scale aggregates:

1. `loadPatchRange()` → `scanPatchRange()` returning
   `WarpStream<PatchEntry>`. Currently walks commits and accumulates
   an array.

2. `LogicalBitmapIndexBuilder.serialize()` → `yieldShards()` returning
   `WarpStream<IndexShard>`. Already proven byte-identical.

3. Index reader loading — currently decodes all shards eagerly.
   Can stream via `scanShards()`.

### Mux() Ordering Warning

`WarpStream.mux()` interleaves by arrival order. Async completion
timing must not bleed into tree assembly. `TreeAssemblerSink` already
sorts entries before `writeTree()`. Deterministic Git trees don't
care which blob write finished first — canonical ordering is restored
in the finalizer.

## Migration Plan

### Phase 1 — Stream the graph-scale liars

- `scanPatchRange()` on PatchJournalPort → WarpStream<PatchEntry>
- `IndexShardStream` via `yieldShards()` → WarpStream<IndexShard>
  (already proven)
- Wire `IndexStorePort.writeShards(stream)` through pipeline

### Phase 2 — Collapse CheckpointStorePort

- `writeCheckpoint(record)` replaces writeState/writeFrontier/writeAppliedVV
- Adapter internally streams artifacts through pipeline
- `readCheckpoint()` stays Promise<T> (bounded)

### Phase 3 — Remaining P5 cleanup

- Remove defaultCodec from all domain files
- Delete defaultCodec.js, canonicalCbor.js
- Expand tripwire to all migrated files
- Provenance/BTR streaming ports

### Phase 4 — Memory-bounded witnesses

- Constrained-heap tests for index build, materialization, sync
- Naming audit: rename slurp APIs

## Accessibility / Localization / Agent-Inspectability

- **Accessibility**: N/A (internal infrastructure)
- **Localization**: N/A
- **Agent-Inspectability**: WarpStream carries AbortSignal for
  cooperative cancellation. Artifact records are `instanceof`-
  dispatchable. Sink.consume() returns a typed result.
