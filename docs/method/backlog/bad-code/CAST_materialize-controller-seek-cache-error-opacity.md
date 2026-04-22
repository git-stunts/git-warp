---
id: CAST_materialize-controller-seek-cache-error-opacity
blocked_by: []
blocks: []
---

# PROTO_materialize-controller-seek-cache-error-opacity

## What stinks

`src/domain/services/controllers/MaterializeController.js` still has two uncovered seek-cache error branches:

- `tryReadCoordinateCache()` returns `null` when `buildSeekCacheKey()` throws
- `_materializeWithCoordinate()` recomputes the cache key on write when the earlier read path produced no key

In practice, both branches are controlled by `buildSeekCacheKey()`, which closes over module-scoped `defaultCrypto` rather than the host-injected crypto surface the rest of the controller uses.

## Why it matters

- The failure mode is hard to induce through the public controller contract, so coverage work gets pushed toward module-level mocking instead of honest behavioral tests.
- The controller is otherwise host-driven, but seek-cache key generation quietly escapes that boundary.
- Opaque failure branches make it harder to tell whether the code is defensive-on-purpose or just carrying dead contingency logic.

## Suggested direction

- Route seek-cache key generation through an injected dependency or host surface, or
- collapse the unreachable contingency if `buildSeekCacheKey()` cannot actually fail in supported runtimes.

## Evidence

- After the cycle 0010 `MaterializeController` coverage tranche, the file was reduced to two remaining uncovered lines: the seek-cache key failure branches at lines 245 and 842.
