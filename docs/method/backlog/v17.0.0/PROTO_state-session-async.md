---
id: PROTO_state-session-async
blocked_by:
  - PROTO_shadow-trie-orset
  - PROTO_trie-compaction
blocks:
  - PROTO_joinreducer-state-session
  - PROTO_gc-state-session
---

# Async StateSession as the true domain-facing contract for trie-backed ORSet state

## Problem

The trie-backed ORSet has async I/O under the hood (page loads, flushes).
Today the synchronous in-memory side is just concrete `ORSet`, while the
trie-backed side must cross an explicit async boundary. The domain needs
one truthful contract for trie-backed state access rather than pretending
the async engine fits behind a synchronous parent type.

## Fix

Implement `StateSession` as the domain-facing contract:

- `open(state: WarpState): Promise<SessionHandle>` — initialize trie
  cursors for nodeAlive and edgeAlive, create and own the session
  `PageCache`, and prime bounded residency
- `close(): Promise<void>` — flush dirty pages, release resources
- Async state access methods on the session handle:
  - `nodeContains(id): Promise<boolean>`
  - `edgeContains(key): Promise<boolean>`
  - `addNode(id, dot): Promise<void>`
  - `removeNodes(dots): Promise<void>`
  - `scanNodes(): AsyncIterable<string>`
  - (and edge equivalents)
- Session methods are async. Domain code must await them.
- `StateSession` owns cache lifetime and capacity choice. `TrieCursor`
  receives a cache by constructor injection; it does not allocate one
  implicitly.
- `StateSession` constructs the internal `TrieCursor` instances.
  Broader code should not compose raw cursors directly.

## Role in the seam architecture

- Concrete `ORSet` is the **in-memory form** — synchronous and used
  where state genuinely stays in memory, such as current runtime paths,
  tests, and migration-tool internals. It is NOT a production runtime
  fallback path for old checkpoints or old ORSet-backed graphs.
- `StateSession` is the **domain-facing contract** for trie-backed
  state. It wraps `ShadowTrieORSet` internally. Domain code (reducer,
  GC, Ops) goes through the session when operating on trie-backed
  state.
- `StateSession` is also the **lifetime owner** for trie
  implementation details: one session-scoped `PageCache`, plus the
  internal node/edge `TrieCursor` instances that share it.
- `ShadowTrieORSet` is an internal engine. It is NOT exposed to domain
  code directly. The session is the only thing that talks to it.
- `TrieCursor` and `PageCache` are implementation details below the
  session seam. Do **not** introduce a public `TrieCursorPort`; that
  would freeze an implementation-shaped abstraction instead of the
  behavioral state-access seam.

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
- Cache sharing is explicit: the session creates one `PageCache` and
  passes that same instance to both `nodeAlive` and `edgeAlive`
  cursors. Shared residency is an owner decision, not ambient magic.
- Legacy substrate readers belong in `scripts/migrations/v17.0.0/`,
  not behind hidden branches inside `StateSession`.
