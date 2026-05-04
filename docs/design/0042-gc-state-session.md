---
title: "GC operates through StateSession"
cycle: "0042-gc-state-session"
---

# GC Through StateSession

## Why this exists

Cycle `0040` made `StateSession` the async firewall for trie-backed alive-set
state. Cycle `0041` then gave reducer replay a truthful session-backed path.

GC is the next seam still pretending the old synchronous substrate is the only
real one:

- `executeGC.ts` compacts `state.nodeAlive` and `state.edgeAlive` synchronously
- `GCMetrics.fromState()` counts through synchronous `ORSet` methods
- the trie-backed line already owns truthful compaction through `StateSession`

This cycle exists to give GC the same kind of honest transition seam:

- keep the legacy sync path intact for current in-memory callers
- add a session-native async path for trie-backed state
- do not pretend controller/session lifecycle wiring has already happened

## Hill

A contributor can now answer:

- how GC compaction works against trie-backed alive sets without smuggling
  synchronous `WarpState` back in as the real substrate
- how GC metrics are collected from `StateSession` without inventing fake array
  materialization or widening the session API more than needed
- what async GC surface later materialization work should call
- why the legacy synchronous `executeGC()` path is still present after this
  cycle

## Design goals

1. Add a truthful async GC path over `StateSession`.
2. Keep legacy synchronous `executeGC(state, appliedVV)` intact until
   `PROTO_materialize-integration`.
3. Make `GCMetrics` collect equivalent counts from trie-backed state through
   session scans.
4. Preserve `GCExecuteResult` as the returned summary type.
5. Keep controller/session open-close wiring explicit and deferred.

## Non-goals

- No `MaterializeController` wiring in this cycle.
- No checkpoint/snapshot/controller lifecycle rewiring in this cycle.
- No attempt to delete the legacy synchronous GC path yet.
- No new broad `StateSession` escape hatch for raw trie internals.

## Core diagnosis

The current GC seam is still fully `WarpState`-shaped:

- metrics read `countEntries()` / `countTombstones()` / `countLiveDots()`
- compaction mutates in-memory `ORSet`
- callers are expected to own rollback copies of the full sync state

That is truthful for the current in-memory line. It is not truthful for the
trie-backed line, where alive-set state lives behind:

- `StateSession`
- `ShadowTrieORSet`
- `TrieCursor`
- `TrieFlusher`
- `PageCache`

So the honest async seam is **not**:

```ts
async function executeGC(state: WarpState, appliedVV: VersionVector): Promise<GCExecuteResult>
```

and it is also **not**:

```ts
StateSession.openFromWarpState(state)
```

The honest seam is:

- keep `executeGC()` as the sync compatibility path
- add `executeGCInSession(session, appliedVV)` as the async trie-backed path
- keep session open/close ownership with later integration work

## Design

### 1. Keep the legacy sync path as legacy

`executeGC(state, appliedVV)` remains valid and synchronous for the current
in-memory `WarpState` substrate.

This cycle should **add** the session-native path, not silently mutate the old
surface into an async wrapper over the wrong substrate.

### 2. Add session-native metrics without broadening the session contract

`StateSession` already exposes enough truthful surface to derive GC metrics:

- `scanNodeElementStates()`
- `scanEdgeElementStates()`

Those scans surface:

- element id
- live dots
- tombstoned dots that still correspond to entry dots

That is enough to reproduce the current `ORSet` metric laws exactly:

- `entries = live dots + tombstoned entry dots`
- `live dots = non-tombstoned entry dots`
- `tombstones = tombstoned entry dots`

So the preferred seam is:

```text
static async fromSession(session: StateSession): Promise<GCMetrics>
```

This keeps the counting behavior owned by `GCMetrics` instead of bloating
`StateSession` with narrow report-only methods.

### 3. Add `executeGCInSession(...)`

Preferred shape:

```ts
async function executeGCInSession(
  session: StateSession,
  appliedVV: VersionVector,
): Promise<GCExecuteResult>
```

Laws:

- validate `appliedVV` exactly as the sync path does
- collect before-metrics through `GCMetrics.fromSession(session)`
- compact through the session-owned alive-set path
- collect after-metrics through `GCMetrics.fromSession(session)`
- return the same `GCExecuteResult` shape as the sync path

### 4. Session lifecycle remains explicit

The backlog note talks about opening and closing a session around GC. That is
directionally correct, but this cycle should keep the seam honest.

This cycle should **not** yet hide:

- session construction
- root ownership
- page-cache ownership
- flush-on-close behavior

behind a fake convenience wrapper with controller-shaped assumptions.

The truthful transition is:

