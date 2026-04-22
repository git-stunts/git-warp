---
title: "JoinReducer operates through StateSession"
cycle: "0041-joinreducer-state-session"
---

# JoinReducer Through StateSession

## Why this exists

Cycle `0040` made `StateSession` real as the async firewall for trie-backed
alive-set state. The next missing seam is reducer execution.

Today `JoinReducer.ts` still assumes one synchronous `WarpState` bag:

- ops call `canonOp.mutate(state, eventId)`
- node and edge mutation happens through in-memory `ORSet`
- receipts and diffs also inspect those in-memory `ORSet`s directly

That is not truthful for the trie-backed line. But the obvious fix is also
wrong: we should not make `reduceV5()` silently become an async wrapper around
the old synchronous `WarpState` surface. That would blur the current substrate
and make `PROTO_materialize-integration` harder instead of clearer.

This cycle exists to give the reducer a truthful async home without pretending
that the current `WarpState` API has already disappeared.

## Hill

A contributor can now answer:

- how reducer replay works against trie-backed alive sets without smuggling
  synchronous `WarpState` back in as the real substrate
- which parts of reducer state live inside `StateSession`
- which parts still remain synchronous metadata for now
- what async reducer surface later materialization work should call
- why the legacy synchronous reducer path is still present after this cycle

## Design goals

1. Make patch replay operate through `StateSession` for trie-backed
   `nodeAlive` / `edgeAlive`.
2. Keep the current synchronous `reduceV5()` path intact for the current
   in-memory substrate until `PROTO_materialize-integration`.
3. Introduce one truthful reducer-owned runtime shape for the mixed state:
   trie-backed alive sets plus synchronous metadata.
4. Keep receipts and diffs honest on the session-backed path.
5. Leave `PatchController` / `MaterializeController` rewiring to later cycles.

## Non-goals

- No `MaterializeController` wiring in this cycle.
- No `PatchController` runtime rewiring in this cycle.
- No attempt to make `WarpGraph.join()` async yet.
- No fake `ORSetLike` resurrection.
- No snapshot/checkpoint changes in this cycle.

## Core diagnosis

The current reducer does not only touch `nodeAlive` and `edgeAlive`. It also
mutates:

- `prop`
- `observedFrontier`
- `edgeBirthEvent`

Those fields still live on synchronous `WarpState`, while `StateSession`
currently owns only the trie-backed alive sets.

So the truthful async seam is **not**:

```ts
reduceV5(patches): Promise<WarpState>
```

and it is also **not**:

```ts
StateSession.open(WarpState)
```

The truthful seam is a mixed reducer frame:

- alive-set mutation goes through `StateSession`
- metadata mutation stays in an explicit synchronous companion object for now

## Design

### 1. Keep the legacy reducer path as legacy

`JoinReducer.ts` currently exports the synchronous compatibility path:

- `applyFast(state, patch, sha)`
- `applyWithDiff(state, patch, sha)`
- `applyWithReceipt(state, patch, sha)`
- `reduceV5(patches, initialState?, options?)`

Those functions should stay valid for the current in-memory `WarpState`
substrate until `PROTO_materialize-integration` moves runtime materialization
onto the trie-backed line.

This cycle should **add** the truthful async path, not mutate the old path
into a substrate lie.

### 2. Introduce a reducer frame over `StateSession`

The session-backed reducer needs an explicit runtime carrier for the fields
that do not live inside `StateSession` yet.

Preferred first-cut shape:

```ts
class ReducerSessionFrame {
  readonly session: StateSession;
  readonly prop: Map<string, LWWRegister<PropValue>>;
  readonly observedFrontier: VersionVector;
  readonly edgeBirthEvent: Map<string, EventId>;
}
```

This is not a replacement for `WarpState`. It is the truthful runtime shape
for async replay during the transition:

- `session` owns trie-backed alive sets
- `prop` remains synchronous
- `observedFrontier` remains synchronous
- `edgeBirthEvent` remains synchronous

### 3. Add session-native reducer entry points

This cycle should introduce async reducer surfaces alongside the legacy sync
ones. Preferred names:

