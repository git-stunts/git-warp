# Technical Specification: Binary Shards & Incremental Updates

**Reference ADR:** [ADR 004](../adr/proposed/ADR-004-BINARY-SHARDS-INCREMENTAL-UPDATES.md) 
**Status:** Implementation Ready  
**Owner:** @flyingrobots  

## 1. Component Overview

This implementation modifies the `StreamingBitmapIndexBuilder` to support incremental updates and introduces a `ShardCodec` layer to replace JSON serialization with CBOR.

## 2. Detailed Design

### 2.1 ShardCodec Layer

Create a new directory `src/domain/services/codecs/`.

- **Abstract Base:** `ShardCodec.js`
- **Implementations:** `JsonCodec.js` (legacy), `CborCodec.js` (target).

**Encoding Logic (CborCodec):** To maximize savings, the codec must transform the data shape before passing it to the CBOR library.

```javascript
// Transform: { "sha": "base64..." } -> { "sha": Buffer }
// This allows CBOR to use native byte arrays instead of strings.
const binaryData = Object.fromEntries(
  Object.entries(envelope.data).map(([sha, b64]) => [sha, Buffer.from(b64, 'base64')])
);
return cbor.encode({ ...envelope, data: binaryData });
```

### 2.2 Incremental Merge Logic

The `IncrementalIndexBuilder` must extend the existing builder to support stateful merges.

**Algorithm for `finalize()`:**

1. Identify all prefixes modified by `addEdge()`.
2. For each modified prefix:
    - Load the existing shard blob from the ODB.
    - Deserialize and perform `mergedBitmap.orInPlace(newBitmap)`.
    - Re-serialize via `CborCodec`.
3. For unmodified prefixes:
    - Directly reference the existing Blob OID in the new Git Tree.

## 3. Storage Changes

- **Metadata Ref:** `refs/empty-graph/index-meta`
- **Metadata Shape:**
    
    ```json
    {
      "lastIndexedCommit": "sha256...",
      "codec": "cbor",
      "version": 1
    }
    ```
    

## 4. Implementation Checklist

- [ ] Add `cbor-x` dependency for high-performance binary encoding.
- [ ] Refactor `BitmapIndexReader._loadShardBuffer` to use magic-byte detection.
- [ ] Implement `IncrementalIndexBuilder` with prefix-aware merging.
- [ ] Add unit tests for "partial tree updates" (verifying unmodified OIDs remain identical).