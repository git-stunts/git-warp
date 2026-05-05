# 0108 Large Graph Fixture Runtime Validation

- Status: `GREEN`
- Release lane: `v17.0.0`
- Source: `v17_large-graph-fixture-runtime-validation`
- Design role: concrete fixture validation
- Review audience: maintainers and future agents

## Hill

Make the large graph fixture at `~/.think/codex` executable as a
read-only release validation probe.

This is not a materialization fix, not a query architecture fix, and not
proof that the v16 full-buffering blocker is resolved.

## Fixture

Fixture path:

```txt
/Users/james/.think/codex
```

Read-only fixture facts:

- Repository size: `317M`.
- Git object count: `41,432` loose objects.
- WARP graph name: `think`.
- WARP refs:
  - `refs/warp/think/checkpoints/head`
  - `refs/warp/think/writers/local.jamess-macbook-pro-2.local.cli`

## RED Witness

Least-invasive probe:

```sh
/usr/bin/time -l node bin/warp-graph.ts info \
  --repo /Users/james/.think/codex \
  --graph think \
  --json
```

RED result before repair: failed before graph discovery.

Failure:

```txt
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
src/domain/services/state/StateReader.js
imported from src/domain/services/controllers/ComparisonEngine.ts
```

This exposed a release execution-path bug before it exposed the
large-graph memory behavior.

## Runtime Model Inspection

The project currently uses a source-first TypeScript runtime model:

- `package.json` has `"type": "module"`.
- `package.json` package exports point at `.ts` files.
- `package.json` bin entry `warp-graph` points at `./bin/warp-graph.ts`.
- `bin/git-warp` executes `bin/warp-graph.ts` directly when present.
- `tsconfig.base.json` uses `module: "NodeNext"`,
  `moduleResolution: "NodeNext"`, `noEmit: true`, and
  `allowImportingTsExtensions: true`.

Therefore the smallest release-safe fix is not blindly changing imports
because `.js` is always wrong. The fix is to make internal source imports
match the current direct `.ts` execution model.

Confirmed stale internal relative `.js` source imports:

- `src/domain/services/controllers/ComparisonEngine.ts`
- `src/domain/services/comparison/VisibleStateComparison.ts`
- `src/domain/services/controllers/StrandController.ts`
- `src/domain/services/controllers/ForkController.ts`

Package imports such as `@noble/hashes/blake3.js` remain valid package
specifier imports and were not changed.

## GREEN Witness

Implementation:

- Replaced internal relative source import
  `../state/StateReader.js` with `../state/StateReader.ts` in
  `ComparisonEngine.ts`.
- Replaced internal relative source import
  `../state/StateReader.js` with `../state/StateReader.ts` in
  `VisibleStateComparison.ts`.
- Replaced type-only internal relative source import
  `../PatchBuilder.js` with `../PatchBuilder.ts` in
  `StrandController.ts`.
- Replaced internal relative source import `../WormholeService.js` with
  `../WormholeService.ts` in `ForkController.ts`.

Read-only probe after repair:

```sh
/usr/bin/time -l node bin/warp-graph.ts info \
  --repo /Users/james/.think/codex \
  --graph think \
  --json
```

Result:

- Command passed.
- Graph `think` was discovered.
- Writer count: `1`.
- Checkpoint ref resolved.
- Maximum resident set size reported by `/usr/bin/time -l`:
  `136642560` bytes on the final validation run.

This proves the CLI source-runtime path can execute the read-only
fixture-discovery probe. It does not prove large-graph materialization or
bounded-residency query behavior.

## Validation

Validation commands:

