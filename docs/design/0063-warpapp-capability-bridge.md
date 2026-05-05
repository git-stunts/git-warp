---
title: "Remove direct WarpRuntime typing from WarpApp"
cycle: "0063-warpapp-capability-bridge"
---

# Remove Direct WarpRuntime Typing From WarpApp

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

`WarpApp.ts` is still part of the remaining capability migration tail because
it imports `WarpRuntime` just to describe what sort of adopted `WarpCore` it
expects behind the facade.

That leaves two lies in the file:

- the app facade still names runtime directly
- content reads still route through `callInternalRuntimeMethod(...)` instead of
  the explicit surface it already expects

This is the next bounded bridge cleanup.

## Hill

`WarpApp.ts` depends on an explicit app-surface contract instead of
`WarpRuntime`-derived types, and its content reads go through that surface
directly.

## Playback questions

### Agent

- Does `WarpApp.ts` stop importing `WarpRuntime`?
- Does `WarpApp.ts` stop using `callInternalRuntimeMethod(...)` for content
  reads?
- Is the runtime-backed-core fiction replaced with an explicit surface
  contract?

### Human

- Can I read `WarpApp.ts` and understand what the app facade actually expects
  from an adopted core without bouncing through `WarpRuntime`?
- Is it still obvious that `WarpCore` is the next bridge residue?

## Non-goals

- No `WarpCore` cleanup in this slice
- No `API_kill-warpruntime` work yet

## Test plan

### RED

Add a shape ratchet that fails until:

- `WarpApp.ts` no longer imports `WarpRuntime`
- `WarpApp.ts` no longer imports `callInternalRuntimeMethod`

### GREEN

- define an explicit app-surface contract in `WarpApp.ts`
- route content reads directly through that surface
- update the facade/delegation tests to the new seam

### Witness

- `npm exec vitest run test/unit/scripts/warpapp-capability-bridge.test.ts test/unit/domain/WarpApp.facade.test.ts test/unit/domain/WarpApp.delegation.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Agent

- Yes. `WarpApp.ts` no longer imports `WarpRuntime`.
- Yes. Content reads no longer go through `callInternalRuntimeMethod(...)`.
- Yes. The file now names an explicit app-surface contract instead of a
  runtime-backed-core fiction.

### Human

- Yes. `WarpApp.ts` now reads like a facade over an explicit adopted-core
  surface instead of a file that still secretly depends on `WarpRuntime`.
- Yes. `WarpCore` is now the clearly remaining bridge residue.

### Verdict

`hill met`

## Drift check

No negative drift.
