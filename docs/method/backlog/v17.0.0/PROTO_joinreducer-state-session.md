---
id: PROTO_joinreducer-state-session
blocked_by: []
blocks:
  - PROTO_materialize-integration
---

# JoinReducer operates inside StateSession lifecycle

## Problem

`applyFast`, `applyWithDiff`, `applyWithReceipt`, and `reduceV5` all
mutate ORSet synchronously via `Op.mutate(state)`. With trie-backed
ORSets, the reducer must operate within a StateSession that manages
trie cursor lifecycle and page flushing.

## Fix

Wrap the reducer functions to operate within a StateSession:

1. Open session before patch replay
2. Ops mutate through the session's async interface
3. Close session after replay (flush dirty pages)
4. `join()` (state-to-state merge) opens sessions for both source
   states, merges leaf-by-leaf, and flushes

Callers of `reduceV5` see the same return type.

## Scope

**In:** Reducer session integration. All three application modes
(fast, diff, receipt). Join/merge path. Existing reducer tests must
pass.

**Out:** MaterializeController wiring (PROTO_materialize-integration).
