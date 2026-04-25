---
title: "Migrate runtime suites off WarpRuntime"
cycle: "0081-migrate-runtime-suites-off-warpruntime"
---

# Migrate Runtime Suites Off WarpRuntime

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

Cycle `0080` moved helper and seed entrypoints off the runtime class. The
remaining blocker is now the broad test-suite surface: unit, integration, and
infrastructure-adapter suites still import `WarpRuntime`, call
`WarpRuntime.open(...)`, or assert against the class with `instanceof`.

That keeps the final runtime deletion coupled to a test-suite migration bomb.
This cycle turns that bomb into a ratcheted, structural test migration.

## Hill

Runtime-facing test suites no longer import, open, or assert against
`WarpRuntime`; they use `WarpCore`, graph-facing APIs, or structural product
checks as appropriate.

## Playback questions

### Agent

- Do runtime-facing suites stop importing `WarpRuntime.ts`?
- Do runtime-facing suites stop calling `WarpRuntime.open(...)`?
- Do runtime-facing suites stop asserting `instanceof WarpRuntime`?
- Does a suite-level ratchet prevent this residue from returning?

### Human

- If I inspect the remaining `WarpRuntime` delete chain, is the next step now
  a closeout gate instead of a broad suite migration?

## Accessibility / assistive reading posture

Not user-facing. No additional accessibility posture is required.

## Localization / directionality posture

Not user-facing. No localization or directionality impact.

## Agent inspectability / explainability posture

The migration must be enforced by an executable ratchet that scans the runtime-
facing suite roots rather than by a one-time grep pasted into chat.

## Non-goals

- No `WarpRuntime.ts` source deletion in this slice
- No public API removal in this slice
- No source runtime-host product redesign in this slice

## Test plan

### RED

Add a ratchet that fails while runtime-facing test suites contain:

- direct `WarpRuntime` imports
- dynamic `WarpRuntime.ts` imports
- `WarpRuntime.open(...)`
- `instanceof WarpRuntime`

### GREEN

- move runtime-shaped tests to `WarpCore.open(...)`
- replace class-instance assertions with structural product assertions
- update obsolete runtime API-surface tests around the surviving core surface
- advance the runtime-kill backlog chain

### Witness

- `npm exec vitest run test/unit/scripts/warpruntime-suite-migration.test.ts`
- `npm exec vitest run test/unit/domain/WarpGraph*.test.ts test/unit/domain/WarpCore*.test.ts test/unit/domain/warp/*.test.ts test/unit/domain/services/*.test.ts test/unit/infrastructure/adapters/InMemoryGraphAdapter*.test.ts test/integration/WarpGraph.integration.test.ts`
- `npm run typecheck`
- `git diff --check`

