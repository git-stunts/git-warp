---
id: CAST_roaring-loader-fallback-opacity
blocked_by: []
blocks: []
feature: trie-state-storage
release_home: v17.0.0
---

# PROTO_roaring-loader-fallback-opacity

## What stinks

`src/domain/utils/roaring.js` mixes three concerns into one import-time side effect:

1. top-level auto-initialization
2. tiered module loading (`import`, `createRequire`, `roaring-wasm`)
3. runtime capability detection (`isNativelyInstalled` probing)

That makes the remaining behavior hard to test honestly. The business behavior is simple, but the loader behavior is hidden behind:

- top-level `await initRoaring()`
- internal fallback helpers that are not injectable
- external module resolution side effects

The result is a file that still has significant uncovered lines even after the observable public behavior is tested. The residue is mostly loader plumbing, not bitmap semantics.

## Why it matters

- Coverage work turns into module-loader wrestling instead of behavior testing.
- Fallback-chain failures are hard to reproduce deterministically in Vitest.
- Import-time side effects make the module harder to reason about and harder to reuse in alternative runtimes.

## Suggested direction

- Extract a pure loader strategy function that accepts injectable tier loaders.
- Keep `initRoaring()` as the public boundary, but move tier selection into a helper that can be passed fakes in tests.
- Make auto-init a thin shell over that helper instead of the only path through the code.

## Evidence

- Coverage after cycle 0010 runtime/adapter push still leaves `roaring.js` at low line coverage while the public API branches are substantially exercised.
- The stubborn misses cluster around fallback loading and import-time initialization, not the injected-module API paths.
