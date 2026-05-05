# Cycle 0008 Retro — Stream Architecture

**Status:** PARTIAL — Phase 1 delivered, Phases 2-4 deferred

## Hill

Replace slurp-and-serialize patterns with a composable streaming
architecture. Domain ports speak domain objects. Artifact records
have runtime identity. Memory usage is bounded by stream
backpressure, not by dataset size.

## What ground was taken

### Phase 1: WarpStream + artifact records + streaming ports

`WarpStream<T>` shipped as a composable async iterable with full
operator set: `pipe`, `tee`, `mux`, `demux`, `drain`, `reduce`,
`forEach`, `collect`. AbortSignal cancellation and pull-based
backpressure built in.

12 artifact record classes shipped in `src/domain/artifacts/`:

- **Checkpoint family:** CheckpointArtifact (abstract base),
  StateArtifact, FrontierArtifact, AppliedVVArtifact
- **Index shard family:** IndexShard (abstract base), MetaShard,
  EdgeShard, LabelShard, PropertyShard, ReceiptShard
- **Semantic units:** PatchEntry, ProvenanceEntry

All artifact classes are frozen, `instanceof`-dispatchable, with
typed payloads and `schemaVersion` fields.

Streaming port methods added:
- `IndexStorePort.writeShards(WarpStream<IndexShard>)`
- `IndexStorePort.scanShards(treeOid): WarpStream<IndexShard>`
- `PatchJournalPort.scanPatchRange(writerId, from, to): WarpStream<PatchEntry>`

Stream infrastructure base classes: `Sink` and `Transform` in
`src/domain/stream/`.

## What was not delivered

### Phase 2: Wire write paths (deferred)

Checkpoint and index write paths still use the old non-streaming
code. `CheckpointStorePort.writeCheckpoint()` not collapsed to
single-call. Index builders do not yet yield typed IndexShard
instances. SyncProtocol still calls legacy `loadPatchRange` instead
of `scanPatchRange`.

### Phase 3: P5 cleanup (deferred)

`defaultCodec` still imported in ~18 domain files. The codec belongs
at the adapter boundary only, but domain services
(CheckpointSerializer, StateSerializer, BitmapIndexReader,
PropertyIndexReader, WarpRuntime, StreamingBitmapIndexBuilder) still
reach for it directly. `defaultCodec.ts` and `canonicalCbor.ts` not
deleted.

### Phase 4: Memory-bounded witnesses (deferred)

No constrained-heap tests. No witness file. The streaming primitives
exist but there is no proof that a large dataset materializes without
OOM under bounded heap.

## Playback

### Agent

1. *Does the pipeline produce byte-identical output to the legacy
   path?*
   Not tested. No witness evidence.

2. *Does a constrained-heap test complete for a dataset that would
   otherwise OOM?*
   No. Phase 4 deferred.

3. *Do semantic ports still tell you WHAT is being persisted and WHAT
   lifecycle rules apply?*
   Yes. Ports carry domain objects (IndexShard subclasses, PatchEntry).
   Method signatures document bounded vs unbounded.

4. *Is CBOR vocabulary absent from domain nouns?*
   Partial. Artifact records have no CBOR references. But defaultCodec
   is still imported in ~18 domain files.

5. *Does every artifact record class add runtime identity, not just
   a name?*
   Yes. All CheckpointArtifact and IndexShard subclasses are
   `instanceof`-dispatchable concrete types.

### Human

Deferred to review. No witness file.

## What was learned

- The streaming primitives are solid. WarpStream composition works,
  and the artifact record hierarchy gives runtime identity to every
  piece of domain state that crosses a port boundary.
- But primitives without wiring are furniture without a house. Phase 1
  built the vocabulary; Phases 2-3 are where the vocabulary becomes
  load-bearing. Until the write paths are wired, the streaming
  architecture is a capability, not a guarantee.
- defaultCodec in domain files is the single biggest remaining
  hexagonal violation. It should be a high-priority cleanup.

## What comes next

- Phase 2 (wire write paths) can proceed immediately. The ports and
  artifact types are stable.
- Phase 3 (defaultCodec removal) is tracked in backlog. Should
  coordinate with INFRA_unify-persistence-on-git-cas.
- Phase 4 (memory-bounded witnesses) requires the Shadow-Trie ORSet
  work (Design 0018) to be meaningful — the biggest memory consumer
  is the ORSet itself, not the streaming pipeline. Once the trie
  engine is in place, a constrained-heap test becomes meaningful.
- The remaining work is tracked in backlog items, not as a new cycle.
  The streaming architecture cycle is done; the wiring is incremental
  follow-through.
