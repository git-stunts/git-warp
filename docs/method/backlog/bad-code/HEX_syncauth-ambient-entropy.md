---
id: HEX_syncauth-ambient-entropy
blocked_by: []
blocks: []
feature: sync-trust-security
---

# SyncAuthService uses crypto.randomUUID for HMAC nonce

**Effort:** S

`SyncAuthService.js:61` uses `globalThis.crypto.randomUUID()` to
generate HMAC nonces. This is ambient entropy in the domain layer,
violating the `no-ambient-entropy` invariant.

The nonce is used for replay protection — it must be unique per
request. But the uniqueness source should be injected, not ambient.

## Suggested fix

Accept an entropy/nonce source via constructor or parameter.
The adapter or caller provides the UUID generator; the domain
only consumes it.
