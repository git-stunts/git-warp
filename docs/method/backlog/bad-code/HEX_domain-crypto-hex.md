# TrustCanonical.js imports defaultCrypto (node:crypto in domain)

**Effort:** M

## What's wrong

`TrustCanonical.js` imports `defaultCrypto` which reaches for `node:crypto`. The domain trust layer should not directly depend on Node-specific crypto -- this is the same hex violation pattern as `defaultCodec`.

Domain code must not import host-specific APIs. This breaks multi-runtime support (Bun/Deno) and violates the hexagonal architecture boundary.

## Suggested fix

- Remove `defaultCrypto` import from `TrustCanonical.js`.
- Accept crypto as an injected dependency via the caller.
- Wire crypto through `TrustRecordService` or trust evaluation entry points, following the same pattern used for codec injection.
