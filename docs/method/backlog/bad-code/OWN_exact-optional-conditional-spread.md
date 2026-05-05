---
id: OWN_exact-optional-conditional-spread
blocked_by: []
blocks: []
feature: merge-strands-worldlines
release_home: v17.0.0
---

# exactOptionalPropertyTypes conditional spread boilerplate

**Effort:** M

## Problem

`exactOptionalPropertyTypes: true` means you can't pass
`{ key: undefined }` to a function expecting `{ key?: T }`. The fix
is conditional spread: `...(x !== undefined ? { key: x } : {})`.
This is correct but verbose. ~30 call sites across `WarpRuntime.js`,
`SyncController.js`, `WormholeService.js`, `StrandService.js`, and
others.

A shared `omitUndefined()` utility could DRY it up, but premature
until the pattern stabilizes.
