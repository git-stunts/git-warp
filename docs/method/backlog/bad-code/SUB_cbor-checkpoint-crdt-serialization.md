---
id: SUB_cbor-checkpoint-crdt-serialization
blocked_by: []
blocks: []
feature: trie-state-storage
---

# CborCheckpointStoreAdapter owns general CRDT serialization

**Effort:** M

`CborCheckpointStoreAdapter.js` (~366 LOC) carries full CRDT
serialization logic for LWW registers, ORSet entries, edge birth
events, and property maps. This serialization is general-purpose
CRDT encoding, not checkpoint-specific.

## What's wrong

- **S concern**: The adapter should orchestrate read/write against
  the blob port, not own the full serialize/deserialize for every
  CRDT type.
- If another adapter needs CRDT serialization (e.g., a future
  snapshot export), the logic would be duplicated.

## Suggested fix

Extract CRDT serialization to a `CrdtCodec` or `StateCodec` module
in `src/infrastructure/codecs/`. The checkpoint adapter calls it
for encode/decode, then writes blobs.
