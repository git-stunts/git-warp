---
id: DX_max-file-size-policy
feature: runtime-boundaries
blocked_by: []
blocks: []
---

# Enforce Max File Size + One-Thing-Per-File Policy

**Effort:** L

## Problem

The codebase has files ranging up to 2,572 LOC (ConflictAnalyzerService) with the combined WarpRuntime + warp/ mixin surface at 6,613 LOC. Large files are hard to navigate, attract merge conflicts, and resist comprehension. The lack of a file-size ceiling means files grow silently until someone notices.

More fundamentally, files frequently contain multiple exports that serve different purposes — helper functions, type definitions, constants, and the primary class all living in the same file. This violates the principle that a file should be about one thing.

## Policy

### Max LOC

Hard ceiling enforced by ESLint or a lint script:

- **Source files (`src/`)**: 500 LOC max
- **Test files (`test/`)**: 800 LOC max (tests are inherently more verbose)
- **CLI commands (`bin/`)**: 300 LOC max
- **Scripts (`scripts/`)**: 300 LOC max

Files over the limit must be split. The pre-commit or pre-push gate blocks violations.

### One Thing Per File

Each file exports **one primary thing** — a class, a function, a type, or a closely-related set of constants. If a file exports a class AND standalone helper functions that aren't private to that class, the helpers belong in their own module.

Exceptions:
- Re-export barrels (`index.js`) are fine
- A function + its directly-related typedef is one thing
- A small set of related factory functions (e.g. `createNodeAdd`, `createEdgeAdd`) is one thing

### Current Violators

Files over 500 LOC that need splitting (source only):

| File | LOC | What to split |
|---|---|---|
| ConflictAnalyzerService.js | 2,572 | 27 standalone helpers → separate module(s) |
| StrandService.js | 2,048 | 8 concerns → separate services (see B176) |
| GraphTraversal.js | 1,620 | Algorithm families could be separate files |
| PatchBuilderV2.js | 1,103 | Content ops, effect emission → extract |
| comparison.methods.js | 1,088 | Comparison helpers → separate modules |
| GitGraphAdapter.js | 1,036 | Already clean SRP, but could split by Git operation family |
| IncrementalIndexUpdater.js | 956 | Node/edge/prop update logic → separate strategies |
| query.methods.js | 906 | Query execution vs query building |
| QueryBuilder.js | 852 | Query DSL vs query execution |
| StreamingBitmapIndexBuilder.js | 835 | Build vs serialize |
| AuditVerifierService.js | 835 | Verification vs chain walking |
| InMemoryGraphAdapter.js | 815 | Already clean SRP |
| VisibleStateComparisonV5.js | 808 | Comparison algorithms |
| materializeAdvanced.methods.js | 716 | Advanced materialization paths |
| DagPathFinding.js | 705 | Path algorithms |
| WarpRuntime.js | 683 | See B176 |
| SyncController.js | 680 | Already extracted, near limit |

## Implementation

1. Add ESLint `max-lines` rule (already exists, just need to tighten the threshold)
2. Add the ceiling to `eslint.config.js` — 500 for src, 800 for test, 300 for bin/scripts
3. Existing violators get added to a temporary relaxation block (like the complexity relaxation)
4. Each file split is its own cycle — pull from backlog, split, verify tests, commit
5. Ratchet: the relaxation block must shrink over time, never grow

## Notes

- ESLint `max-lines` rule supports `skipBlankLines` and `skipComments` — use both for a fair count
- The `one thing per file` policy is harder to lint — enforce via code review and the bad_code.md journal
- GraphTraversal.js (1,620 LOC) was flagged as NOT a god object in the audit — single responsibility (algorithm library). The split here is by algorithm family, not by concern. Still worth doing for navigability.
- This policy should go in CONTRIBUTING.md and CLAUDE.md once agreed
