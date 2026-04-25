---
id: DX_migrate-seed-and-runtime-helpers-off-warpruntime
blocked_by: []
blocks:
  - DX_migrate-runtime-suites-off-warpruntime
feature: testing-quality
---

# Migrate seed and runtime helpers off WarpRuntime

The first remaining `WarpRuntime` delete residue sits in helper and seed
surfaces:

- `test/helpers/*.ts`
- `test/bats/helpers/*.ts`
- `test/runtime/deno/helpers.ts`
- `test/integration/api/helpers/setup.ts`

These files still dynamic-import `WarpRuntime.ts`, call `WarpRuntime.open(...)`,
or teach helper contracts in terms of the runtime class.

This cut is to:

- move helper and seed openers onto `WarpCore.open(...)`, `WarpApp.open(...)`,
  or `openWarpGraph(...)` as appropriate
- stop helper contracts from naming `WarpRuntime` directly
- give the broad runtime-suite migration a helper surface that no longer
  reintroduces the deleted class
