---
id: SUB_legacy-seek-cache-key-drops-frontier
blocked_by: []
blocks: []
feature: materialization-query-index
release_home: v17.0.0
---

# Legacy seek-cache key drops frontier

`src/domain/utils/seekCacheKey.ts` only stores:

- `ceiling`
- `frontierHash`

That means a legacy seek-cache entry does **not** carry the actual
frontier needed to reconstruct a full coordinate.

Why this is bad:

- cycle `0034` is unifying coordinate snapshots and checkpoints into one
  `WarpStateSnapshot` family
- exact and predecessor lookup both need the real coordinate:
  - frontier
  - ceiling
- a legacy seek-cache key cannot be upgraded into a truthful unified
  snapshot descriptor unless the migration tool supplies frontier data
  from somewhere else

Why this matters:

- legacy checkpoint import can be honest because checkpoints already
  carry frontier metadata
- legacy seek-cache import cannot be honest from the key alone
- any migration story that says "wrap old seek-cache entries directly"
  is incomplete unless it defines the frontier sidecar source

What good looks like:

- the unified snapshot importer rejects legacy seek-cache import when
  frontier is unavailable, or
- the migration tool explicitly provides frontier sidecar data and
  records that it did so

Affected paths:

- `src/domain/utils/seekCacheKey.ts`
- `src/ports/SeekCachePort.ts`
- `src/infrastructure/adapters/CasSeekCacheAdapter.ts`
- `docs/design/0034-unify-seek-cache-and-checkpoints.md`
