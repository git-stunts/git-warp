# v18 Package Surface Audit

## Scope

This audit checks whether npm, JSR, and the root TypeScript barrel expose the
Worldline-first API added for the v18 product pivot.

## Evidence

| Surface | Evidence | Status |
|---|---|---|
| npm root export | `package.json` exports `.` to `./dist/index.js` and `./dist/index.d.ts`. | Pass |
| JSR root export | `jsr.json` exports `.` to `./index.ts`. | Pass |
| Root runtime export | `index.ts` exports `openWarpWorldline` and `WarpWorldline`. | Pass |
| Root type export | `index.ts` exports `WarpWorldlineOpenOptions` and `WarpWorldlinePatchBuild`. | Pass |
| Consumer typecheck | `test/type-check/consumer.ts` imports and uses the new surface. | Pass |
| Publication gate | `npm run typecheck:surface` checks generated declaration targets. | Pass |

## Decision

No new package subpath is needed for the v18 Worldline-first API. The root
barrel is the correct package surface because the migration goal is to change
the first-use public path, not to create a separate package family.

The package description and keyword list now include the Worldline-first
positioning so registry search results match the documented API posture.

## Guard

`test/unit/scripts/v18-package-surface-audit.test.ts` keeps the package
description, keywords, npm export targets, JSR root export, root barrel exports,
and default export compatibility posture pinned.
