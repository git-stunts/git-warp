---
id: PROTO_gc-state-session
blocked_by:
  - PROTO_state-session-async
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
2. Call `compact()` through the ORSetLike interface
3. Close the session (flush compacted pages)

`GCMetrics.fromState` uses the ORSetLike counting methods, which may
require a trie scan. Keep the existing `GCExecuteResult` return type.

## Scope

**In:** GC session integration. Metrics collection through ORSetLike.
Existing GC tests must pass.

**Out:** MaterializeController wiring (PROTO_materialize-integration).
