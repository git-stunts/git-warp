---
id: PROTO_safe-cbor-decoder
blocked_by: []
blocks: []
feature: sync-trust-security
---

# Safe CBOR decoder with depth/size/allocation limits

The CBOR deserialization attack surface is real but the fix is
more interesting than just "add a maxDepth option."

What if git-warp had a `SafeDecoder` class that wraps any codec
and enforces configurable limits?

```javascript
const decoder = new SafeDecoder(cborCodec, {
  maxDepth: 32,
  maxOutputBytes: 5_000_000,
  maxArrayLength: 100_000,
  maxStringLength: 1_000_000,
  timeout: 5000,
});

const result = decoder.decode(untrustedBytes);
// Throws DecodeLimitExceeded if any limit is breached
```

The decoder wraps the codec's `decode()` and either:
- Uses cbor-x's built-in options (if available)
- Post-validates the decoded structure with a recursive depth/size
  walk (slower but codec-agnostic)

The codec-agnostic approach is interesting because it means SafeDecoder
works with any CodecPort implementation — JSON, CBOR, MessagePack,
whatever. The limits are on the decoded structure, not the wire format.

This could be a standalone package: `@git-stunts/safe-decode`. Any
project that accepts untrusted encoded data could use it.
