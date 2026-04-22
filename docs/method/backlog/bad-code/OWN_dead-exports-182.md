---
id: OWN_dead-exports-182
blocked_by: []
blocks: []
feature: merge-strands-worldlines
---

# CC_dead-exports-182

**Title:** 182 potentially dead named exports across the codebase
**Effort:** M

## Issue

Static analysis found 182 named exports that are never imported by any
file in src/, test/, or bin/. Major clusters: CoordinateFactExport (7
exports), WormholeService (3), BoundaryTransitionRecord (7),
trust/schemas (9), WarpTypesV2 factory functions (4), KeyCodec constants
(5), StrandService constants (6), ConflictAnalyzerService constants (4).
Some may be used via dynamic access or re-exported through index.js
barrel exports that weren't traced — manual verification needed for the
top candidates.

## Fix

Run ts-prune or a similar tool to confirm. Remove confirmed dead
exports. For public API exports (index.js), mark as intentionally public
with a comment. Reduce the 182 to a verified list.
