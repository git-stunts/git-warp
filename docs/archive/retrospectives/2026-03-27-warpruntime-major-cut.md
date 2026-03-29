# Retrospective: `WarpRuntime` Major-Version Cut

**Date:** 2026-03-27
**Legend:** Observer Geometry
**Cycle:** Runtime noun split
**Backlog:** `OG-002`, `OG-008`

## What Landed

- Renamed the public runtime class from `WarpGraph` to `WarpRuntime`.
- Removed `WarpGraph` from the public export surface instead of carrying a
  compatibility alias.
- Renamed the source runtime file to `src/domain/WarpRuntime.js` and updated
  runtime/type imports to point at the new path.
- Exported `WarpRuntime` as both the default and a named symbol from
  `index.js` / `index.d.ts`.
- Bumped the package version from `14.16.2` to `15.0.0`.
- Updated the main user-facing docs to prefer `WarpRuntime`.

## What Went Well

- The earlier detached-read, observer-seek, and worldline slices reduced the
  risk of the rename. The core semantic shift had already happened.
- Writing the export and API-surface tests first made the break crisp:
  `WarpRuntime` had to exist, and `WarpGraph` had to disappear.
- Doing this as a hard major cut was cheaper than dragging a compatibility
  alias through source, types, and docs.

## What Needed Adjustment

- `npm run typecheck` caught several latent declaration mismatches that the
  focused runtime tests did not:
  - stale CLI imports still targeted `WarpGraph.js`
  - `_wiredMethods.d.ts` still constrained `ObserverConfig.match` to `string`
  - receipt freeze helpers were more immutable at runtime than their JSDoc
    return types admitted
  - `Worldline.materialize()` needed explicit overload-safe branching
- The broad rename also touched tests and comments mechanically, so one export
  test had to be corrected after the bulk replacement.

## What Remains

- The immutable snapshot noun is still `WarpStateV5` at the public type level;
  the larger `WarpState` snapshot reification is still separate work.
- Many test filenames and some historical design notes still contain the old
  `WarpGraph` string. That is cleanup, not a blocking semantic issue.
- Deep immutability of returned snapshots is still a distinct backlog item.

## Verification

- `npx vitest run test/unit/domain`
- `npm run typecheck`
- `npx vitest run test/unit/domain/WarpGraph.worldline.test.js test/unit/domain/WarpGraph.observerBoundary.test.js test/unit/domain/services/ObserverView.test.js test/unit/domain/WarpGraph.strands.test.js test/unit/domain/WarpGraph.receipts.test.js test/unit/domain/index.exports.test.js test/unit/domain/WarpRuntime.apiSurface.test.js`
