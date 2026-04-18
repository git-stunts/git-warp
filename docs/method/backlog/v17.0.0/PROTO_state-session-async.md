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

# Async StateSession as the true domain-facing contract for trie-backed ORSet state

## Problem

The trie-backed ORSet has async I/O under the hood (page loads, flushes).
Domain code (Ops, reducer, GC) currently accesses ORSet synchronously
through `ORSetLike`. The async boundary must be explicit, and the domain
must have a single contract for trie-backed state access.

## Fix

Implement `StateSession` as the domain-facing contract:

- `open(state: WarpState): Promise<SessionHandle>` — initialize trie
  cursors for nodeAlive and edgeAlive, prime the LRU cache
- `close(): Promise<void>` — flush dirty pages, release resources
- Async state access methods on the session handle:
  - `nodeContains(id): Promise<boolean>`
  - `edgeContains(key): Promise<boolean>`
  - `addNode(id, dot): Promise<void>`
  - `removeNodes(dots): Promise<void>`
  - `scanNodes(): AsyncIterable<string>`
  - (and edge equivalents)
- Session methods are async. Domain code must await them.

## Role in the seam architecture

- `ORSetLike` is the **in-memory seam** — synchronous, satisfied by the
  existing `ORSet` class. Used when operating on in-memory state in
  tests and migration-tool internals only. It is NOT a production
  runtime fallback path for old checkpoints or old ORSet-backed graphs.
- `StateSession` is the **domain-facing contract** for trie-backed
  state. It wraps `ShadowTrieORSet` internally. Domain code (reducer,
  GC, Ops) goes through the session when operating on trie-backed
  state.
- `ShadowTrieORSet` is an internal engine. It is NOT exposed to domain
  code directly. The session is the only thing that talks to it.

This split avoids the contradiction of a synchronous interface
promising to wrap async I/O.

## Scope

**In:** StateSession class. Async open/close lifecycle. Session-scoped
trie cursor management. Domain-facing async state access methods.

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
- Legacy substrate readers belong in `scripts/migrations/v17.0.0/`,
  not behind hidden branches inside `StateSession`.
