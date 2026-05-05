---
id: HEX_sync-secret-plain-string
blocked_by: []
blocks: []
feature: sync-trust-security
release_home: v17.0.0
---

# Sync auth HMAC secrets passed as plain strings through domain

**Effort:** M

**Status:** Closed in cycle `0137-sync-secret-opaque-value`.

## What's Wrong

`SyncAuthService.ts` — HMAC secrets are received and passed as raw
`string` values through multiple domain layers. There is no
structural protection against accidental logging, serialization, or
inclusion in error messages.

## Resolution

Introduced an opaque `SyncSecret` class:

```text
class SyncSecret {
  readonly #value: string;
  static fromString(value: string): SyncSecret { ... }
  hmac(crypto, algorithm, data): Promise<Uint8Array> { ... }
  toString(): string { return '[REDACTED]'; }
  toJSON(): string { return '[REDACTED]'; }
}
```

The raw value is owned by `SyncSecret`; HMAC signing goes through the
secret object instead of unwrapping the value into controller or port
option bags.
This structurally prevents secret leakage in logs and serialization.
