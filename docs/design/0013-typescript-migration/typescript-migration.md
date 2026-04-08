# Cycle 0013 — TypeScript Migration: No Gods, No Large Files

## The Hill

v17.0.0 ships as a TypeScript project. Every `.js` file becomes `.ts`.
Every god object is decomposed. Every file respects the size ceiling.
The SSTS manifesto is the active standard. The codebase compiles with
`strict: true`, zero `any`, zero `unknown` outside parsers, zero `as`
assertions.

## Why Now

1. **DX is broken.** VSCode shows a wall of red squiggles on JSDoc JS.
   Contributors assume the codebase is broken. The IDE experience is
   actively hostile.
2. **The toolchain is ready.** Node 25, Bun 1.2, and Deno 2.6 all
   execute `.ts` natively (type erasure, no transpilation). No build
   step needed. Direct execution preserved.
3. **The doctrine survives.** SSTS keeps everything SSJS valued —
   runtime truth, constructor validation, `Object.freeze`, `instanceof`
   dispatch — but the compiler can now verify the types instead of
   fighting them.
4. **God objects are debt.** 35 files over 500 LOC. GraphTraversal at
   1,617. ComparisonController at 1,212. JoinReducer at 1,158.
   Splitting during migration is cheaper than splitting separately.

## Constraints

- **No `any`.** Not in source, tests, type assertions, or generic
  defaults. If you cannot type it, you haven't understood it yet.
- **No `unknown`.** Raw data enters through parsers. `unknown` never
  escapes the parser function.
- **No `as` assertions.** Runtime guards narrow types. The compiler
  follows.
- **No file over 500 LOC** (source), **800 LOC** (test), **300 LOC**
  (bin/scripts). Enforced by ESLint `max-lines`.
- **No god objects.** One responsibility per class. If a class does
  two things, split it.
- **No build step.** All three runtimes execute `.ts` directly.
  `tsc` is a checker, not a compiler. Declarations are generated for
  npm consumers.
- **Tests pass at every commit.** The migration is incremental.
  Mixed `.js`/`.ts` is allowed during transition. Every commit is
  green.

## What Ships in v17.0.0

### TypeScript migration
- All 289 source files converted to `.ts`
- All 45 CLI files converted to `.ts`
- All 6 script files converted to `.ts`
- Test files converted opportunistically (mixed OK at release)
- Hand-maintained `.d.ts` files deleted (auto-generated)
- ~1,974 `@type` casts deleted
- ~294 `@typedef` blocks deleted or converted to proper types
- ~3,869 `@param` / ~2,199 `@returns` converted to TS syntax

### God object decomposition
Files currently over 500 LOC that must be split:

| File | LOC | Split strategy |
|------|-----|----------------|
| GraphTraversal.js | 1,617 | Algorithm families: BFS/DFS, pathfinding, topological, closure |
| ComparisonController.js | 1,212 | Strand comparison vs coordinate comparison vs transfer planning |
| JoinReducer.js | 1,158 | OpStrategy registry stays; extract accumulation, diff, receipt |
| PatchBuilderV2.js | 1,113 | Core builder, content ops, effect emission |
| WarpRuntime.js | 1,037 | Boot/open logic, runtime state, capability wiring |
| GitGraphAdapter.js | 1,036 | By git operation family: refs, commits, blobs, trees |
| MaterializeController.js | 1,010 | Full vs ceiling materialization, index management |
| StrandService.js | 992 | Already partially split; finish descriptor/materializer/intent |
| IncrementalIndexUpdater.js | 956 | Node/edge/prop update strategies |
| QueryController.js | 946 | Query dispatch, observer factory, content access |
| QueryBuilder.js | 852 | DSL construction vs execution |
| StreamingBitmapIndexBuilder.js | 835 | Build vs serialize |
| AuditVerifierService.js | 824 | Verification vs chain walking |
| InMemoryGraphAdapter.js | 815 | By operation family (mirrors GitGraphAdapter) |
| VisibleStateComparisonV5.js | 808 | Extract comparison algorithms |
| DagPathFinding.js | 705 | Algorithm families: shortest path, A*, bidirectional |
| VisibleStateTransferPlannerV5.js | 692 | Planning vs op generation |
| SyncController.js | 684 | Near limit; split if it grows during migration |
| SyncProtocol.js | 683 | Near limit; split if it grows during migration |
| seek.js (viz) | 672 | Render phases |
| ConflictCandidateCollector.js | 649 | Classification vs record building |
| StrandDescriptorStore.js | 643 | Normalization vs store operations |
| CheckpointService.js | 640 | Create vs reconstruct |
| ORSet.js | 624 | CRDT logic vs shim functions (shims deleted in migration) |
| BitmapIndexReader.js | 604 | Load vs query |
| StateReaderV5.js | 599 | Extract node/edge/prop readers |
| BoundaryTransitionRecord.js | 598 | Create/verify/replay/serialize are distinct concerns |
| LogicalIndexReader.js | 597 | Load vs query |
| LogicalTraversal.js | 590 | Facade can shrink once GraphTraversal is split |
| RefLayout.js | 576 | Constants vs builder functions vs validation |

