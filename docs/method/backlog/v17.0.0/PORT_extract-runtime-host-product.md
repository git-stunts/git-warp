---
id: PORT_extract-runtime-host-product
blocked_by: []
blocks:
  - API_delete-warpruntime-class
feature: runtime-boundaries
---

# Extract the internal runtime host product

Deleting `WarpRuntime.ts` is still blocked by source-side residues:

- [WarpGraphRuntimeProduct.ts](/Users/james/git/git-stunts/git-warp/src/domain/warp/WarpGraphRuntimeProduct.ts)
- [WarpCoreRuntimeProduct.ts](/Users/james/git/git-stunts/git-warp/src/domain/warp/WarpCoreRuntimeProduct.ts)
- [ForkController.ts](/Users/james/git/git-stunts/git-warp/src/domain/services/controllers/ForkController.ts)

All three still reach `openWarpRuntime(...)` or type against that surface.

This cut is to:

- move runtime boot + host construction behind an internal non-`WarpRuntime`
  product seam
- stop the product builders and `ForkController` from importing or dynamically
  importing `WarpRuntime.ts`
- make the final `WarpRuntime.ts` file delete a consumer migration problem,
  not a source-architecture problem
