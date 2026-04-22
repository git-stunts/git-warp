---
id: PORT_cli-persistence-plumbing-leak
blocked_by: []
blocks: []
feature: runtime-boundaries
---

# CLI persistence shape leaks plumbing into application wiring

**Effort:** S

## What's Wrong

`bin/cli/types.ts` exposes `plumbing: unknown` on the CLI persistence
shape, and `bin/cli/shared.ts` reaches into that field to wire
`CasSeekCacheAdapter`. Even though this happens in a composition root,
it normalizes the idea that callers may inspect persistence internals
for plumbing access.

## Why It Matters

This shape encourages the same `.plumbing` peeking that already leaked
into domain-side runtime construction. The composition root should wire
explicit capabilities, not carry an internal adapter handle around as
ambient state.

## Evidence

- `bin/cli/types.ts:10`
- `bin/cli/types.ts:21`
- `bin/cli/shared.ts:238`
- `bin/cli/shared.ts:240`

## Suggested Fix

1. Stop exposing `plumbing` on the generic CLI persistence contract.
2. Introduce a dedicated composition-only dependency shape for CAS
   consumers that truly need the plumbing-backed capability.
3. Keep plumbing handles out of general persistence APIs.
