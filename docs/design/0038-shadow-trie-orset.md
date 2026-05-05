---
title: "ShadowTrieORSet"
cycle: "0038-shadow-trie-orset"
---

# ShadowTrieORSet

## Why this exists

`v17` already landed the storage primitives for trie-backed ORSet state:

- route keys
- trie geometry and page codecs
- `TrieCursor`
- `TrieFlusher`
- count-bounded `PageCache`

What is still missing is the honest async engine that turns those pieces into a
storage-backed ORSet implementation.

The current concrete `ORSet` in [src/domain/crdt/ORSet.ts](../../src/domain/crdt/ORSet.ts)
is still the in-memory form:

- synchronous
- V8-heap resident
- `Map<string, Set<string>>` backed

That is fine for the in-memory substrate. It is not honest for out-of-core
state.

This cycle exists to define the first truthful async engine:
`ShadowTrieORSet`.

## Relation to earlier work

- cycle `0018` established the shadow-trie direction at a broad level
- cycles `0022` through `0031` landed the route/trie/cache building blocks
- cycle `0032` clarified that there is no truthful `ORSetLike` parent seam
- `PROTO_state-session-async` already says the domain-facing seam is
  `StateSession`, not the engine itself

This cycle is the missing middle layer between those truths.

## Hill

A contributor can now answer, from one design doc:

- what `ShadowTrieORSet` is
- what async surface it owns
- what it delegates to internally
- how it differs from the synchronous in-memory `ORSet`
- how it hands lifecycle back to `StateSession`

## Design goals

1. Define `ShadowTrieORSet` as a truthful async engine rather than a fake sync
   subtype.
2. Keep implementation ownership honest:
   - `StateSession` owns cache lifetime and cursor construction
   - `ShadowTrieORSet` consumes those internals
3. Give the engine a small, explicit async API for node/edge ORSet behavior.
4. Define the minimum owner-facing persistence hook needed for later session
   integration.
5. Keep this cycle bounded: no compaction, no semilattice proof work, no
   domain-wide session orchestration.

## Non-goals

- No `StateSession` lifecycle in this cycle.
- No `compact(includedVV)` implementation in this cycle.
- No attempt to make the engine a drop-in replacement for the synchronous
  `ORSet`.
- No public `TrieCursorPort` or `PageCachePort`.
- No generic “works for every future CRDT” abstraction.

## Core diagnosis

The missing design law is simple:

- the in-memory ORSet is synchronous because its state is synchronous
- the trie-backed ORSet must be async because its state lives behind async I/O

Trying to hide that with a fake shared parent type would make the runtime lie
about cost and execution.

So the correct split is:

- `ORSet` = concrete in-memory form
- `ShadowTrieORSet` = concrete async storage-backed engine
- `StateSession` = domain-facing owner and lifetime boundary for trie-backed
  state

## Design

### 1. The engine is internal, but truthful

`ShadowTrieORSet` is not a public domain contract. It is an internal engine
that `StateSession` will wrap later.

That still does **not** justify vague shape or adapter theater. The engine
should be a real runtime object with a precise surface and explicit ownership.

### 2. Constructor ownership

The engine should be constructed with the already-owned trie machinery it needs.

The honest initializer is:

```text
class ShadowTrieORSet {
  constructor(init: {
    cursor: TrieCursor;
    flusher: TrieFlusher;
  }) { ... }
}
```

Important consequences:

- `StateSession` creates the session-scoped `PageCache`
- `StateSession` creates the `TrieCursor`
- `ShadowTrieORSet` does **not** allocate a hidden cache
- `ShadowTrieORSet` does **not** publish raw cursor or cache seams upward

The flusher belongs here because the engine needs one owner-facing persistence
hook for session close.

### 3. Async behavior surface

The engine should expose the smallest truthful async surface needed by the
current ORSet use-cases:

```ts
class ShadowTrieORSet {
  contains(element: string): Promise<boolean>;
  getDots(element: string): Promise<ReadonlySet<string>>;
  add(element: string, dot: Dot): Promise<void>;
  remove(observedDots: ReadonlySet<string>): Promise<void>;
  scan(): AsyncIterable<string>;
  flush(): Promise<FlushResult>;
}
```

Notes:

- `scan()` is the out-of-core replacement for synchronous `elements()`
- `scan()` yields element ids directly; first cut does not invent a richer
  `VisibleElement` object
- `flush()` is an owner hook for `StateSession.close()`, not a public
  consumer-facing feature

### 4. Flush semantics

The first cut should assume `flush()` is called at lifecycle boundaries.

That means:

- engine operations mutate cursor working state
- `flush()` snapshots dirty pages through the cursor and persists them through
  `TrieFlusher`
- after `flush()`, the intended owner behavior is to close/discard the engine
  instance

Do **not** complicate this cycle by promising a fully reusable post-flush engine
instance unless code truth requires it.

Bounded first-cut law:

- one engine instance
- many reads/writes
- optional one-way `flush()` at close

### 5. What the engine delegates to

`ShadowTrieORSet` should be thin and honest:

- `contains()` -> `TrieCursor.contains()`
- `getDots()` -> `TrieCursor.getDots()`
- `add()` -> `TrieCursor.add()`
- `remove()` -> `TrieCursor.remove()`
- `scan()` -> cursor-backed traversal, yielding asynchronously
- `flush()` -> `TrieFlusher.flush(cursor.snapshot())`

This is not “too thin to exist.” It is exactly the point where:

- async ORSet behavior becomes one runtime object
- cursor/flusher details stay below the session seam
- later `StateSession` work has a single engine to own

### 6. Scan shape

`scan()` must be an `AsyncIterable<string>`, not `Promise<string[]>`.

