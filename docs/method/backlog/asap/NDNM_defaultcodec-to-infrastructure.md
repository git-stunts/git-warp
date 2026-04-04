# Dissolve serialization from domain (P5)

**Effort:** L

## Problem

20 domain services import `defaultCodec` and call `codec.encode()` /
`codec.decode()` directly. This is a P5 violation: "Serialization Is
the Codec's Problem." Domain services should work with domain objects,
not bytes. Serialization belongs at the infrastructure boundary.

`defaultCodec` is a singleton pretending to be dependency injection.
The `codec` constructor param is theater — every service can bypass
its caller and import the global directly.

## Wrong Fixes (Cycle 0007)

1. **Move `defaultCodec.js` to infrastructure.** Changes where the file
   lives, not where the boundary is. Domain services still call
   `encode()`.

2. **Thread codec through constructors.** Dependency-passing theater.
   Domain services still call `encode()`, they just receive the codec
   from their parent instead of importing it. Constructor injection is
   not absolution.

3. **Move serializer services to infrastructure.** Keeps the serializers
   alive, just in a different folder. And risks creating a god object
   if everything lands in GitGraphAdapter.

4. **Dissolve serializers into GitGraphAdapter.** Cures one god object
   (domain doing serialization) by creating another (infrastructure
   doing everything). GitGraphAdapter is Git plumbing. It stays Git
   plumbing.

## Right Fix: Two-Stage Boundary

If a domain service needs a codec, the boundary is in the wrong place.
Bytes are sewage. Keep them in the pipes.

### Stage 1 — Domain-facing artifact ports

Ports that speak domain artifacts and lifecycle semantics. Named by
what the caller means, not how Git stores it.

| Port | Speaks | Lifecycle |
|---|---|---|
| `PatchJournalPort` | PatchV2 ops | Append-only |
| `CheckpointStorePort` | Checkpoint records | Replace-latest |
| `IndexStorePort` | Index shard structures | Tree-structured, per-shard |
| `ProvenanceStorePort` | Provenance mappings | Alongside checkpoint |
| `BtrStorePort` | BTR records | Tamper-evident chain |

### Stage 2 — Infrastructure adapters (codec owners)

Adapters that turn domain artifacts into bytes over the raw Git ports.
Each adapter owns its codec instance.

| Adapter | Uses |
|---|---|
| `CborPatchJournalAdapter` | CommitPort, BlobPort, RefPort, CborCodec |
| `CborCheckpointStoreAdapter` | CommitPort, BlobPort, RefPort, CborCodec |
| `CborIndexStoreAdapter` | TreePort, BlobPort, CborCodec |
| `CborProvenanceStoreAdapter` | BlobPort, CborCodec |
| `CborBtrStoreAdapter` | CommitPort, BlobPort, CborCodec |

### Existing raw Git ports (unchanged)

`CommitPort`, `BlobPort`, `TreePort`, `RefPort`, `ConfigPort` stay as
infrastructure-level primitives. They speak bytes. That's correct —
they ARE about bytes. Domain services just stop talking to them
directly for artifact persistence.

## Critical: Split Semantic Projection from Byte Encoding

Some "serializer" files contain two concerns jammed together:

- `StateSerializerV5`: `projectStateV5()` (domain — semantic
  projection of visible state) + `serializeStateV5()` (boundary —
  byte encoding). Split these apart.
- `CheckpointSerializerV5`: `computeAppliedVV()` (domain logic) +
  `serializeAppliedVV()` / `deserializeAppliedVV()` (boundary logic).

Domain projection logic stays in domain. Byte encoding goes behind
the adapter.

## Boundary Records

Named by what they ARE, not how they're stored:

- `PatchRecord`
- `CheckpointRecord`
- `IndexShardRecord`
- `BtrRecord`

## Strangler Refactor — Cut Plan

One artifact family per slice. Prove the architecture with the two
biggest seams before touching the weirder storage families.

### Slice 1: Patches

- Add `PatchJournalPort`
- Move patch encode/decode out of domain callers
- Wire `Writer` / `SyncProtocol` / `PatchBuilderV2` through it
- Kill patch-related `defaultCodec` usage

### Slice 2: Checkpoints

- Split `computeAppliedVV` from checkpoint byte encoding
- Add `CheckpointStorePort`
- Move checkpoint encode/decode behind adapter

### Slice 3: Indexes

- Separate "build shard structure" from "encode shard bytes"
- Keep algorithmic builders if they're truly algorithmic
- Add `IndexStorePort`

### Slice 4: Provenance + BTR

- Same pattern
- Keep tamper-evident semantics visible in the port contract
- Hide bytes behind adapter

## Hard Gates

- **Hex Tripwire Test**: one test that recursively scans `src/domain/`
  for forbidden imports (`cbor-x`, `defaultCodec`, `.encode()` /
  `.decode()` on persistence codecs). Added at the start, ratcheted
  down per slice.
- **Golden Blob Museum**: check in canonical patch/checkpoint/index
  fixtures from real repo data. Require exact round-trip compatibility.
  Proves refactor didn't change wire format.
- **ESLint rule**: ban `defaultCodec` imports under
  `src/domain/services/`.
- **Design matrix**: artifact → domain type → boundary record → port →
  adapter → underlying raw ports. Lives in the cycle design doc.

## The 20 Offenders

### state/ (split projection from encoding)

- CheckpointSerializerV5.js
- StateSerializerV5.js

### index/ (split structure building from shard encoding)

- BitmapIndexBuilder.js
- StreamingBitmapIndexBuilder.js
- IncrementalIndexUpdater.js
- LogicalIndexBuildService.js
- IndexRebuildService.js
- LogicalIndexReader.js
- PropertyIndexReader.js
- IndexStalenessChecker.js
- LogicalBitmapIndexBuilder.js
- PropertyIndexBuilder.js

### provenance/ (serialize BTRs and provenance payloads)

- BoundaryTransitionRecord.js
- ProvenanceIndex.js

### sync/ (serialize sync protocol messages)

- SyncProtocol.js

### services root (various serialization needs)

- Frontier.js (serialize/deserialize frontier)
- PatchBuilderV2.js (encode patch ops)
- MaterializedViewService.js (orchestrates index serialization)
- WormholeService.js (compress/decompress wormholes)

### warp/ (writer encodes patches)

- Writer.js

### utils/ (dead code)

- canonicalCbor.js (unused — delete)

## Progress

### Shipped (Slices 1-2)

- **Patches**: PatchJournalPort + CborPatchJournalAdapter. PatchBuilderV2,
  SyncProtocol, Writer are codec-free. 27 tripwire checks.
- **Checkpoints**: CheckpointStorePort + CborCheckpointStoreAdapter.
  CheckpointService routes through port. 9 tripwire checks.

### Remaining (Slices 3-4) → Stream Architecture Cycle

Index files (12) and provenance/BTR files need the stream architecture,
not more per-artifact ports. Collection APIs that return graph-scale
aggregates must become `AsyncIterable<SemanticUnit>`. Single bounded
artifacts (Slices 1-2) are correctly handled by semantic ports.

See `PERF_stream-architecture.md` for the stream cycle proposal.

## Source

Cycle 0007 defaultCodec migration attempt (failed). Root cause analysis
identified the P5 violation. Corrected 2026-04-04: the fix is a
two-stage boundary with artifact-level ports, not file relocation or
serializer migration. Slices 3-4 deferred to stream architecture cycle
(2026-04-04).
