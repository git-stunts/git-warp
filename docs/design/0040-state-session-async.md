---
title: "StateSession async firewall"
cycle: "0040-state-session-async"
---

# StateSession Async Firewall

## Why this exists

Cycles `0038` and `0039` made the trie-backed ORSet line real:

- `ShadowTrieORSet` is the truthful async engine
- `TrieCompactor` makes bounded-residency GC honest

What is still missing is the domain-facing owner for those internals.

Right now broader code still thinks in terms of synchronous `WarpState`
instances holding in-memory `ORSet`s. That is fine for the current substrate,
but it is the wrong seam for trie-backed state:

- cache lifetime has no owner
- nodeAlive / edgeAlive pairing has no owner
- open / close orchestration has no owner
- async cost still has no truthful domain-facing boundary

This cycle exists to make that owner explicit: `StateSession`.

## Hill

A contributor can now answer:

- what `StateSession` is and why it is the async firewall
- what runtime object owns page-cache lifetime and trie-engine construction
- what async read/write/compact surface the session exposes
- what inputs are truthful for opening a trie-backed session
- how to test session ownership without prematurely wiring JoinReducer or GC

## Design goals

1. Make `StateSession` the domain-facing contract for trie-backed state.
2. Keep `ShadowTrieORSet` internal; broader code should talk to the session.
3. Make one session own one shared `PageCache` for nodeAlive and edgeAlive.
4. Keep open/close lifecycle explicit and async.
5. Avoid smuggling the old synchronous `WarpState` substrate shape into the
   trie-backed seam.

## Non-goals

- No JoinReducer integration in this cycle.
- No GC orchestration in this cycle.
- No MaterializeController integration in this cycle.
- No attempt to make synchronous `WarpState` itself async-aware.
- No fake `SessionHandle` split if `StateSession` itself can be the runtime
  object honestly.

## Core diagnosis

The old backlog wording said:

```ts
open(state: WarpState): Promise<SessionHandle>
```

That is not the truthful input for trie-backed state.

A synchronous `WarpState` contains concrete in-memory `ORSet`s. Opening a
trie-backed session from that object would either:

- force a full in-memory preload first, or
- create a fake hybrid type that means two different things

The truthful open input is the trie-backed state boundary itself:

- nodeAlive root OID
- edgeAlive root OID
- trie store
- codec
- geometry
- cache policy

So this cycle should correct the seam:

- in-memory `WarpState` stays the current sync substrate
- `StateSession` opens from trie roots and infrastructure dependencies
- later controller integration decides when to use which substrate

## Design

### 1. `StateSession` is the runtime object

First cut preference:

```ts
class StateSession {
  static async open(init: StateSessionOpen): Promise<StateSession>;
  close(): Promise<StateSessionCloseResult>;
}
```

Do not split a second `SessionHandle` class unless the implementation discovers
two genuinely different runtime roles. For this cycle, one runtime object is
enough and clearer.

### 2. Truthful open input

`StateSession` should open from trie-backed state roots, not from `WarpState`:

```ts
class StateSession {
  static async open(init: {
    nodeAliveRootOid: string | null;
    edgeAliveRootOid: string | null;
    store: TrieStorePort;
    codec: CodecPort;
    geometry: TrieGeometry;
    pageCache: PageCache;
  }): Promise<StateSession>;
}
```

This keeps the seam honest:

- session owns the trie-backed engines
- session does not pretend a sync `WarpState` is already trie-backed
- callers that only have sync state must stay on the sync path until a later
  integration cycle

### 3. Ownership

`StateSession` owns:

- one shared session-scoped `PageCache`
- one `TrieCursor` for nodeAlive
- one `TrieCursor` for edgeAlive
- one `TrieFlusher` for nodeAlive
- one `TrieFlusher` for edgeAlive
- two internal `ShadowTrieORSet` engines constructed from those parts

Broader code should not compose those pieces directly.

### 4. Surface area

The session should expose the smallest honest async surface needed by later
controller work:

```ts
class StateSession {
  nodeContains(id: string): Promise<boolean>;
  edgeContains(key: string): Promise<boolean>;

  addNode(id: string, dot: Dot): Promise<void>;
  addEdge(key: string, dot: Dot): Promise<void>;

  removeNodes(observedDots: ReadonlySet<string>): Promise<void>;
  removeEdges(observedDots: ReadonlySet<string>): Promise<void>;

  scanNodes(): AsyncIterable<string>;
  scanEdges(): AsyncIterable<string>;

  compact(includedVV: VersionVector): Promise<void>;
  close(): Promise<StateSessionCloseResult>;
}
```

Notes:

- `compact(includedVV)` belongs here now that engine compaction exists; later GC
  work should call the session, not the raw engines.
- node/edge methods stay explicit. Do not introduce a generic stringly
  `orset(kind)` escape hatch.

### 5. Close semantics

`close()` should:

1. flush `nodeAlive`
2. flush `edgeAlive`
3. return both resulting root OIDs in a typed close result
4. mark the session closed so later operations fail loudly

Suggested result shape:

```ts
class StateSessionCloseResult {
  readonly nodeAliveRootOid: string | null;
  readonly edgeAliveRootOid: string | null;
}
```

This keeps lifecycle explicit and prepares later integration cycles to swap
fresh roots back into snapshot/checkpoint/materialize flows.

### 6. Closed-session law

After `close()`:

- read methods reject
- write methods reject
- `compact()` rejects
- double-close rejects or returns a typed already-closed failure

First cut preference: reject with a typed session error so misuse is explicit.

### 7. Error law

`StateSession` should introduce its own error type only for session-owned
invariants:

- session already closed
- invalid open input
- close called after partial initialization bug

Store/cursor/flusher faults should still surface through the underlying typed
errors rather than being blurred into one generic session failure.

## Playback questions

### Agent

- Can I explain why opening from synchronous `WarpState` is the wrong seam for
  trie-backed state?
- Can I point to one owner for cache lifetime, cursor construction, and engine
  construction?
- Can I explain what `close()` returns and why that is enough for later
  integration cycles?

### Human

- Does this feel like a truthful async firewall rather than a sync wrapper with
  `Promise` paint?
- Is the ownership boundary between session and internal trie machinery clear?
- Does the design avoid premature integration into JoinReducer / GC /
  materialization while still making those next steps obvious?

## Test plan

### Golden path

- opening a session from empty roots creates working node/edge engines
- node and edge operations delegate through the session surface
- one shared `PageCache` instance is used for both nodeAlive and edgeAlive
- `close()` flushes both engines and returns both root OIDs
- a reopened session sees the persisted node/edge state

### Edge cases

- empty session close returns clean `null` roots
- nodeAlive and edgeAlive may evolve independently before one close
- `compact(includedVV)` compacts both engines through the session surface
- scan methods remain async iterables, not array-returning wrappers

### Known failure modes

- session allocates hidden per-engine caches instead of one shared cache
- session accepts sync `WarpState` and quietly reintroduces full preload
- close does not actually seal the session against later use
- node/edge close results get crossed or lost
- session starts owning reducer or GC policy concerns in this cycle

## Red targets

Likely first red surfaces:

- `test/unit/domain/orset/session/StateSession.test.ts`
- existing shadow-trie helpers and in-memory trie store doubles
