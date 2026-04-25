---
title: "Migrate seed and runtime helpers off WarpRuntime"
cycle: "0080-migrate-seed-and-runtime-helpers-off-warpruntime"
---

# Migrate Seed And Runtime Helpers Off WarpRuntime

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

After `0079`, the first executable test migration cut is the helper and seed
surface:

- `test/helpers/*.ts`
- `test/bats/helpers/*.ts`
- `test/runtime/deno/helpers.ts`
- `test/integration/api/helpers/setup.ts`

Those helpers still reopen `WarpRuntime` or name it in helper contracts. That
keeps the broad test-suite migration coupled to the class we are trying to
delete.

## Hill

Move helper and seed openers off `WarpRuntime` so the next runtime-suite
migration can rely on helper APIs that no longer reintroduce the runtime class.

## Playback questions

### Agent

- Do helper and seed files stop importing or dynamic-importing
  `WarpRuntime.ts`?
- Do helper and seed openers stop calling `WarpRuntime.open(...)`?
- Do helper contracts stop documenting returned values as `WarpRuntime`?

### Human

- If I inspect the test helper entrypoints now, do they point at `WarpCore` or
  graph-facing helpers instead of the runtime class?

## Accessibility / assistive reading posture

Not user-facing. No additional accessibility posture is required.

## Localization / directionality posture

Not user-facing. No localization or directionality impact.

## Agent inspectability / explainability posture

The helper migration must be enforceable by a narrow ratchet over the helper
paths so future test helpers do not reintroduce the runtime class while the
suite migration is still in progress.

## Non-goals

- No broad `test/unit/domain/WarpGraph*.test.ts` migration in this slice
- No `WarpRuntime.ts` deletion in this slice
- No source runtime-product changes

## Test plan

### RED

Add a ratchet that fails while helper/seed paths contain:

- direct `WarpRuntime` imports
- dynamic `WarpRuntime.ts` imports
- `WarpRuntime.open(...)`
- `instanceof WarpRuntime`

### GREEN

- move BATS seed setup and standalone seed scripts to `WarpCore.open(...)`
- move Deno and integration helper openers to `WarpCore.open(...)`
- remove `WarpRuntime` naming from helper contracts and comments
- update the runtime-kill backlog chain

### Witness

- `npm exec vitest run test/unit/scripts/warpruntime-helper-migration.test.ts`
- `npm exec vitest run test/unit/domain/WarpCore.content.test.ts test/unit/domain/WarpCore.effectPipeline.test.ts test/unit/domain/WarpCore.emit.test.ts test/integration/api/fork.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Agent

- Yes. Helper and seed files now stop importing or dynamic-importing
  `WarpRuntime.ts`.
- Yes. Helper and seed openers now stop calling `WarpRuntime.open(...)`.
- Yes. Helper contracts no longer document returned values as `WarpRuntime`.

### Human

- Yes. The test helper entrypoints now point at `WarpCore` or graph-facing
  helpers instead of the runtime class.

### Verdict

`hill met`

## Drift check

No negative drift.
