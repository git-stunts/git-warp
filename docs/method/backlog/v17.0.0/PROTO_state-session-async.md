---
id: PROTO_state-session-async
blocked_by:
  - PROTO_orsetlike-contract
  - PROTO_git-trie-store-port
  - PROTO_shadow-trie-orset
  - PROTO_trie-compaction
blocks:
  - PROTO_joinreducer-state-session
  - PROTO_gc-state-session
---

# Async StateSession as the only domain-facing access boundary for trie-backed ORSet state

## Problem

The trie-backed ORSet has async I/O under the hood (page loads, flushes).
Domain code (Ops, reducer, GC) currently accesses ORSet synchronously.
The async boundary must be explicit and contained, not leaked across
the entire domain layer.

## Fix

Implement `StateSession` in `warp-orset`:

- `open(state: WarpState): Promise<SessionHandle>` — initialize trie
  cursors for nodeAlive and edgeAlive, prime the LRU cache
- `close(): Promise<void>` — flush dirty pages, release resources
- Session methods are async. Domain code must await them.
- The session is the only component that knows about the trie. Domain
  Ops go through the session, not raw trie nodes.

## Scope

**In:** StateSession class. Async open/close lifecycle. Session-scoped
trie cursor management. Integration with ORSetLike contract.

**Out:** JoinReducer integration (PROTO_joinreducer-state-session).
GC integration (PROTO_gc-state-session).

## Existing v17 links

- API_capability-interfaces — the capability surface must be aware of
  session lifecycle for state access
- API_migrate-consumers-to-capabilities — consumers migrating to the
  capability API will go through StateSession indirectly

## Notes

- StateSession methods stay async. Do not hide async cost behind fake
  sync methods.
- The session is a short-lived boundary, not a long-lived connection.
  Open before a materialization pass, close after.
