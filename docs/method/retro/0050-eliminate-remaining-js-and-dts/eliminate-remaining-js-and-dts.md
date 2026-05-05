# Retro — 0050 Eliminate Remaining `.js` And `.d.ts`

## Outcome

`hill met`

The repo no longer carries config `.js` files or redundant standalone
declaration shards for `sha1sync`, `git-cas`, or `trailer-codec`.

The tracked non-TS tail outside `.obsidian/` is now exactly:

- `src/globals.d.ts`
- `src/domain/warp/_wiredMethods.d.ts`

That is the truthful end-state for `v17`:

- `src/globals.d.ts` remains as the ambient boundary shim for runtimes and
  untyped substrate packages
- `_wiredMethods.d.ts` remains as the explicit blocked runtime-wiring artifact

## What changed

- renamed `eslint.config.js` -> `eslint.config.ts`
- renamed `vitest.config.js` -> `vitest.config.ts`
- added `jiti` so ESLint can load the TS config honestly
- removed `sha1sync.d.ts`
- removed `src/domain/types/git-cas.d.ts`
- merged the trailer-codec facade into `src/globals.d.ts`
- removed `src/domain/types/trailer-codec-facade.d.ts`
- removed stale `.js` assumptions from `vitest.config` and `tsconfig.json`
- ratcheted the exact non-TS tail in
  `test/unit/scripts/non-ts-tail-shape.test.ts`

## What stayed blocked

- `_wiredMethods.d.ts`

This cycle deliberately did not fake progress on the runtime-wiring kill path.
That artifact remains downstream of capability migration / WarpRuntime death.

## New debt discovered

- `_wiredMethods.d.ts` still contains stale `.js` import paths. That was filed
  as bad code so it stays visible instead of being buried in this retro.

## Next

- keep burning down `v17` runtime-boundary debt without mixing it into the
  parked publish tail
- treat `_wiredMethods.d.ts` as explicit blocked residue until
  `API_migrate-consumers-to-capabilities` / `API_kill-warpruntime` land
