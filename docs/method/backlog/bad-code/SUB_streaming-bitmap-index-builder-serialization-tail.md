---
id: SUB_streaming-bitmap-index-builder-serialization-tail
blocked_by: []
blocks: []
---

# PROTO_streaming-bitmap-index-builder-serialization-tail

## What stinks

`src/domain/services/index/StreamingBitmapIndexBuilder.js` still has one uncovered fallback throw:

- line 177 in `serializeMergedShard(...)`, which catches `JSON.stringify(envelope)` failure and rethrows `ShardCorruptionError`

The builder only passes plain data envelopes into this helper. Under honest runtime behavior, the envelope shape is already JSON-serializable before the helper is called.

## Why it matters

- Coverage work turns into trying to break `JSON.stringify` rather than testing index-building behavior.
- The leftover miss is about defensive serialization paranoia, not index correctness.
- It is easy to over-invest in contrived harness tricks for a branch that production code is not expected to hit.

## Suggested direction

- Either accept this as defensive residue, or
- extract the serializer behind an injectable boundary so failure handling can be tested directly without warping the builder's public API.

## Evidence

- After the cycle 0010 streaming bitmap tranche, `StreamingBitmapIndexBuilder.js` was reduced to a single uncovered line while frontier writing, chunk validation, checksum checking, version handling, and bitmap merge validation were covered.
