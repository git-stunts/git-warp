---
id: DX_requirecapabilities-as-pattern
blocked_by: []
blocks: []
feature: api-capabilities
---

# requireCapabilities as a universal adapter wiring pattern

**Effort:** S

## Idea

The `requireCapabilities` pattern — runtime-validated capability
extraction with bound methods — is too good to live in just one place.
Right now it proves that a persistence object has the methods we need,
binds them, freezes the result, and hands back a tight, honest contract.
One call, one seam, loud failure if the object doesn't deliver.

Imagine generalizing this across every adapter boundary in the codebase.
`requireCryptoCapability(obj)` returns a frozen `{ hash, hmac }`.
`requireClockCapability(obj)` returns a frozen `{ now, performance }`.
`requireCodecCapability(obj)` returns a frozen `{ encode, decode }`.
Every port-to-adapter seam validates once, up front, with a stack trace
that points straight at the misconfigured wiring — not at some method
call three layers deep where `undefined is not a function`.

The generic form writes itself: `requireCapability(obj, methodNames[])`
returns a frozen object of bound methods. It's maybe 15 lines. The
type-safe wrappers are one-liners on top. This turns "hope the object
has the right shape" into "prove it at the seam, once, loudly." Duck
typing with teeth.

## Why cool

Every adapter wiring bug we've ever had — missing `readTreeOids`,
unbound `this` on extracted methods, undefined codec — would have been
caught at construction time with a clear error message. The pattern
already works. It just needs to spread.
