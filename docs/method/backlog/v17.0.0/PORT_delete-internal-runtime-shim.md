---
id: PORT_delete-internal-runtime-shim
blocked_by:
  - PORT_delete-runtime-controller-host-types
blocks:
  - API_kill-warpruntime
feature: runtime-boundaries
---

# Delete the _internal runtime compatibility shim

`src/domain/warp/_internal.ts` is now mostly a compatibility alias around the
remaining runtime-backed graph surface. Once composition-root boot and
controller host typing stop depending on `WarpRuntime`, this shim becomes the
last obvious residue:

- `WarpGraphWithMixins`
- shared error re-exports and constants that still piggyback on the old runtime
  method-file world

This cut is to:

- remove the remaining `_internal.ts` compatibility alias
- move any surviving shared constants to honest owners
- finish the last mechanical residue before the actual `WarpRuntime` deletion
