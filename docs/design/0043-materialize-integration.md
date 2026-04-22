---
title: "MaterializeController integrates StateSession"
cycle: "0043-materialize-integration"
---

# MaterializeController Through StateSession

## Why this exists

Cycles `0040` through `0042` built the async-firewall trunk:

- `StateSession` owns trie-backed alive-set state
- reducer replay has a session-backed path
- GC has a session-backed path

`MaterializeController` is now the next seam still teaching the old substrate as
if it were the only truthful one:

- `_fromCheckpoint()` still replays through in-memory `WarpState`
- `_fromScratch()` still replays through in-memory `WarpState`
- coordinate replay still reduces against sync state
- checkpoint materialization still uses the old checkpoint/state shape

This cycle exists to move materialization onto the session-backed line without
pretending the rest of runtime history has already disappeared.

## Hill

A contributor can now answer:

- how materialization replays patches through `StateSession`
- where session lifecycle opens, closes, and root publication happen
- how unified snapshots are published from the session-backed path
- what compatibility bridge still exists for callers that currently expect a
  `MaterializeResult`
- where legacy checkpoint/runtime fallback stops

## Design goals

1. Route patch replay in `MaterializeController` through `StateSession` plus
   session-backed reducer and GC seams.
2. Publish unified snapshot data from the session-backed path.
3. Fail fast on legacy checkpoint/state blobs in shipped runtime.
4. Keep the lifecycle ownership inside `MaterializeController`, not spread back
   across controllers.
5. Make any transitional compatibility bridge explicit rather than implicit.

## Non-goals

- No index-builder rewiring in this cycle.
- No performance tuning beyond keeping the seam truthful.
- No hidden fallback to legacy checkpoint blobs in shipped runtime.
- No attempt to finish the broader observer/runtime redesign in this cycle.

## Core diagnosis

The async-firewall pieces are now ready, but `MaterializeController` still
reduces through:

- `reduceV5(...)`
- `WarpState`
- legacy checkpoint load assumptions

That creates the current doctrinal lie:

- trie-backed state exists
- reducer replay exists
- GC exists
- but the main runtime materialization path still teaches “real state =
  synchronous `WarpState`”

The hardest remaining question is the compatibility surface. Current callers of
`MaterializeController` still expect a `MaterializeResult` whose `state` field
is sync-shaped. This cycle must either:

- make the bridge explicit and narrow, or
- change the result contract and fix the callers in the same slice

What it must **not** do is silently rebuild a fake full `WarpState` inside
`MaterializeController` and pretend the session-backed line never happened.

## Design

### 1. Session lifecycle belongs to MaterializeController

Preferred law:

- `_fromCheckpoint()` opens a `StateSession` from snapshot roots
- `_fromScratch()` opens a `StateSession` from empty roots
- coordinate replay reuses the same kind of session-native frame
- replay and GC operate through session-native helpers
- close returns the trie roots that snapshot publication uses

This cycle should make that ownership explicit inside `MaterializeController`.

### 2. Replay uses the session-backed reducer frame

Replay should move from:

```ts
reduceV5(...)
```

to the session-backed reducer seam from `0041`:

```ts
reduceV5InSession(...)
```

That means materialization now owns a mixed replay frame:

- session-backed alive sets
- synchronous metadata until later cycles move more state

### 3. GC uses the session-native seam

If materialization performs compaction during the supported path, it should call
the session-native GC seam from `0042`, not the old sync helper.

### 4. Snapshot publication uses trie roots, not legacy state blobs

The unified snapshot/checkpoint substrate should be fed from the session-backed
close result and associated metadata, not from a fake `state.cbor` rebuild.

This is also where shipped runtime should stop accepting legacy checkpoint blob
state and require offline migration instead.

### 5. Compatibility bridge must be explicit

The public materialize result still needs a truthful contract for current
callers.

This cycle should explicitly name one of these outcomes and implement it
consistently:

- `MaterializeResult` changes to a session/frame-oriented result and callers
  are updated in the same slice
- or `MaterializeController` returns a narrow compatibility projection that is
  clearly transitional and not mistaken for the owning substrate

The bridge must be deliberate, not accidental.

## Playback questions

### Agent

- Can I explain where session lifecycle now lives during materialization?
- Can I point to the exact compatibility bridge, if one still exists?
- Can I explain why legacy checkpoint blob fallback is no longer allowed in the
  shipped runtime path?

### Human

- Does the controller now feel like it owns a truthful session-backed
  materialization flow?
- Is it clear where the runtime still carries a transitional compatibility
  bridge?
- Is the boundary between shipped runtime and offline migration explicit?

## Test plan

### Golden path

- `_fromScratch()` replays through `StateSession` and returns the supported
  materialization result
- `_fromCheckpoint()` replays through session-backed roots and produces the same
  logical outcome as the old supported path
- coordinate materialization reuses the session-backed replay seam
- unified snapshot publication writes the session-backed result instead of a
  legacy blob-only path

### Edge cases

- empty graph still materializes honestly through the supported path
- receipts and diff tracking still behave correctly on the session-backed path
- exact snapshot reuse and compatible-predecessor reuse still work after the
  session-backed integration
- close/reopen round-trips do not lose alive-set truth

### Known failure modes

- runtime attempts to read legacy checkpoint blob state fail with an explicit
  upgrade-required error
- snapshot publication failures fail loudly instead of silently dropping back to
  old checkpoint formats
- session lifecycle misuse does not leak partially published runtime state
