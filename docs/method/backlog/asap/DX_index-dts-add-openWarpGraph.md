# Add openWarpGraph and WarpGraph types to index.d.ts

**Audit ref:** DQ01-C-01, SR01-G1

The hand-maintained `index.d.ts` (4073 lines) does not contain `openWarpGraph`,
`WarpGraph`, `WarpGraphDeps`, `CommitmentSurface`, `FoldingSurface`,
`RevelationSurface`, or `GovernanceSurface`.

`index.js` exports `openWarpGraph` (line 246), so JS consumers work. But TS
consumers who follow the README quick-start get a compile error immediately.

## Steps

1. Add type declarations for `WarpGraph`, `WarpGraphDeps`, `openWarpGraph`,
   and the four surface interfaces to `index.d.ts`.
2. Run `npm run typecheck:surface` to validate.
3. Run `npm run typecheck:consumer` to verify `test/type-check/consumer.ts`.