### Configuration overhaul

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ESNext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "noEmit": true,
    "declaration": true,
    "declarationDir": "./dist/types",
    "emitDeclarationOnly": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "bin/**/*.ts", "scripts/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**package.json changes:**
- `"type": "module"` stays
- `"main"` → `"./index.ts"`
- `"exports"` conditions: `"types"` points to generated `.d.ts`,
  `"import"` points to `.ts` source
- Add `"scripts.build": "tsc --emitDeclarationOnly"` for declaration
  generation
- Remove `checkJs`/`allowJs`-related scripts
- Re-enable `no-unsafe-*` ESLint rules
- Add `max-lines` ESLint rule with thresholds

**jsr.json changes:**
- Exports point to `.ts` files
- Publish includes `.ts` source

**CI changes:**
- Gate 1 (tsc) becomes blocking again — it works now
- no-unsafe-* rules re-enabled in Gate 4
- Add `max-lines` gate

## Phasing

### Phase 0: Scaffolding
Config changes only. No file renames. Vitest, eslint, and tsconfig
configured to handle mixed `.js`/`.ts`. All existing tests still pass.

### Phase 1: Leaves first
Start with files that have no internal dependents:
- `src/domain/errors/` (28 files — trivial, one class each)
- `src/domain/types/` (25 files — already class-heavy)
- `src/domain/utils/` (28 files — small pure functions)
- `src/domain/crdt/` (5 files)
- `src/ports/` (19 files — become proper TS interfaces)

### Phase 2: Domain services
The bulk. 72 files in `src/domain/services/`. God objects split
during conversion. Each subdirectory is a slice:
- `strand/` (14 files)
- `controllers/` (10 files — god splits happen here)
- `state/` (7 files)
- `services/index/` (13 files)
- `services/query/` (5 files — GraphTraversal split here)
- `services/dag/` (4 files)
- remaining flat services

### Phase 3: Infrastructure
30 adapters implementing port interfaces with concrete types.
`GitGraphAdapter` and `InMemoryGraphAdapter` split by operation
family.

### Phase 4: CLI + Visualization
45 CLI files, 39 visualization files, 6 scripts, root entry points.

### Phase 5: Tests
422 test files. Lowest priority — vitest handles mixed `.js`/`.ts`.
Convert alongside source or as a dedicated cleanup pass.

### Phase 6: Publish pipeline
- Generate `.d.ts` declarations via `tsc --emitDeclarationOnly`
- Verify npm and JSR publish with `.ts` source
- Update release runbook
- Tag v17.0.0

## Playback Questions

1. Does `tsc --noEmit` pass with zero errors on all source files?
2. Does ESLint pass with `no-unsafe-*` re-enabled and zero suppressions?
3. Are there any `any`, `unknown`, or `as` in the source diff?
4. Is every source file under 500 LOC?
5. Do all three runtimes (Node, Bun, Deno) pass the test suite?
6. Does `npm pack --dry-run` produce a valid package with `.ts` source
   and `.d.ts` declarations?
7. Does the JSR publish dry-run pass?
8. Can a TypeScript consumer import and use the package with zero type
   errors?
