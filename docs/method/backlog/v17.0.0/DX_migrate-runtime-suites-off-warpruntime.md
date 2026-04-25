---
id: DX_migrate-runtime-suites-off-warpruntime
blocked_by: []
blocks:
  - DX_migrate-tests-and-seed-helpers-off-warpruntime
feature: testing-quality
---

# Migrate runtime-facing suites off WarpRuntime

Helper and seed surfaces no longer reopen the runtime class. The remaining
residue is now the broad test suite itself:

- `test/unit/domain/WarpGraph*.test.ts`
- runtime-facing service and infrastructure tests
- integration suites that still import `WarpRuntime` directly
- tests that still assert `instanceof WarpRuntime`

This cut is to:

- move runtime-facing suites onto `WarpCore`, `WarpApp`, or `openWarpGraph`
  entrypoints as appropriate
- delete `instanceof WarpRuntime` expectations
- shrink the final class delete into a file/export removal instead of a
  runtime-suite migration bomb
