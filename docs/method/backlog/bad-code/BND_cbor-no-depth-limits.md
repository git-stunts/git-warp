---
id: BND_cbor-no-depth-limits
blocked_by: []
blocks: []
feature: sync-trust-security
---

# CBOR deserialization has no depth or size limits

**Effort:** S

`cborDecode(buffer)` is called with no options at 3 sites:
`defaultCodec.js:92`, `CborCodec.js:377`, and indirectly through
all adapter decode paths. cbor-x does not impose depth limits by
default. A malicious patch blob via sync could cause stack overflow
or memory exhaustion with deeply nested structures.

The 10MB HTTP body limit is insufficient — 10MB of deeply nested
CBOR can still overflow the stack.

## What's wrong

- No depth limit on CBOR decoding (stack overflow risk)
- No pre-decode size check on blob payloads
- Attack surface: any sync-exposed deployment

## Suggested fix

Create `safeDecode(buffer, { maxDepth, maxSize })` wrapper.
Set maxDepth=32, maxSize=5MB. Route all cborDecode callsites
through it. Add fuzz test for random CBOR payloads.
