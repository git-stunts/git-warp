# 0080 Migrate Seed And Runtime Helpers Off WarpRuntime

- Outcome: `hill met`
- Cycle doc: [docs/design/0080-migrate-seed-and-runtime-helpers-off-warpruntime.md](../../../design/0080-migrate-seed-and-runtime-helpers-off-warpruntime.md)

## What changed

- moved BATS seed setup and seed scripts from `WarpRuntime.open(...)` to
  `WarpCore.open(...)`
- moved [test/runtime/deno/helpers.ts](../../../../test/runtime/deno/helpers.ts)
  and [test/integration/api/helpers/setup.ts](../../../../test/integration/api/helpers/setup.ts)
  to `WarpCore.open(...)`
- removed `WarpRuntime` helper-contract wording from
  [concurrencyHarness.ts](../../../../test/helpers/concurrencyHarness.ts)
- added helper coverage now carried by
  [publicApiExecutableExamples.test.ts](../../../../test/unit/domain/publicApiExecutableExamples.test.ts)
  and [warpGraphTestUtilsStructure.test.ts](../../../../test/unit/helpers/warpGraphTestUtilsStructure.test.ts)
- advanced the runtime-kill chain so the next remaining blocker is
  `DX_migrate-runtime-suites-off-warpruntime`

## Why it mattered

The next suite migration can now use helper infrastructure that no longer
reopens or teaches the runtime class. That keeps the remaining `WarpRuntime`
delete cost in the suites themselves instead of hiding it in shared setup.

## Witness

- `npm exec vitest run test/unit/domain/publicApiExecutableExamples.test.ts test/unit/helpers/warpGraphTestUtilsStructure.test.ts`
- `npm exec vitest run test/unit/domain/WarpCore.content.test.ts test/unit/domain/WarpCore.effectPipeline.test.ts test/unit/domain/WarpCore.emit.test.ts test/integration/api/fork.test.ts`
- `npm run typecheck`
- `git diff --check`

`git diff --check` completed successfully but printed the repo's existing
fsmonitor IPC warning while reading Git status.
