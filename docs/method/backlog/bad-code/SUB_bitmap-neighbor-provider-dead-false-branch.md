# PROTO_bitmap-neighbor-provider-dead-false-branch

## What stinks

`src/domain/services/index/BitmapNeighborProvider.js` still has a `return false` tail in `hasNode()` after:

- `_assertReady()` has already guaranteed at least one backend exists
- the logical path returns immediately when `_logical` is present
- the DAG path returns immediately when `_reader` is present

That leaves the final `return false` structurally unreachable in honest public usage.

## Why it matters

- Coverage time gets wasted trying to satisfy a branch that the public control flow cannot reach.
- The extra fallback suggests uncertainty in the method contract even though the routing logic is already decisive.

## Suggested direction

- Delete the dead tail branch, or
- replace it with an explicit assertion if the intent is to guard future refactors.

## Evidence

- After adding logical-index coverage in cycle 0010, `BitmapNeighborProvider.js` was reduced to a single uncovered line: the final `return false` in `hasNode()`.
