---
title: "Move Worldline onto the detached graph factory seam"
cycle: "0062-worldline-detached-factory-seam"
---

# Move Worldline Onto The Detached Graph Factory Seam

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

Cycle `0061` cleaned the query-controller snapshot seam, but the detached read
duplication still survives in `Worldline.ts`:

- `Worldline` still carries its own detached-open helper
- `Worldline` still imports `WarpRuntime`
- `Worldline` still carries the runtime observer cast-cosplay
- `SLUDGE_detached-graph-duplication` is still live until that duplicate
  logic dies at the second callsite too

This is the next honest follow-through slice.

## Hill

`Worldline.ts` depends on `DetachedGraphFactory` and an explicit observer
backing contract instead of runtime-typed detached-open logic, and the
detached-graph duplication backlog card can close honestly.

## Playback questions

### Agent

- Does `Worldline.ts` stop importing `WarpRuntime`?
- Does `Worldline.ts` stop duplicating detached-open option assembly?
- Does the file lose its `as unknown as` observer cast?

### Human

- Can I read `Worldline.ts` and see that detached reads come from the same
  factory seam as other materialization consumers?
- Is it obvious that `WarpApp` / `WarpCore` bridge work is still separate?

## Non-goals

- No `WarpApp` cleanup in this slice
- No `WarpCore` cleanup in this slice
- No attempt to kill `WarpRuntime` yet

## Test plan

### RED

Add a shape ratchet that fails until:

- `Worldline.ts` no longer imports `WarpRuntime`
- `Worldline.ts` no longer uses `as unknown as`
- `Worldline.ts` no longer calls `WarpRuntime.open(...)`

### GREEN

- inject `DetachedGraphFactory` into `Worldline`
- remove the duplicated detached-open builder logic
- define an explicit observer backing contract for `Worldline`
- close `SLUDGE_detached-graph-duplication`

### Witness

- `npm exec vitest run test/unit/scripts/worldline-detached-factory-seam.test.ts`
- `npm exec vitest run test/unit/domain/WarpGraph.worldline.test.ts`
- `npm exec vitest run test/unit/domain/services/controllers/QueryController.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Agent

- Yes. `Worldline.ts` no longer imports `WarpRuntime`.
- Yes. Detached reads now come from `DetachedGraphFactory` instead of a local
  `WarpRuntime.open(...)` path.
- Yes. The observer cast corridor is gone.

### Human

- Yes. `Worldline.ts` now reads like a consumer of the existing detached read
  seam instead of its own hidden runtime boot surface.
- Yes. The remaining runtime bridge work is clearly `WarpApp` /
  `WarpCore`, not detached graph duplication.

### Verdict

`hill met`

## Drift check

No negative drift.

Positive drift only:

- `Worldline.ts` also graduated from the cast and boundary quarantine
  manifests because this slice removed the remaining local violations