- this cycle adds the session-native GC primitive
- later integration work decides where the session is opened, reused, and
  closed

### 5. Preserve failure semantics without pretending the session is sync

The sync path throws:

- `E_GC_INVALID_VV` for invalid version vectors
- `E_GC_COMPACT_FAILED` when compaction fails

The session-native path should preserve those codes. It does not need to fake
full `WarpState` rollback semantics; it only needs to preserve the GC contract
for validation and compaction failure reporting.

## Playback questions

### Agent

- Can I explain why `executeGC()` should not quietly become async over
  `WarpState`?
- Can I point to the truthful session-native GC surface later materialization
  work should call?
- Can I explain why `GCMetrics.fromSession()` can match the current count laws
  without adding report-specific counting methods to `StateSession`?

### Human

- Does this feel like a real transition seam rather than async paint over the
  old sync substrate?
- Is it clear why session open/close wiring is still deferred?
- Is it clear how trie-backed metrics remain honest without full graph
  materialization?

## Test plan

### Golden path

- `GCMetrics.fromSession()` returns the same counts a matching in-memory ORSet
  state would produce
- `executeGCInSession()` removes compactable tombstoned node dots and reports
  accurate node compaction counts
- `executeGCInSession()` removes compactable tombstoned edge dots and reports
  accurate edge compaction counts
- `executeGCInSession()` preserves live dots even when the included version
  vector dominates them

### Edge cases

- compaction over a mixed node/edge session updates both engines in one call
- empty session returns zero metrics and zero compaction
- session-backed metrics ignore floating tombstones because the session element
  scans only report tombstones attached to entries
- close/reopen after session GC preserves the compacted trie roots

### Known failure modes

- invalid `appliedVV` still fails with `E_GC_INVALID_VV`
- calling the session-native GC path on a closed session fails loudly
- session compaction failures surface as `E_GC_COMPACT_FAILED`

## Playback

### Witness

The session-native GC seam is backed by:

- [GCSession.test.ts](/Users/james/git/git-stunts/git-warp/test/unit/domain/services/GCSession.test.ts)
- [GCPolicy.test.ts](/Users/james/git/git-stunts/git-warp/test/unit/domain/services/GCPolicy.test.ts)
- [StateSession.test.ts](/Users/james/git/git-stunts/git-warp/test/unit/domain/orset/session/StateSession.test.ts)
- `npm exec vitest run test/unit/domain/services/GCSession.test.ts test/unit/domain/services/GCPolicy.test.ts test/unit/domain/orset/session/StateSession.test.ts`
- `npm run typecheck`
- `git diff --check`

### Agent

1. *Can I explain why `executeGC()` should not quietly become async over
   `WarpState`?*
   Yes. The old sync seam is still truthful for in-memory callers, but it is
   the wrong owner for trie-backed compaction and metrics. `executeGCInSession`
   gives later materialization work a real async entry point without faking a
   sync `WarpState` wrapper.

2. *Can I point to the truthful session-native GC surface later materialization
   work should call?*
   Yes. The new surface is
   [executeGCInSession.ts](/Users/james/git/git-stunts/git-warp/src/domain/services/executeGCInSession.ts),
   backed by
   [GCMetrics.fromSession()](/Users/james/git/git-stunts/git-warp/src/domain/services/GCMetrics.ts).

3. *Can I explain why `GCMetrics.fromSession()` can match the current count
   laws without adding report-specific counting methods to `StateSession`?*
   Yes. `StateSession` already exposes truthful element-state scans. Those
   scans contain the exact live/tombstoned entry-dot sets needed to reconstruct
   `countEntries()`, `countLiveDots()`, and `countTombstones()` without widening
   the session API.

### Human

1. *Does this feel like a real transition seam rather than async paint over the
   old sync substrate?*
   Yes. The old sync API is still present, but the trie-backed line now has its
   own explicit async GC surface.

2. *Is it clear why session open/close wiring is still deferred?*
   Yes. This cycle adds the GC primitive over an already-open session; later
   materialization work remains responsible for root ownership and session
   lifecycle.

3. *Is it clear how trie-backed metrics remain honest without full graph
   materialization?*
   Yes. Metrics are derived from session element-state scans, not from a fake
   all-at-once graph rebuild.

Verdict: pass.

## Drift check

No negative drift.

Positive drift only:

- the implementation stayed narrower than the backlog note's phrasing by
  adding the session-native GC primitive, not a fake open/compact/close helper
  with controller assumptions baked in
- metrics reuse the existing element-state scan surface instead of adding
  special-purpose counting methods to `StateSession`

That drift sharpens the seam instead of smearing it.
