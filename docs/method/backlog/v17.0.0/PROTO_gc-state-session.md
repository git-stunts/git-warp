---
id: PROTO_gc-state-session
blocked_by: []
blocks:
  - PROTO_materialize-integration
---

# GC operates through StateSession lifecycle

## Problem

`executeGC` calls `ORSet.compact(appliedVV)` synchronously. With
trie-backed ORSets, compaction must happen within a StateSession
that handles page loading and dirty-page flushing.

## Fix

Wrap `executeGC` to:

1. Open a StateSession
2. Call `compact()` through the session-owned trie-backed state access
   path
3. Close the session (flush compacted pages)

`GCMetrics.fromState` currently relies on synchronous concrete `ORSet`
counting methods. The trie-backed path must obtain the equivalent counts
through `StateSession`, even when that requires a trie scan. Keep the
existing `GCExecuteResult` return type.

## Scope

**In:** GC session integration. Metrics collection through
`StateSession` / trie-backed state access. Existing GC tests must pass.

**Out:** MaterializeController wiring (PROTO_materialize-integration).
