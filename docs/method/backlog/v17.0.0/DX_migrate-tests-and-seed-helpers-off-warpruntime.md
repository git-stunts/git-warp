---
id: DX_migrate-tests-and-seed-helpers-off-warpruntime
blocked_by:
  - PORT_extract-runtime-host-product
blocks:
  - API_delete-warpruntime-class
feature: testing-quality
---

# Migrate tests and seed helpers off WarpRuntime

The remaining `WarpRuntime` delete cost is now concentrated in tests and helper
surfaces:

- unit and integration tests still import `WarpRuntime` directly
- bats seed scripts still dynamic-import `WarpRuntime.ts`
- helpers still speak in `WarpRuntime.open(...)` and `instanceof WarpRuntime`

This cut is to:

- move those surfaces onto `WarpCore.open(...)`, `WarpApp.open(...)`, or
  `openWarpGraph(...)` as appropriate
- delete `instanceof WarpRuntime` expectations
- shrink the final runtime-file delete into a source/file deletion rather than
  a test-surface migration bomb
