# ADR 004: Binary Shard Serialization and Incremental Indexing

## Status

Proposed

## Context

The current "Empty Graph" index implementation utilizes JSON shards to store Roaring Bitmaps. While functional, this approach suffers from two primary inefficiencies:

1. **Serialization Overhead:** Roaring Bitmaps are native binary structures. Storing them in JSON requires Base64 encoding, which introduces a ~33% size penalty and significant CPU overhead during serialization/deserialization.
    
2. **Monolithic Rebuilds:** The current indexing process is $O(N)$, requiring a full scan of the graph even for minor commits. As the graph grows, the cost of re-indexing becomes prohibitive.
    

## Decision

We will transition the indexing system to support **pluggable binary codecs** (defaulting to CBOR) and implement an **incremental update strategy** based on Git's reachability logic.

### 1. Pluggable Codecs

We will introduce a `ShardCodec` abstraction. This allows the system to read legacy JSON shards while writing new shards in a binary-optimized format.

- **Primary Format:** **CBOR** (Concise Binary Object Representation). It allows for raw byte-array embedding, removing the need for Base64 encoding.
    
- **Detection:** Implementation of "magic byte" detection at the start of the buffer to determine which codec to use during `_loadShardBuffer`.
    

### 2. Incremental Update Logic

Instead of a full graph walk, the system will use `git rev-list` to identify only the delta between the `last-indexed-commit` and the current `HEAD`.

- **Tracking:** A new ref `refs/empty-graph/index-meta` will store the OID of the last indexed commit.
    
- **Merging:** New edges will be merged into existing shards using Roaring's `orInPlace()` operation.
    
- **Partial Tree Writes:** Only shards containing modified prefixes will be re-written to the Git ODB. Unmodified shards will be referenced by their existing OIDs in the new tree.
    

## Technical Specification

### Codec Interface

JavaScript

```
export class ShardCodec {
  encode(envelope) { /* Returns Buffer with raw binary bitmaps */ }
  decode(buffer) { /* Returns envelope with bitmaps hydrated */ }
}
```

### Format Detection Logic

|**Byte**|**Format**|
|---|---|
|`0x7B`|JSON (`{`)|
|`0xA2`/`0xA3`|CBOR Map|
|`0x82`/`0x83`|MessagePack Map|

## Consequences

### Positive

- **Storage Efficiency:** Estimated **35% reduction** in index size on disk.
    
- **Performance:** Parse speeds are expected to increase from ~50 MB/s to **~150+ MB/s**.
    
- **Scalability:** Re-indexing after a small commit will take constant time relative to the commit size, rather than linear time relative to the total graph size.
    

### Negative / Neutral

- **Tooling:** Standard `git cat-file -p` will no longer show human-readable content for binary shards.
    
- **Complexity:** The builder must now handle stateful merges (loading existing shards before writing) rather than pure append-only writes.
    

## Validation Strategy

- **Ancestry Check:** Before an incremental update, we must verify that the `index-meta` tip is a direct ancestor of the current `HEAD`. If the graph has been rebased or diverged, a full rebuild is triggered.
    

---

Would you like me to generate the boilerplate for the `IncrementalIndexBuilder` class to handle the shard merging logic?