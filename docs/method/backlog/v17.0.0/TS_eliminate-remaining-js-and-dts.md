---
id: TS_eliminate-remaining-js-and-dts
blocks: []
blocked_by: []
feature: runtime-boundaries
---

# Eliminate remaining .js and .d.ts files

## Problem

6 tracked non-TypeScript files remain in the repo after the v17
migration declared "100% TypeScript":

- `eslint.config.js` — ESLint flat config
- `vitest.config.js` — Vitest config
- `sha1sync.d.ts` — public export surface for browser SHA-1 shim
- `src/globals.d.ts` — ambient Deno/Bun globals + untyped substrate
  module shims (@git-stunts/plumbing, @git-stunts/trailer-codec)
- `src/domain/types/git-cas.d.ts` — type stub for @git-stunts/git-cas
- `src/domain/warp/_wiredMethods.d.ts` — WarpRuntime prototype
  augmentation (736 lines of interface declarations for methods wired
  via defineProperty)

## Fix

Convert each to a proper `.ts` file or eliminate:

1. **eslint.config.ts / vitest.config.ts** — Rename. Both tools
   support .ts configs natively in Node 22+.
2. **sha1sync.d.ts** — Merge the declaration into the .ts source file
   it describes (`src/infrastructure/adapters/sha1sync.ts`). It's a
   trivial function signature.
3. **globals.d.ts → globals.ts** — Ambient declarations work in `.ts`
   files. The untyped substrate module shims should be replaced by
   actually typing those packages upstream or by using typed imports.
4. **git-cas.d.ts** — Should go away entirely once
   `@git-stunts/git-cas` ships its own types. If not, convert to `.ts`
   with ambient module declaration.
5. **_wiredMethods.d.ts** — This is the big one. The 736-line
   interface augmentation exists because WarpRuntime has methods wired
   via `defineProperty`. The real fix is to kill the defineProperty
   pattern (tracked by API_kill-warpruntime and
   API_migrate-consumers-to-capabilities). Until WarpRuntime dies,
   this file cannot go away without changing the method-wiring model.

## Scope

**In:** Conversion and elimination of the 6 files. Updated references
in tsconfigs, package.json `files`, jsr.json includes.

**Out:** Killing WarpRuntime (separate cycle). Typing upstream
substrate packages (separate work).

## Notes

- `_wiredMethods.d.ts` is the hardest. Its existence is a symptom of
  the defineProperty wiring pattern, not a cause. Fixing it in
  isolation is a style change; the real work is removing the pattern.
- `sha1sync.d.ts` is referenced in both `package.json` `files` and
  `exports`, plus `jsr.json`. The export surface must be preserved
  (consumers import from `@git-stunts/git-warp/sha1sync`).
- Config `.js` → `.ts` requires verifying that all tooling still works
  (npm scripts, CI, hooks).
