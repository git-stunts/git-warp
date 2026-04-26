---
id: IMM_snapshot-builder-domain-model
blocked_by:
  - ARCH_sludge-atlas-and-refactor-guide
blocks:
  - 0096-purge-cast-hacks
feature: materialization-snapshotting
release_home: v17.0.0
---

# ImmutableSnapshot is a procedural clone helper, not a domain model

**Effort:** M

## What's Wrong

`src/domain/services/ImmutableSnapshot.ts` promises that an arbitrary
`T` can be deep-cloned, frozen, and returned as the same `T`.

That is not generally true. The implementation walks object
descriptors, reconstructs instances with `Object.create`, and then
casts the result back to `T`. It can preserve some surface behavior,
but it cannot prove constructor invariants, private state semantics,
or runtime identity for arbitrary domain objects.

## Why This Matters

The current `as unknown as T` cast is not an isolated type issue. It is
evidence that "immutable snapshot" is missing a runtime-backed noun or
builder protocol.

## Suggested Fix

- Stop promising generic preservation for arbitrary `T`.
- Introduce an explicit snapshot builder or immutable snapshot value.
- Preserve domain objects only through their constructors or an explicit
  snapshot protocol.
- Keep collection read-only behavior as part of the snapshot model, not
  as scattered helper functions with a shared `seen` map.

## Acceptance

- 0096 can remove the `ImmutableSnapshot` cast without weakening the
  type model.
- The public return type names the snapshot semantics honestly.
- Tests cover read-only Map and Set behavior, cycles, VersionVector, and
  domain object invariants.