```sh
rg -n "from ['\"]\\.\\.?/.+\\.js['\"]|import\\(['\"]\\.\\.?/.+\\.js['\"]\\)" \
  src bin scripts index.ts browser.ts
/usr/bin/time -l node bin/warp-graph.ts info \
  --repo /Users/james/.think/codex \
  --graph think \
  --json
npm run typecheck
npm run typecheck:consumer
npm run lint:sludge
npx eslint src/domain/services/controllers/ComparisonEngine.ts \
  src/domain/services/comparison/VisibleStateComparison.ts \
  src/domain/services/controllers/StrandController.ts \
  src/domain/services/controllers/ForkController.ts
npx vitest run test/unit/domain/services/controllers/ComparisonController.test.ts \
  test/unit/domain/WarpGraph.strands.test.ts
npx markdownlint docs/design/0107-v17-reality-check.md \
  docs/design/0108-large-graph-fixture-runtime-validation.md
git diff --check
```

Results:

- Relative internal `.js` source import scan found no matches.
- Read-only fixture probe passed.
- `npm run typecheck` passed.
- `npm run typecheck:consumer` passed.
- `npm run lint:sludge` passed.
- ESLint on touched TypeScript files passed.
- Targeted tests passed: `2` files, `87` tests.
- Markdownlint passed.
- `git diff --check` passed.

## Non-Goals

- Do not touch materialization.
- Do not touch query architecture.
- Do not run mutating commands against `/Users/james/.think/codex`.
- Do not claim the v16 full-buffering blocker is fixed.
- Do not change package exports.
- Do not add a build pipeline.
- Do not switch the project to emitted JavaScript imports.

## Next Validation

The next blocker is the actual product question:

```txt
Can v17 open and query the concrete large graph without reproducing the
v16 full-buffering failure?
```

That requires a separate bounded-residency validation using the fixture.
Use a disposable copy for mutating commands such as `materialize`, because
those commands may create checkpoints or other WARP refs.

## SLUDGE STRIKER SUMMARY

### 1. Sludge Encountered

- Pattern: source-runtime import mismatch.
  Files:
  `src/domain/services/controllers/ComparisonEngine.ts`,
  `src/domain/services/comparison/VisibleStateComparison.ts`,
  `src/domain/services/controllers/StrandController.ts`,
  `src/domain/services/controllers/ForkController.ts`.
  Why it was sludge: direct TypeScript execution loaded source files, but
  some internal relative imports still targeted emitted `.js` paths.
  Status: fixed.
- Pattern: fixture gate missing.
  Files: release validation process.
  Why it is sludge: v17's large-graph claim needs a concrete graph, not
  seam-level inference.
  Status: fixture identified and first read-only probe running.

### 2. Sludge Fixed

- Replaced four stale internal relative `.js` source imports with `.ts`
  imports that match the current source-first runtime model.
- Replaced a failing module-load probe with a passing read-only graph
  discovery probe against `/Users/james/.think/codex`.

### 3. Sludge Rejected

- Rejected blindly changing arbitrary `.js` imports without checking the
  runtime model.
- Rejected touching package specifier imports.
- Rejected materialization changes.
- Rejected query architecture changes.
- Rejected claiming bounded residency from a read-only `info` probe.

### 4. Sludge Deferred / Tracked

- Large-graph bounded-residency load/query validation remains open.
- The v16 full-buffering blocker remains unproven.
- Mutating fixture validation must use a disposable copy.

### 5. Anti-Sludge Checks Actually Run

- Inspected `package.json`.
- Inspected `tsconfig.base.json`, `tsconfig.src.json`, and
  `tsconfig.test.json`.
- Searched internal source `.js` imports.
- Ran the read-only fixture probe before repair and captured the module
  failure.
- Ran the read-only fixture probe after repair and captured successful
  graph discovery.
- `npm run typecheck` passed.
- `npm run typecheck:consumer` passed.
- `npm run lint:sludge` passed.
- ESLint on touched TypeScript files passed.
- Targeted tests passed: `2` files, `87` tests.
- Markdownlint and `git diff --check` passed.

### 6. Remaining Risk

Remaining risk: this cycle fixed the execution-path blocker for the
read-only `info` probe only. The actual v16 blocker remains until v17 can
load and query the concrete large graph with bounded-residency evidence.
