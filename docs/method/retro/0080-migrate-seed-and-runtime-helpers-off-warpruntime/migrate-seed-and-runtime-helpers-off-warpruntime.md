# 0080 Migrate Seed And Runtime Helpers Off WarpRuntime

- Outcome: `hill met`
- Cycle doc: [docs/design/0080-migrate-seed-and-runtime-helpers-off-warpruntime.md](/Users/james/git/git-stunts/git-warp/docs/design/0080-migrate-seed-and-runtime-helpers-off-warpruntime.md)

## What changed

- moved BATS seed setup and seed scripts from `WarpRuntime.open(...)` to
  `WarpCore.open(...)`
- moved [test/runtime/deno/helpers.ts](/Users/james/git/git-stunts/git-warp/test/runtime/deno/helpers.ts)
  and [test/integration/api/helpers/setup.ts](/Users/james/git/git-stunts/git-warp/test/integration/api/helpers/setup.ts)
  to `WarpCore.open(...)`
- removed `WarpRuntime` helper-contract wording from
  [concurrencyHarness.ts](/Users/james/git/git-stunts/git-warp/test/helpers/concurrencyHarness.ts)
- added the helper ratchet at
  [warpruntime-helper-migration.test.ts](/Users/james/git/git-stunts/git-warp/test/unit/scripts/warpruntime-helper-migration.test.ts)
- advanced the runtime-kill chain so the next remaining blocker is
  `DX_migrate-runtime-suites-off-warpruntime`

## Why it mattered

The next suite migration can now use helper infrastructure that no longer
reopens or teaches the runtime class. That keeps the remaining `WarpRuntime`
delete cost in the suites themselves instead of hiding it in shared setup.

## Witness

- `npm exec vitest run test/unit/scripts/warpruntime-helper-migration.test.ts test/unit/scripts/migrate-warpruntime-test-helper-split.test.ts test/unit/scripts/delete-warpruntime-class-split.test.ts test/unit/scripts/kill-warpruntime-split.test.ts`
- `npm exec vitest run test/unit/domain/WarpCore.content.test.ts test/unit/domain/WarpCore.effectPipeline.test.ts test/unit/domain/WarpCore.emit.test.ts test/integration/api/fork.test.ts`
- `npm run typecheck`
- `git diff --check`

`git diff --check` completed successfully but printed the repo's existing
fsmonitor IPC warning while reading Git status.
