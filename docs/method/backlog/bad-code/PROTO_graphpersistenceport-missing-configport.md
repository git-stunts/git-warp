# GraphPersistencePort drops ConfigPort capability and forces side channels

**Effort:** M

## What's Wrong

`ConfigPort` exists and `GitGraphAdapter` already implements
`configGet()` / `configSet()` through `@git-stunts/plumbing`, but
`GraphPersistencePort` does not include that surface. The capability
exists in the adapter but not in the main composite port contract.

## Why It Matters

This missing capability is part of why the hook path fell back to an
ad hoc callback and raw `git` subprocess calls. The repo already has a
plumbing-backed config boundary, but the main persistence contract
hides it.

## Evidence

- `src/ports/ConfigPort.ts:11`
- `src/ports/GraphPersistencePort.ts:32`
- `src/infrastructure/adapters/GitGraphAdapter.ts:378`
- `src/infrastructure/adapters/GitGraphAdapter.ts:391`

## Suggested Fix

1. Decide whether `GraphPersistencePort` should formally include
   `ConfigPort`.
2. If yes, make the composite port tell the runtime truth and update
   its documentation.
3. If no, introduce a separate first-class injected config port where
   Git config is needed.
4. Remove stringly callback corridors once a real port exists.
