---
title: "Migrate QueryController off direct WarpRuntime typing"
cycle: "0061-query-controller-capability-seam"
---

# Migrate QueryController Off Direct WarpRuntime Typing

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

Cycle `0060` removed the runtime lie from `Observer`, but
`API_migrate-consumers-to-capabilities` is still live because
`QueryController.ts` continues to name `WarpRuntime` directly for:

- observer snapshot resolution
- detached read graph opening
- state-hash fallback logic

That leaves the internal query seam teaching the same old lesson:
if a controller needs snapshot reads, it should reach straight into
runtime guts.

This is the next honest bounded slice.

## Hill

`QueryController.ts` stops importing `WarpRuntime` and resolves snapshot
reads through explicit injected seams:

- a detached read graph factory
- a state-hash callback

The remaining detached graph / `Worldline` duplication is left for the next
cycle instead of being smeared into this one.

## Playback questions

### Agent

- Does `QueryController.ts` stop importing `WarpRuntime`?
- Does snapshot resolution stop importing `openDetachedGraph` directly?
- Is state hashing resolved through an explicit seam instead of runtime field
  reach-in?

### Human

- Can I read `QueryController.ts` and see what detached/snapshot services it
  actually needs?
- Is it still obvious that `Worldline` and detached-graph duplication remain a
  separate follow-through slice?

## Agent inspectability / explainability posture

Relevant. The touched evidence should live in:

- `src/domain/services/controllers/QueryController.ts`
- `src/domain/WarpRuntime.ts`
- a source-shape ratchet for the query seam
- the live migration ledger docs

## Non-goals

- No `Worldline` migration in this slice
- No attempt to close `SLUDGE_detached-graph-duplication` yet
- No `WarpApp` / `WarpCore` bridge cleanup yet
- No `API_kill-warpruntime` work yet

## Design

### 1. Inject the detached read seam

`QueryController` should receive a `DetachedGraphFactory` dependency instead of
opening detached graphs through a runtime-typed free function.

### 2. Inject state hashing

`QueryController` should not read `_stateHashService`, `_crypto`, or `_codec`
directly when building snapshot state hashes. It should receive a hash-state
callback from the composition root.

### 3. Keep the host residue scoped

This slice is allowed to keep the broad host graph for the existing
QueryReads/QueryContent delegates. The point is to remove the direct runtime
typing from the snapshot path first, not to pretend the whole host-bag problem
is solved.

## Test plan

### RED

Add a ratchet that fails until:

- `QueryController.ts` no longer imports `WarpRuntime`
- `QueryController.ts` no longer imports `openDetachedGraph`
- `QueryController.ts` no longer contains `as WarpRuntime`

### GREEN

- inject `DetachedGraphFactory` and `hashState`
- rewire snapshot resolution through those dependencies
- update runtime construction and migration docs

### Witness

- `npm exec vitest run test/unit/scripts/query-controller-capability-seam.test.ts`
- `npm exec vitest run test/unit/domain/services/controllers/QueryController.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Agent

- Yes. `QueryController.ts` no longer imports `WarpRuntime`.
- Yes. Snapshot resolution now depends on `DetachedGraphFactory` instead of
  importing `openDetachedGraph`.
- Yes. State hashing now comes through an injected callback instead of
  reading `_stateHashService`, `_crypto`, and `_codec` directly.

### Human

- Yes. `QueryController.ts` now states the detached-read and hash-state seams
  explicitly in its constructor dependencies.
- Yes. `Worldline` remains the next separate migration target; this slice does
  not pretend to close detached graph duplication yet.

### Verdict

`hill met`

## Drift check

No negative drift.

Positive drift only:

- the runtime composition root now guards the query-controller host shape
  explicitly before wiring the controller
- the query controller test fixture was updated to construct the controller
  through the new dependency shape
