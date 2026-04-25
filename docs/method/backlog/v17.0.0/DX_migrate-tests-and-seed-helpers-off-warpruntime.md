---
id: DX_migrate-tests-and-seed-helpers-off-warpruntime
blocked_by: []
blocks:
  - API_delete-warpruntime-class
feature: testing-quality
---

# Close out test and seed migration off WarpRuntime

The helper/seed migration landed in cycle `0080`. The runtime-facing suite
migration landed in cycle `0081`.

This note is now the closeout gate before deleting the class:

- confirm the helper ratchet and suite ratchet both pass
- confirm runtime-facing suites no longer import, open, or assert against
  `WarpRuntime`
- hand the class delete a file/export removal instead of a broad migration bomb