```ts
async function applyFastInSession(
  frame: ReducerSessionFrame,
  patch: PatchLike,
  patchSha: string,
): Promise<void>;

async function applyWithDiffInSession(
  frame: ReducerSessionFrame,
  patch: PatchLike,
  patchSha: string,
): Promise<PatchDiff>;

async function applyWithReceiptInSession(
  frame: ReducerSessionFrame,
  patch: PatchLike,
  patchSha: string,
): Promise<TickReceipt>;

async function reduceV5InSession(
  patches: ReadonlyArray<{ readonly patch: PatchLike; readonly sha: string }>,
  frame?: ReducerSessionFrame,
  options?: { readonly receipts?: boolean; readonly trackDiff?: boolean },
): Promise<ReducerSessionFrame | { frame: ReducerSessionFrame; receipts: TickReceipt[] } | { frame: ReducerSessionFrame; diff: PatchDiff }>;
```

The important law is:

- session-backed replay has its own async surface
- legacy `reduceV5()` remains sync until later integration

### 4. Do not route session replay through `Op.mutate(state)`

Current `Op` classes are sync and `WarpState`-shaped. They expect direct access
to:

- `state.nodeAlive`
- `state.edgeAlive`
- `state.prop`
- `state.edgeBirthEvent`

That is truthful for the legacy reducer path, but wrong for session replay.

So the async reducer path should not try to fake a full `WarpState` just so
existing `Op.mutate()` methods keep compiling.

Instead, this cycle should introduce a session-aware executor that dispatches on
the concrete op class and performs the truthful mixed-state mutation:

- node/edge ops -> `StateSession`
- property ops -> frame metadata
- frontier fold -> frame metadata
- edge birth event updates -> frame metadata

This is more explicit, but it avoids lying about the substrate.

### 5. Widen `StateSession` only where reducer truth requires it

The current session surface is enough for simple membership and mutation, but
receipt/diff logic also needs access to alive information around observed dots.

This cycle may add narrowly scoped session methods such as:

- read alive status for one node / edge
- derive alive elements for an observed-dot tombstone set
- iterate live ids for join / merge support

What it should **not** do:

- expose raw `TrieCursor`
- reintroduce a public `orset(kind)` escape hatch
- make broader code compose trie internals directly

### 6. Join path stays session-native, not controller-native

The backlog note is right that state-to-state join is part of the reducer
problem, but this cycle should keep the handoff honest.

This cycle should define the session-backed join primitive:

- join trie-backed alive sets through session-aware logic
- merge `prop`, `observedFrontier`, and `edgeBirthEvent` in the companion
  metadata frame

This cycle should **not** yet rewire `PatchController.join(otherState)` if that
controller is still operating on the old synchronous `_cachedState` substrate.

That controller handoff belongs with `PROTO_materialize-integration`.

## Playback questions

### Agent

- Can I explain why making `reduceV5()` secretly async would be the wrong seam?
- Can I point to the truthful mixed reducer frame for session-backed replay?
- Can I explain why current `Op.mutate(state)` cannot simply be reused on the
  session-backed path?

### Human

- Does this feel like a real transition step instead of a substrate lie?
- Is it clear which fields live in `StateSession` and which still live beside
  it for now?
- Does the boundary with later materialization wiring stay explicit?

## Test plan

### Golden path

- `reduceV5InSession()` replays patches through one `StateSession` and returns
  updated metadata plus flushed trie roots on close
- receipt mode on the session-backed path matches the legacy sync reducer for
  equivalent patches
- diff mode on the session-backed path matches the legacy sync reducer for
  equivalent patches
- session-backed replay mutates node and edge alive state without constructing a
  fake in-memory `WarpState`

### Edge cases

- mixed patches containing node, edge, and property ops replay correctly through
  the frame/session split
- empty patch list leaves the frame/session unchanged
- tombstone ops with observed dots compute removals correctly through the
  session-backed path
- join path merges alive sets and metadata without crossing node/edge roots

### Known failure modes

- reducer opens hidden per-op sessions instead of one lifecycle-owned session
- session-backed replay secretly constructs a full `WarpState` and routes ops
  through `Op.mutate(state)`
