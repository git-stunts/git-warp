---
title: "Begin capability migration at the public sync and factory seam"
cycle: "0059-capability-bag-public-sync"
---

# Begin Capability Migration At The Public Sync And Factory Seam

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

`API_migrate-consumers-to-capabilities` is still a real `v17` trunk, but the
remaining surface is not one giant flat migration anymore.

Repo truth says the first still-public lies are concentrated at the
composition root:

- `openWarpGraph()` still binds the runtime into 9 capability bags with
  `as unknown as`
- `WarpGraph` still exposes `_runtime` on the public interface and object
- sync still teaches direct peers in terms of `WarpRuntime`, even though the
  new public entrypoint is `openWarpGraph()`
- the API reference still shows `graphB._runtime` in direct-peer sync examples

That is the smallest honest first tranche. It lets the migration begin at the
public seam instead of smearing `WarpRuntime` cleanup across the whole repo in
one slice.

## Hill

A contributor can use `openWarpGraph()` as the public surface without learning
about `_runtime`, without relying on cast-cosplay at the factory boundary, and
without needing a `WarpRuntime`-typed peer to do direct sync.

## Playback questions

### Agent

- Does `openWarpGraph()` bind capability bags without `as unknown as`?
- Is `_runtime` gone from the public `WarpGraph` type and value?
- Can direct sync accept a public capability bag peer instead of a
  `WarpRuntime`-typed object?

### Human

- Can I read the public docs and see `graph.sync.syncWith(peerGraph)` instead
  of `graph.sync.syncWith(peerGraph._runtime)`?
- Is it obvious that this is the first tranche of the broader consumer
  migration rather than the end of the whole note?

## Accessibility / assistive reading posture

Relevant. The API reference and public type surface should stop teaching a
private escape hatch.

## Localization / directionality posture

Not especially relevant.

## Agent inspectability / explainability posture

Relevant. The slice should leave direct evidence in:

- `WarpGraph.ts`
- `SyncCapability.ts`
- the public type-check consumer
- direct-peer sync tests
- the API reference

## Non-goals

- No attempt to finish the entire `API_migrate-consumers-to-capabilities` note
- No `WarpApp` redesign in this slice
- No detached graph or observer/query-controller migration in this slice
- No `API_kill-warpruntime` work beyond removing the public `_runtime` leak

## Core diagnosis

The repo already has a public capability bag, but it still leaks the old
runtime in three ways:

1. type-level leak: `_runtime` on `WarpGraph`
2. binding lie: `as unknown as` at the composition root
3. sync peer lie: direct peers still described as `WarpRuntime`

Until those are fixed, the public API story is still half capability bag and
half hidden runtime contract.

## Design

### 1. Keep the migration tranche bounded to the public seam

This cycle only fixes the public factory/sync entry point:

- `openWarpGraph()`
- `WarpGraph`
- `SyncCapability`
- direct-peer sync examples and tests

### 2. Replace cast-cosplay with runtime-checked capability binding

The factory should fail fast if the wired runtime does not expose the methods a
capability bag needs, then return a frozen capability object with bound
methods.

### 3. Remove `_runtime` from the public capability bag

The returned `WarpGraph` value should only expose the capability bag itself.
Any remaining internal runtime bridge belongs elsewhere, not on the public
object.

### 4. Define a public direct-sync peer shape

Direct sync should accept:

- a URL string
- a sync capability object with `processSyncRequest`
- a public capability bag carrying `sync.processSyncRequest`

That lets `graph.sync.syncWith(peerGraph)` work honestly.

### 5. Leave the broader migration note live

After this slice, `API_migrate-consumers-to-capabilities` should remain open,
but the remaining work should be clearly internal:

- observer/runtime coupling
- detached graph/runtime coupling
- query-controller/runtime seams
- `WarpApp` / `WarpCore` bridge residue

## Test plan

### RED

Add tests that fail until:

- `WarpGraph` no longer exposes `_runtime`
- `openWarpGraph()` no longer contains `as unknown as`
- the public consumer type surface can sync `WarpGraph` to `WarpGraph`
- direct-peer sync works through the capability bag
- API docs stop showing `graphB._runtime`

### GREEN

- implement runtime-checked capability binding in `openWarpGraph()`
- remove `_runtime` from the public `WarpGraph`
- teach sync peer resolution to accept public capability bags
- update the public type-check consumer and API reference
- update the live backlog note to describe the remaining internal residue

### Witness

- `npm exec vitest run test/unit/domain/WarpGraph.public-sync.test.ts test/unit/scripts/warpgraph-capability-seam.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Agent

- Yes. `openWarpGraph()` now binds the public capability bags without
  `as unknown as`, using runtime method checks plus frozen bound capability
  objects.
- Yes. `_runtime` is gone from the public `WarpGraph` type and value.
- Yes. Direct peer sync now accepts a public capability bag peer, so
  `graph.sync.syncWith(peerGraph)` works without a `WarpRuntime` escape hatch.

### Human

- Yes. The API reference now teaches direct peer sync as
  `graphA.sync.syncWith(graphB)`.
- Yes. The cycle clearly reads as the public first tranche of
  `API_migrate-consumers-to-capabilities`, not as the end of the entire note.

### Verdict

`hill met`

## Drift check

No negative drift.

Positive drift only:

- the cycle also updated the live `API_migrate-consumers-to-capabilities`
  backlog note and the `v17` release ledger so they stop teaching the public
  seam as untouched
- the witness expanded beyond the red pair to include the existing sync
  regression tests and the public facade split ratchet, because the sync target
  resolution change touched shared runtime behavior
