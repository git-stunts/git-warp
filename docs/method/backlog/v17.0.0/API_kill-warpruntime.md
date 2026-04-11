# Delete WarpRuntime and all defineProperty sludge

Final step of the API redesign. Remove:

- `src/domain/WarpRuntime.js` (1041 LOC god object)
- `src/domain/warp/_wiredMethods.d.ts` (708 LOC hand-maintained lies)
- All 9 `defineProperty` loops (~230 LOC of identical boilerplate)
- The `_internal.ts` shim

Boot logic (constructor, `open()`) migrates into `openWarpGraph()`.
Controller instantiation moves into the factory.

Depends on: all consumers migrated to capability interfaces.
