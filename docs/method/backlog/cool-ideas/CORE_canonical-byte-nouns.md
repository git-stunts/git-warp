---
id: CORE_canonical-byte-nouns
blocked_by: []
blocks: []
feature: runtime-boundaries
release_home: v18.0.0
---

# Canonical byte nouns for hash and signature boundaries

**Effort:** M

## Idea

Hashing and signing APIs should not accept arbitrary object bags. They
should accept a named canonical byte value produced by a boundary codec.

For example, instead of:

```ts
crypto.hash('sha256', objectOrBytes)
crypto.hmac('sha256', key, codec.encode(objectBag))
```

use a runtime-backed noun such as `CanonicalBytes` or a more specific
domain noun like `BtrSigningBytes`.

## Why Cool

It makes deterministic encoding visible at the type boundary. A caller
cannot accidentally sign a JavaScript object whose field order,
prototype, or codec implementation changes the byte stream. The codec
boundary owns byte production; domain/application code only receives
already-canonical bytes.

This would also give agents a simple review rule:

If a hash or HMAC is over an object, the patch is wrong. If it is over a
named canonical byte value, inspect the boundary that produced it.

## Sketch

- Introduce a tiny runtime-backed byte noun with immutable `Uint8Array`
  storage.
- Add focused codec ports that return canonical byte nouns for specific
  signing/hash envelopes.
- Update hash/HMAC call sites to require canonical byte nouns when the
  input is semantic data rather than raw file/blob bytes.
- Keep raw blob hashing separate; Git blob bytes are already bytes and
  do not need semantic encoding.
