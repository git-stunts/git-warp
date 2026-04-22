---
id: CAST_wormhole-service-defensive-tail-branches
blocked_by: []
blocks: []
feature: merge-strands-worldlines
release_home: v20.0.0+
---

# PROTO_wormhole-service-defensive-tail-branches

## What stinks

`src/domain/services/WormholeService.js` still has two uncovered fallback throws in `collectPatchRange()`:

- line 215: post-loop `fromSha` ancestry failure
- line 222: empty-range guard after the collection walk

After covering the real failure modes in cycle 0010, both remaining branches look like defensive tails rather than reachable behavior.

## Why it matters

- Coverage time gets wasted trying to force impossible control flow instead of testing actual wormhole behavior.
- The extra tails make it harder to read the real contract of the range walk, which already fails earlier for invalid ancestry and missing parents.

## Suggested direction

- Replace the tails with explicit assertions documenting the invariant, or
- delete them if the earlier guards already make the function total.

## Evidence

- `createWormhole()` now covers non-patch commits, graph mismatch, encrypted patch handling, missing patch blobs, multi-writer composition, and invalid JSON input.
- The only remaining uncovered `WormholeService.js` lines are the post-loop invalid-range and empty-range throws at 215 and 222.
