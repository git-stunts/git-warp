# StrandService is a god object (2048 LOC)

**Effort:** L

## Problem

StrandService handles: strand CRUD, strand materialization, strand
patching, intent queuing/dequeuing, strand transfer planning, strand
braiding, strand overlays, strand comparison, and descriptor
serialization. It owns 40+ methods across ~2048 lines.

## Decomposition candidates

- `StrandMaterializationService` — materialize/compare/snapshot
- `StrandIntentService` — intent queue (queue, dequeue, tick, drain)
- `StrandBraidService` — braid overlay pinning and resolution
- `StrandTransferService` — transfer plan computation
- `StrandDescriptorCodec` — serialization/deserialization

Each sub-service takes the same `graph` + `persistence` deps.
StrandService becomes a thin facade.