Even if the first implementation internally visits leaves and buffers one leaf
at a time, the outward contract should stay stream-shaped. This is one of the
main reasons the engine exists at all.

### 7. Error law

The engine should preserve the existing typed-error behavior from its
dependencies.

That means:

- input validation errors remain typed runtime errors
- store faults remain typed store/cursor/flush faults
- `ShadowTrieORSet` should only introduce its own error type if it actually adds
  new invariants beyond composition

First cut preference: do **not** invent a `ShadowTrieORSetError` unless the
engine adds behavior that cannot honestly be attributed to `TrieCursor` or
`TrieFlusher`.

### 8. What this cycle deliberately leaves for later

`PROTO_trie-compaction` stays separate:

- `compact(includedVV)` is not part of this cycle
- leaf merge / branch collapse policy is not part of this cycle

`PROTO_state-session-async` stays separate:

- lifecycle ownership
- nodeAlive / edgeAlive pairing
- session-scoped cache sharing
- open/close orchestration

`TRUST_shadow-trie-semilattice-pbt` stays separate:

- this cycle should make the engine exist
- later trust work should prove the semilattice behavior

## Playback questions

### Agent

- Can I explain why `ShadowTrieORSet` is not a subtype of the synchronous
  `ORSet`?
- Can I point to exactly one owner for cache lifetime and cursor construction?
- Can I explain why `scan()` must be async even if small tests buffer all
  results?

### Human

- Does this feel like a truthful async engine instead of a fake compatibility
  wrapper?
- Is the `StateSession` handoff clear enough that the next cycle knows what it
  owns?
- Does the design keep trie implementation details below the right seam?

## Test plan

This cycle will need unit-heavy red coverage plus one narrow flush/reopen
integration path.

### Golden path

- create an empty engine and observe:
  - `contains()` is false
  - `getDots()` is empty
  - `scan()` yields nothing
- add one element/dot:
  - `contains()` becomes true
  - `getDots()` returns the encoded dot
  - `scan()` yields the element
- add multiple elements and scan all of them through the async iterator
- remove observed dots and confirm tombstoned entries disappear from `contains`
  and `scan()`
- `flush()` persists the current dirty snapshot and a fresh cursor reopened at
  the returned root sees the same visible set

### Edge cases

- adding the same `(element, dot)` twice is idempotent
- adding multiple dots for one element preserves add-wins visibility
- `remove(new Set())` is a no-op
- removing dots the engine has never seen does not break the visible set
- tiny-geometry split cases still round-trip through `scan()` and `contains()`
- `scan()` remains async-shaped even when the result set is tiny

### Known failure modes

- empty element id or malformed dot still raises the typed cursor input error
- store read faults still surface through the engine without being flattened
- `flush()` on a clean engine returns a clean `FlushResult`
- the engine does **not** expose synchronous `elements()` or pretend to satisfy
  the synchronous `ORSet` surface
- no hidden cache allocation path exists inside the engine constructor

## Red targets

The red suite should probably land in a new focused unit file:

- `test/unit/domain/orset/shadow/ShadowTrieORSet.test.ts`

Likely helpers:

- `InMemoryTrieStore`
- `TrieCursor`
- `TrieFlusher`
- `PageCache`
- existing trie geometry helpers for tiny-capacity split cases

One narrow integration assertion should prove:

- engine writes through `flush()`
- a reopened cursor rooted at the flushed OID sees the same visible elements

That is enough for this cycle. Session lifecycle and later controller wiring can
build on top of that.

## Playback

### Witness

The witness for this cycle is:

- [ShadowTrieORSet.ts](../../src/domain/orset/shadow/ShadowTrieORSet.ts)
- [ShadowTrieORSetError.ts](../../src/domain/errors/ShadowTrieORSetError.ts)
- [ShadowTrieORSet.test.ts](../../test/unit/domain/orset/shadow/ShadowTrieORSet.test.ts)
- the cursor scan follow-through in
  [TrieCursor.ts](../../src/domain/orset/trie/TrieCursor.ts)

Verification:

```sh
npm exec vitest run \
  test/unit/domain/orset/shadow/ShadowTrieORSet.test.ts \
  test/unit/domain/orset/trie/TrieCursor.test.ts \
  test/unit/domain/orset/trie/TrieFlusher.test.ts \
  test/unit/domain/orset/trie/PageCache.test.ts

npm run typecheck
```

### Agent playback

Question:

> Can I explain why `ShadowTrieORSet` is not a subtype of the synchronous
> `ORSet`?

Answer:

Yes.

Question:

> Can I point to exactly one owner for cache lifetime and cursor construction?

Answer:

Yes. `StateSession` remains that owner; `ShadowTrieORSet` only consumes the
already-built cursor/flusher pair.

Question:

> Can I explain why `scan()` is async-shaped and backed by a real async cursor
> walk?

Answer:

Yes.

Verdict: pass.

### Human playback

Question:

> Does this feel like a truthful async engine instead of a fake compatibility
> wrapper?

Answer:

Yes.

Question:

> Is the `StateSession` handoff clear enough that the next cycle knows what it
> owns?

Answer:

Yes.

Question:

> Does the design keep trie implementation details below the right seam?

Answer:

Yes.

Verdict: pass.

## Drift check

No negative drift.

One additive drift did occur:

- the design said “avoid a dedicated `ShadowTrieORSetError` unless the engine
  truly owns new invariants”
- the implementation did introduce
  [ShadowTrieORSetError.ts](../../src/domain/errors/ShadowTrieORSetError.ts)
  because constructor validation is in fact an engine-owned invariant

That drift is acceptable and clarifies ownership instead of smearing it.
