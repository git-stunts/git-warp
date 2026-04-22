---
id: HEX_sync-secret-plain-string
blocked_by: []
blocks: []
feature: sync-trust-security
release_home: v17.0.0
---

# Sync auth HMAC secrets passed as plain strings through domain

**Effort:** M

## What's Wrong

`SyncAuthService.ts` — HMAC secrets are received and passed as raw
`string` values through multiple domain layers. There is no
structural protection against accidental logging, serialization, or
inclusion in error messages.

## Suggested Fix

Introduce an opaque `SyncSecret` class:
```ts
class SyncSecret {
  readonly #value: string;
  constructor(value: string) { this.#value = value; }
  unwrap(): string { return this.#value; }
  toString(): string { return '[REDACTED]'; }
  toJSON(): string { return '[REDACTED]'; }
}
```
This structurally prevents secret leakage in logs and serialization.
