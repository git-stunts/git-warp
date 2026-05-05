# 0137 Sync Secret Opaque Value Retro

- Date: 2026-05-05
- Cycle: `0137-sync-secret-opaque-value`
- Source task: `HEX_sync-secret-plain-string`
- Commit: this cycle closeout commit

## What Happened

Sync auth secrets were previously plain strings in public options,
domain auth keys, and the HTTP sync signing port. This slice added a
runtime-backed `SyncSecret` value and moved sync auth to carry that value
instead.

`SyncSecret` redacts in accidental stringification, JSON serialization,
and Node inspect output. HMAC signing still sees the underlying secret
through the object-owned signing method, so existing auth behavior stays
byte-compatible for matching credentials.

## What Went Well

- The RED was direct: missing `SyncSecret` import and consumer export,
  then focused tests for redaction, verification, and type boundaries.
- Runtime tests caught two `as any` fixtures that typecheck could not
  see.
- Full `test:local` stayed green after the public auth boundary change.

## What Was Messy

- Several sync tests still use broad `as any` host mocks, so they bypass
  useful type drift until runtime.
- Public docs had only one auth example, but it taught raw strings in the
  most security-sensitive place.
- `HttpSyncServer` still has known parsing/cast sludge that belongs to a
  separate response-shaping/server-hardening slice.

## SSJS Scorecard

- Runtime-backed forms for new concepts: pass; `SyncSecret` is a frozen
  class with behavior.
- Boundary validation stays at boundaries: pass; `SyncAuthService` and
  server options reject non-secret key values.
- Behavior lives on the owning type/module: pass; HMAC access is owned by
  `SyncSecret`.
- No message parsing for behaviorally significant branching: pass.
- No ambient time or entropy in domain code: pass; existing nonce
  generation remains unchanged.
- No fake shape trust or cast-cosplay: pass for new production code;
  pre-existing test casts remain.

## Next

Pull `HEX_sync-production-auth-defaults`. The branch now has the opaque
credential value needed to make non-local sync serving fail closed unless
auth is explicitly enforced.
