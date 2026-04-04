# Extract serialization from domain services (P5)

**Effort:** L

## Problem

20 domain services import `defaultCodec` and call `codec.encode()` /
`codec.decode()` directly. This is a P5 violation: "Serialization Is
the Codec's Problem." Domain services should work with domain objects,
not bytes. Serialization belongs at the infrastructure boundary.

`defaultCodec` is a singleton pretending to be dependency injection.
The `codec` constructor param is theater — every service can bypass
its caller and import the global directly.

The original backlog item framed this as "move defaultCodec.js to
infrastructure." That's wrong. Moving the file treats the symptom.
The disease is that 20 domain services do serialization.

## The 20 Offenders

### state/ (serialization IS their job — likely move to infrastructure)

- CheckpointSerializerV5.js
- StateSerializerV5.js

### index/ (build serialized index trees — likely move to infrastructure)

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

## Fix

This is architectural work, not a file move. Phased approach:

1. Delete `canonicalCbor.js` (dead code, immediate)
2. Audit each of the 20 services: is serialization their primary
   concern, or is it incidental?
3. Services whose primary concern IS serialization (CheckpointSerializer,
   StateSerializer, index builders) should move to infrastructure
4. Services where serialization is incidental should receive
   pre-serialized data or delegate serialization to an adapter
5. When no domain service imports `defaultCodec`, delete it

## Source

Cycle 0007 defaultCodec migration attempt (failed). Root cause
analysis identified the real P5 violation: domain services doing
serialization, not the file's location.
