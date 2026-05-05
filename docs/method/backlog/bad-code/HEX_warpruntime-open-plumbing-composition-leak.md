---
id: HEX_warpruntime-open-plumbing-composition-leak
blocked_by: []
blocks: []
feature: materialization-query-index
release_home: v17.0.0
---

# WarpRuntime.open constructs infrastructure adapters by peeking at plumbing

**Effort:** M

## What's Wrong

`WarpRuntime.open()` checks `Reflect.get(persistence, 'plumbing')` and
dynamically imports infrastructure adapters to decide how to build the
patch journal and checkpoint or index storage. Domain code is making
infrastructure construction decisions based on plumbing presence.

## Why It Matters

This is a composition leak from infrastructure into `src/domain/**`.
The runtime should accept ports or a factory boundary, not inspect
adapter internals and instantiate concrete infrastructure classes
itself.

## Evidence

- `src/domain/WarpRuntime.ts:488`
- `src/domain/WarpRuntime.ts:493`
- `src/domain/WarpRuntime.ts:505`
- `src/domain/WarpRuntime.ts:535`

## Suggested Fix

1. Move adapter construction out of `WarpRuntime.open()` into a
   composition root or dedicated factory port.
2. Stop peeking at `.plumbing` from domain code.
3. Make storage-route selection explicit in the composition layer
   rather than inferred from adapter internals.
