---
title: "MaterializeController retains legacy seek-cache path beside unified snapshot resolver"
legend: SUB
---

# MaterializeController retains legacy seek-cache path beside unified snapshot resolver

## Problem

Cycle `0034` introduced a unified snapshot/cache control plane:

- `WarpStateCachePort`
- exact snapshot lookup
- best compatible predecessor lookup
- snapshot pinning for checkpoints

But `MaterializeController` still keeps the old seek-cache fast path
alive for ceiling materialization through:

- `getSeekCache()`
- `buildSeekCacheKey(...)`
- `_materializeWithCeilingCached(...)`

So there are still two persisted snapshot systems active at runtime:

- unified snapshot resolution for coordinate materialization
- legacy seek-cache restoration for ceiling materialization

## Why this is bad

- the runtime still violates the "one snapshot substrate" law
- different materialization entry points have different cache behavior
- the repo keeps the old frontier-hash-only seek-cache semantics alive
  in the hot path
- future migration and cleanup work gets harder because both systems
  remain live instead of one replacing the other

## Desired fix

Route ceiling materialization through the same `WarpStateCache`
resolver used by coordinate materialization, then retire the legacy
seek-cache fast path and its keying scheme.
