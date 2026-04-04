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

## Wrong Fix (Cycle 0007)

The original framing was "move defaultCodec.js to infrastructure."
The revised framing was "move serialization-primary services to
infrastructure." Both are wrong. Moving files — whether the codec
or the serializers — keeps serialization alive as a named concern.
The serializers just end up in a different folder doing the same
thing.

## Right Fix

Domain services produce and consume domain objects. Period. The
persistence adapter serializes at the boundary. Serializer services
don't move — they dissolve into the adapter layer.

- Port contracts speak domain types, not bytes
- GitGraphAdapter (or whatever implements the port) owns encode/decode
- The codec is an infrastructure implementation detail
- `defaultCodec` disappears because nothing in domain needs it

### The 20 Offenders

#### state/ (serialization IS their job — dissolve into adapter)

- CheckpointSerializerV5.js
- StateSerializerV5.js

#### index/ (build serialized index trees — dissolve into adapter)

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

#### provenance/ (serialize BTRs and provenance payloads)

- BoundaryTransitionRecord.js
- ProvenanceIndex.js

#### sync/ (serialize sync protocol messages)

- SyncProtocol.js

#### services root (various serialization needs)

- Frontier.js (serialize/deserialize frontier)
- PatchBuilderV2.js (encode patch ops)
- MaterializedViewService.js (orchestrates index serialization)
- WormholeService.js (compress/decompress wormholes)

#### warp/ (writer encodes patches)

- Writer.js

#### utils/ (dead code)

- canonicalCbor.js (unused — delete)

## Phased Approach

1. Delete `canonicalCbor.js` (dead code, immediate)
2. Audit each of the 20 services: what domain objects does it
   produce/consume vs. what bytes does it touch?
3. Redefine port contracts in domain terms (domain objects in,
   domain objects out)
4. Move serialization into adapter implementations behind those ports
5. Domain services stop importing codec; serializer services dissolve
6. Delete `defaultCodec` when nothing in domain imports it

## Source

Cycle 0007 defaultCodec migration attempt (failed). Root cause
analysis identified the real P5 violation. Corrected 2026-04-04:
the fix is dissolution, not relocation.
