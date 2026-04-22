---
id: MODEL_trust-state-validation
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# TrustState constructor validates nothing and exposes mutable Maps

**Effort:** M

## What's Wrong

`TrustState` accepts whatever Maps you hand it without checking they are actually Maps or that keys conform to the expected format. The object is frozen via `Object.freeze`, but Maps are reference types — freezing the object does not freeze the Map contents. Callers can mutate the internal state after construction. Additionally, `TrustEvaluator` iterates Maps directly and knows the `\0`-separated key encoding, coupling it to internal representation.

## Suggested Fix

Add constructor validation (assert Maps, validate key formats). Expose query methods (`hasActiveKey`, `getBindingsForWriter`) instead of raw Maps, hiding the internal key encoding. Deep-copy or defensively wrap Maps to prevent post-construction mutation.
