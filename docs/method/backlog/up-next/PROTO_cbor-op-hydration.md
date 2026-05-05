---
id: PROTO_cbor-op-hydration
feature: runtime-boundaries
blocked_by: []
blocks: []
---

# CBOR decode boundary: hydrate ops into class instances

**Effort:** M

## Problem

Ops deserialized from CBOR are plain objects (`{ type: 'NodeAdd', ... }`).
They pass through the reducer via string dispatch but fail `instanceof`
checks. The decode boundary should hydrate plain objects into Op class
instances so the entire pipeline is class-native.

## Where

`CborPatchJournalAdapter` or `CborCodec` — wherever patches are
decoded from bytes back into `PatchV2` objects.

## Hard gate

Golden blob round-trip: encode a patch with classes → decode → verify
class instances. Must produce identical CRDT state.

## Source

Cycle 0009 retro, Slice 5 deferral.