- session-backed receipts or diffs disagree with the legacy sync reducer on the
  same patch sequence
- join path still mutates raw `ORSet`s directly
- controller code is silently rewired in this cycle instead of waiting for
  materialization integration

## Red targets

Likely first red surfaces:

- `test/unit/domain/services/JoinReducer.stateSession.test.ts`
- existing JoinReducer equivalence suites, extended to compare sync and
  session-backed replay
- state-session trie helpers and in-memory trie doubles from cycle `0040`

## Playback

### Witness

- session-backed reducer module:
  - `src/domain/services/JoinReducerSession.ts`
- session seam widened for truthful join support:
  - `src/domain/orset/session/StateSession.ts`
  - `src/domain/orset/ORSetElementState.ts`
- witness tests:
  - `test/unit/domain/services/JoinReducer.stateSession.test.ts`
  - `test/unit/domain/orset/session/StateSession.test.ts`
  - `test/unit/domain/services/JoinReducer.pathEquivalence.test.ts`
  - `test/unit/domain/services/JoinReducer.trackDiff.test.ts`
  - `test/unit/domain/orset/shadow/ShadowTrieORSet.test.ts`
  - `test/unit/domain/orset/shadow/ShadowTrieORSet.compaction.test.ts`
  - `test/unit/domain/orset/trie/TrieCursor.test.ts`
  - `test/unit/domain/orset/trie/TrieFlusher.test.ts`
  - `test/unit/domain/orset/trie/PageCache.test.ts`
- commands:
  - `npm exec vitest run test/unit/domain/services/JoinReducer.stateSession.test.ts test/unit/domain/orset/session/StateSession.test.ts test/unit/domain/services/JoinReducer.pathEquivalence.test.ts test/unit/domain/services/JoinReducer.trackDiff.test.ts test/unit/domain/orset/shadow/ShadowTrieORSet.test.ts test/unit/domain/orset/shadow/ShadowTrieORSet.compaction.test.ts test/unit/domain/orset/trie/TrieCursor.test.ts test/unit/domain/orset/trie/TrieFlusher.test.ts test/unit/domain/orset/trie/PageCache.test.ts`
  - `npm run typecheck`
  - `git diff --check`

### Agent

- Can I explain why making `reduceV5()` secretly async would be the wrong seam?
  - Yes. The shipped shape keeps legacy `reduceV5()` synchronous and adds
    `reduceV5InSession()` as the truthful async path.
- Can I point to the truthful mixed reducer frame for session-backed replay?
  - Yes. `ReducerSessionFrame` carries `StateSession` plus `prop`,
    `observedFrontier`, and `edgeBirthEvent`.
- Can I explain why current `Op.mutate(state)` cannot simply be reused on the
  session-backed path?
  - Yes. The session-backed path dispatches directly on canonical op classes and
    mutates the mixed frame instead of fabricating a fake full `WarpState`.

### Human

- Does this feel like a real transition step instead of a substrate lie?
  - Yes. The async path is separate, explicit, and does not smuggle sync
    `WarpState` back in as the real owner.
- Is it clear which fields live in `StateSession` and which still live beside
  it for now?
  - Yes. Alive sets live in `StateSession`; `prop`, `observedFrontier`, and
    `edgeBirthEvent` remain companion metadata in the frame.
- Does the boundary with later materialization wiring stay explicit?
  - Yes. Controller rewiring is still deferred to
    `PROTO_materialize-integration`.

### Verdict

Hill met.

## Drift check

### What drifted

- The initial design language said session widening might stop at live-id
  iteration for join support.
- In practice, that was not truthful enough: join needs tombstoned dots as well
  as live dots to preserve OR-Set semilattice behavior.

### Landed drift

- Added `ORSetElementState` as a runtime-backed carrier for one element's live
  and tombstoned dots.
- Added `nodeElementState()` / `edgeElementState()` and
  `scanNodeElementStates()` / `scanEdgeElementStates()` on `StateSession`.
- Updated `joinFrames()` to merge full element state instead of replaying only
  live ids.

### Verdict

Acceptable positive drift only.
