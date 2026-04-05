# Cycle 0008 — Stream Architecture

**Sponsor (human):** James
**Sponsor (agent):** Claude
**Status:** DESIGN

## Hill

A developer can pipe domain objects through a composable stream
pipeline where encoding, persistence, and tree assembly are transforms
and sinks — never called directly by domain code. Semantic ports
remain for bounded single-artifact operations. Artifact records carry
runtime identity. The system is memory-bounded for unbounded datasets.

## The Rule

Streams are for scale. Ports are for meaning. Artifacts are the nouns.
Paths are infrastructure.

## Playback Questions

1. Does the pipeline produce byte-identical output to the legacy path?
2. Does a constrained-heap test complete for a dataset that would
   otherwise OOM?
3. Do semantic ports still tell you WHAT is being persisted and WHAT
   lifecycle rules apply?
4. Is CBOR vocabulary absent from domain nouns?
5. Does every artifact record class add runtime identity, not just a name?

## Non-Goals

- CborStream or any codec-named class in the domain
- Marker stream subclasses that don't add flow behavior
- Melting separate ports/services into one generic pipe
- Replacing bounded single-artifact reads with streams

---

## Architecture

### One Stream Container

```text
WarpStream<T>                — domain primitive
  pipe / tee / mux / demux / drain / reduce / forEach / collect
  [Symbol.asyncIterator]()
```

No domain subclasses. Identity lives on elements, not the container.

### Semantic Ports

Ports define what is being persisted and what lifecycle rules apply.
Bounded operations stay `Promise<T>`. Unbounded operations return or
accept `WarpStream<SemanticUnit>`.

**PatchJournalPort** (keep, extend)
```text
writePatch(patch) → Promise<string>              bounded write
readPatch(oid) → Promise<PatchV2>                bounded read
scanPatchRange(...) → WarpStream<PatchEntry>     unbounded scan (NEW)
```

**CheckpointStorePort** (collapse micro-methods)
```text
writeCheckpoint(record) → Promise<CheckpointWriteResult>   one call
readCheckpoint(sha) → Promise<CheckpointData>              bounded read
```
Adapter internally streams artifacts through the pipeline.

**IndexStorePort** (NEW, streaming)
```text
writeShards(stream) → Promise<string>            WarpStream<IndexShard> → tree OID
scanShards(...) → WarpStream<IndexShard>         unbounded read
```

**ProvenanceStorePort** (NEW, separate concept)
```text
scanEntries(...) → WarpStream<ProvenanceEntry>
writeIndex(index) → Promise<string>
```
Own port. Physical colocation under checkpoint tree ≠ semantic
ownership. Checkpoint = recovery. Provenance = causal/query/verification.
Different jobs, different lifecycle, different consumers.

**StateHashService** (separate callable, not buried in adapter)
```text
compute(state) → Promise<string>
```
Used by verification, comparison, detached checks, AND checkpoint
creation. Not exclusively inside writeCheckpoint().

### Artifact Records

Runtime identity on elements, not containers (P1/P7).

**CheckpointArtifact** — closed subclass family
```text
CheckpointArtifact (abstract base)
  common: checkpointRef, schemaVersion

StateArtifact extends CheckpointArtifact
  payload: { state: WarpStateV5 }

FrontierArtifact extends CheckpointArtifact
  payload: { frontier: Map<string, string> }

AppliedVVArtifact extends CheckpointArtifact
  payload: { appliedVV: VersionVector }
```
No paths. No CBOR. No blob OIDs. No adapter trivia.

**IndexShard** — subtype family (not one generic class)
```text
IndexShard (base)
  common: indexFamily, shardId, schemaVersion

MetaShard extends IndexShard
  payload: { nodeToGlobal, alive, nextLocalId }

EdgeShard extends IndexShard
  payload: { direction, shardKey, buckets }

LabelShard extends IndexShard
  payload: { labels: [string, number][] }

PropertyShard extends IndexShard
  payload: { entries: [string, Record][] }
```
The code already treats shard families differently (isMetaShard,
isEdgeShard, classifyShards). One mega-shard class is just `any`
with better PR.

**PatchEntry** — `{ patch: PatchV2, sha: string }`

**ProvenanceEntry** — `{ nodeId, patchShas }`

### Path Mapping

Adapter owns it. Full stop. Domain produces artifact records.
Adapter maps to Git tree paths at the last responsible moment.

```text
StateArtifact   → 'state.cbor'
FrontierArtifact → 'frontier.cbor'
MetaShard       → 'meta_XX.cbor'
EdgeShard       → '{fwd|rev}_XX.cbor'
```

Static mapping table or instanceof dispatcher in the adapter.
No `.path()` on domain objects. Paths are storage convention.

Domain owns meaning. Adapter owns layout.

### Infrastructure Transforms

```text
CborEncodeTransform   artifact → [path, bytes]
CborDecodeTransform   [path, bytes] → artifact
GitBlobWriteTransform [path, bytes] → [path, oid]
TreeAssemblerSink     [path, oid] → finalize → treeOid
```

Encode → blobWrite → treeAssemble stays entirely in infrastructure.
CBOR is boundary vocabulary — never a domain noun.

### Pipeline Examples

```js
// Index write (unbounded, streaming)
await indexStore.writeShards(
  WarpStream.from(builder.yieldShards())
);
// Adapter internally: stream → encode → blobWrite → treeAssemble

// Checkpoint write (bounded, one call)
await checkpointStore.writeCheckpoint({
  state, frontier, appliedVV, stateHash, provenanceIndex
});
// Adapter internally: yield artifacts → encode → blobWrite → tree

// Patch scan (unbounded)
const patches = patchJournal.scanPatchRange(writerRef, fromSha, toSha);
for await (const entry of patches) {
  reducer.apply(entry.patch);
}
```

### Ordering Guarantee

`WarpStream.mux()` interleaves by arrival order. Async completion
timing must not bleed into tree assembly. `TreeAssemblerSink` sorts
entries before `writeTree()`. Deterministic Git trees don't care
which blob write finished first.

---

## Migration Plan

### Phase 1 — Artifact records + streaming ports

- CheckpointArtifact family (StateArtifact, FrontierArtifact,
  AppliedVVArtifact)
- IndexShard family (MetaShard, EdgeShard, LabelShard, PropertyShard)
- PatchEntry, ProvenanceEntry records
- IndexStorePort with writeShards/scanShards
- PatchJournalPort.scanPatchRange()
- StateHashService
- ProvenanceStorePort

### Phase 2 — Wire write paths

- CheckpointStorePort collapse → writeCheckpoint(record)
- Index builders: yieldShards() returns IndexShard subclass instances
- SyncProtocol: consume scanPatchRange() instead of loadPatchRange()

### Phase 3 — P5 cleanup

- Remove defaultCodec from all domain files
- Delete defaultCodec.js, canonicalCbor.js
- Expand tripwire to all migrated files

### Phase 4 — Memory-bounded witnesses

- Constrained-heap tests
- Naming audit for slurp APIs

---

## Accessibility / Localization / Agent-Inspectability

- **Agent-Inspectability**: Artifact records are `instanceof`-
  dispatchable. WarpStream carries AbortSignal. Sink.consume()
  returns typed results.
