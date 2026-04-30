# 0104 Sludge Sleuth Screening and Survey

- Status: `hill met`
- Release lane: `v17.0.0`
- Source: `SLUDGE_sleuth-screening-and-survey`
- Design role: doc-only reconnaissance cycle
- Review audience: maintainers and future agents

## Hill

We know where the sludge is, how severe it is, and what order to attack
it in.

This is a screening and survey cycle. It does not fix production code,
rename files, move files, delete backlog cards, resume 0096, add the
anti-sludge hook, or push.

## Survey Scope

Checked:

- `src`
- `test`
- `bin`
- `index.ts`
- `browser.ts`
- package scripts and TypeScript/ESLint config surfaced by the required
  config scan
- top 20 largest TypeScript files by line count
- top source files over the 500 LOC source ceiling
- existing v17 and bad-code backlog cards related to the findings

Not checked:

- generated/vendor/build output, except config scan output that surfaced
  `node_modules` paths
- full semantic review of every file under `src`
- runtime behavior beyond currently passing validation gates
- full stale-doc inventory beyond backlog and release-card evidence

Evidence rule: every clean or dirty claim below is scoped to the scans
and manual inspections named in this document.

## Required Scans Run

```sh
rg -n "as unknown as|as any|\\bany\\b|\\bunknown\\b|Record<string, unknown>|\\bFunction\\b|Readonly<Uint8Array>|ReadonlySet|globalThis\\.Set|Object\\.create|\\bProxy\\b|JSON\\.parse|JSON\\.stringify|[A-Za-z0-9_]+Like\\b" src test bin index.ts browser.ts
find src test bin -type f \( -name "*.ts" -o -name "*.tsx" \) -print | while read f; do wc -l "$f"; done | sort -nr | head -50
rg -n "^(export\\s+default\\s+)?(export\\s+)?class\\s+" src test bin
rg -n "util|utils|helper|helpers|factory|Factory|manager|Manager|service|Service|controller|Controller" src test bin
rg -n "_[A-Za-z0-9_]+\\(|export type|export class|export function|export \\{" src index.ts browser.ts
rg -n "new [A-Z][A-Za-z0-9_]+\\(|static async open|constructor\\(|process\\.env|Date\\.now|new Date\\(|Math\\.random|fetch\\(" src
rg -n "Readonly<\\{|Array<\\{|Promise<\\{|Map<[^>]*\\{|readonly \\{|\\{[^\\n]*\\}\\[\\]" src test bin
cat package.json
find . -maxdepth 3 -name "*eslint*" -o -name "tsconfig*.json" -o -name ".eslintignore"
```

Additional compression scans were run to count matches per file and per
pattern so the survey records evidence rather than raw grep floods.

## Executive Sludge Rating

Rating: `ORANGE`

Meaning: release-risk sludge.

The codebase is not `BLACK`: there are strong gates, many explicit
runtime-backed concepts, recent snapshot API repair, and a now-green
consumer typecheck gate.

The codebase is not `GREEN` or `YELLOW`: the survey found a 894-line
`RuntimeHost`, seven source files over the 500 LOC source ceiling, 30
test files over the 800 LOC test ceiling, 714 candidate banned-pattern
hits in core/app/ports/index/browser files, public/internal seams via
underscore runtime methods, and several multi-runtime-object files.

The honest rating is ORANGE with RED pockets.

## Survey Metrics

- TypeScript source/bin files scanned: 490.
- TypeScript test files scanned: 503.
- Source files over 500 LOC: 7.
- Test files over 800 LOC: 30.
- Class declarations found: 307 across 279 files.
- Banned-pattern scan across `src test bin index.ts browser.ts`: 4,344
  matches across 539 files.
- Banned-pattern scan across `src/domain src/application src/ports
  index.ts browser.ts`: 714 matches across 149 files.

The 714 core/app/ports/index/browser matches are candidate sludge hits
that require triage; they are not all confirmed violations. For example,
some `unknown` hits may be valid true-boundary inputs, some
`ReadonlySet` hits may be private implementation detail, and some
`JSON.stringify` hits may be codec-adjacent. The survey is a map for
targeted inspection, not permission for regex whack-a-mole.

Core/app/ports/index/browser banned-pattern breakdown:

| Pattern | Count |
| --- | ---: |
| `unknown` | 387 |
| `Record<string, unknown>` | 124 |
| `OpLike` | 117 |
| `any` | 56 |
| `ReadonlySet` | 45 |
| `JSON.stringify` | 29 |
| `PatchLike` | 18 |
| `as unknown as` | 8 |
| `JSON.parse` | 6 |
| `ArrayLike` | 5 |
| `as any` | 3 |
| `WarpStateLike` | 3 |
| `IndexReaderLike` | 3 |
| `Object.create` | 2 |
| `Function` | 2 |
| `Readonly<Uint8Array>` | 1 |

Top core/app/ports/index/browser banned-pattern files:

| Matches | File |
| ---: | --- |
| 42 | `src/domain/services/OpStrategies.ts` |
| 30 | `src/domain/services/PatchHydrator.ts` |
| 27 | `src/domain/services/OpNormalizer.ts` |
| 24 | `src/domain/utils/parseStrandBlob.ts` |
| 23 | `src/domain/services/state/StateDiff.ts` |
| 19 | `src/domain/services/CoordinateFactExport.ts` |
| 17 | `src/domain/types/TickReceipt.ts` |
| 16 | `src/domain/services/comparison/diffStructure.ts` |
| 15 | `src/domain/services/VisibleStateScope.ts` |
| 14 | `src/domain/types/CoordinateComparison.ts` |

## Sludge Taxonomy

### God Objects / God Files

The strongest god-object signal is `src/domain/RuntimeHost.ts`:

- 894 LOC.
- 59 imports.
- 64 public/internal export/boundary-pattern hits.
- 32 DI-smell hits.
- dozens of mutable private-ish host fields.
- constructs and owns controller graph, caches, state, persistence,
  codecs, trust, materialization, query, patching, checkpointing,
  subscriptions, provenance, and effects.

Other source files over 500 LOC are not all gods, but they are too large
for the stated source ceiling:

- `src/domain/orset/trie/TrieCursor.ts` — 831 LOC.
- `src/domain/services/JoinReducerSession.ts` — 586 LOC.
- `src/domain/services/controllers/ComparisonSelector.ts` — 553 LOC.
- `src/domain/services/controllers/CheckpointController.ts` — 536 LOC.
- `src/domain/services/query/QueryRunner.ts` — 502 LOC.
- `src/domain/services/audit/AuditChainVerifier.ts` — 502 LOC.

### Multi-runtime-object Files

Files with multiple runtime classes:

- `src/domain/services/OpStrategies.ts` — 8 strategy classes.
- `src/domain/services/controllers/ComparisonSelector.ts` — 5
  selector/result classes plus many helpers.
- `src/domain/services/audit/AuditReceiptService.ts` — `AuditReceipt`
  and `AuditReceiptService` in one file.
- `src/domain/services/provenance/BTR.ts` — boundary transition record
  and verification result classes in one file.
- `src/domain/services/strand/ConflictFrameLoader.ts` — `PatchFrame`
  and `ScanWindow`.
- `src/domain/types/EffectEmission.ts` — `EffectCoordinate` and
  `EffectEmission`.
- `src/domain/services/ImmutableSnapshot.ts` — private map subclasses
  hidden inside a builder module.

Test-only multi-class files also exist, mostly mock fakes. They are
lower severity unless they hide fixture duplication.

### Type Theater

Core/app/ports/index/browser still contain many `unknown`,
`Record<string, unknown>`, and `*Like` hits. Some are boundary-local
decoder seams and may be valid. Others are in domain service files where
they likely represent missing nouns or unmodeled DTOs.

Hotspots:

- `src/domain/services/OpStrategies.ts`
- `src/domain/services/PatchHydrator.ts`
- `src/domain/services/OpNormalizer.ts`
- `src/domain/services/CoordinateFactExport.ts`
- `src/domain/services/VisibleStateScope.ts`
- `src/domain/types/CoordinateComparison.ts`

### Bag Types

Bag-model signals remain in controller and query surfaces:

- `RuntimeHost` has large option/result shapes and host fields.
- `PatchController` depends on `PatchHost`, a large host bag with
  internal `_` fields.
- `CheckpointController` depends on `CheckpointHost`, another large
  host bag.
- `ComparisonSelector` uses `ComparisonHost` with internal runtime
  methods and broad state/dependency access.
- `QueryRunner` defines several inline structural result/property
  shapes in one file.

### Cast Theater

Core/app/ports/index/browser scan found:

- 8 `as unknown as` matches.
- 3 `as any` matches.
- 56 `any` matches.

Test scans are much worse, with top offenders:

- `test/unit/domain/services/controllers/SyncController.test.ts`
- `test/unit/domain/services/PatchBuilder.test.ts`
- `test/unit/domain/services/JoinReducer.integration.test.ts`
- `test/unit/domain/WarpGraph.test.ts`
- `test/unit/domain/WarpGraph.coverageGaps.test.ts`

### Fake Immutability

Core/app/ports/index/browser scan still found:

- 45 `ReadonlySet` matches.
- 1 `Readonly<Uint8Array>` match.

These are not automatically bugs. Private collections and type-level
read surfaces require inspection. But after 0101/0102, any public
runtime immutability claim backed only by `Readonly<T>` is suspect.

### Public/Internal Boundary Leaks

Boundary scan hotspots:

- `src/domain/RuntimeHost.ts` — 64 matches.
- `src/domain/services/controllers/MaterializeController.ts` — 54
  matches.
- `src/domain/services/audit/AuditChainVerifier.ts` — 45 matches.
- `src/domain/services/strand/StrandPatchService.ts` — 41 matches.
- `src/domain/services/index/IncrementalIndexUpdater.ts` — 40 matches.

Specific leak patterns:

- `ComparisonSelector.ComparisonHost` exposes `_materializeCoordinateGraph`.
- `QueryRunner.QueryGraph` exposes `_materializeGraph`.
- `PatchController.PatchHost` exposes many `_host` internals.
- `CheckpointController.CheckpointHost` exposes `_materializeGraph` and
  many `_host` fields.
- `StrandPatchService.WarpRuntime` consumes many `_graph` internals.

These may be internal-only today, but the naming and type surfaces make
the seam fragile.

### DI Violations

DI is improving in places:

- `MaterializeController` has an explicit `MaterializeDeps` constructor
  object.
- Snapshot value objects are narrow and dependency-free.
- Ports exist for storage, crypto, codecs, logging, and checkpointing.

DI is still unhealthy in places:

- `RuntimeHost` constructs and owns most collaborators.
- `AuditVerifierService` constructs `TrustEvaluationService`.
- `IncrementalIndexUpdater` constructs `IndexNodeUpdater` and
  `IndexEdgeUpdater` and defaults to `defaultCodec`.
- `PatchController`, `CheckpointController`, `ComparisonSelector`, and
  `StrandPatchService` depend on host bags with private-ish fields.

### DRY Violations

Repeated inline shapes show missing nouns:

- `MaterializedState`/`MaterializedGraph` shapes are repeated across
  runtime, controllers, comparison, checkpoint, query, and tests.
- Property bag shapes are repeated, even after 0102 made snapshot bags
  more honest.
- Visible edge shapes repeat across consumer test, state reader, query,
  and CLI-facing projections.
- Test mock persistence and host shapes are repeated in large test
  files.

### Utility Corridors

`src/domain/utils` remains a mixed corridor. Some files are legitimate
concepts (`EventId`, `WriterId`, `bytes`). Others look like policy
hidden in utility modules:

- `RefLayout.ts` owns validation, layout constants, builders, and
  parsing in one 472 LOC file.
- `defaultCodec.ts`, `defaultCrypto.ts`, and `defaultBlobStorage.ts`
  are default dependency construction seams inside domain utils.
- `callInternalRuntimeMethod.ts` is an explicit internal seam escape
  hatch.

### Export Carpet

Package-root export carpet is improved but still a watch item.

0102 intentionally exported snapshot public return/input types because
public APIs return them. 0103 did not widen `index.ts`.

Root `index.ts` remains a broad public barrel. That may be a package
entrypoint requirement, but future cycles must not use it to hide stale
fixture expectations.

### Test Theater

The test suite has serious structural sludge:

- 30 test files over 800 LOC.
- Top test file is 2,845 LOC.
- Top 20 largest TypeScript files are all tests.
- Several test files contain dozens of `any`/cast-pattern hits.
- Some tests inspect private implementation details or use incomplete
  host bags.

There are also strong contract/conformance tests:

- snapshot API conformance tests from 0101/0102;
- consumer public API typecheck from 0103;
- boundary tripwires.

The problem is not “tests bad.” The problem is that some giant tests are
integration museums with private-shape fixtures.

### Ignored Tooling / False Confidence

`eslint.config.ts` globally ignores:

- `test/type-check/**`
- `test/runtime/**`
- `**/*.d.ts`
- `scripts/**`

This is not automatically wrong, but it means ESLint green is not a
whole-repo statement. Manual scans remain necessary for ignored
consumer/type declaration surfaces.

### Stale Docs / Backlog Drift

Backlog drift was already visible before this cycle:

- `docs/method/backlog/bad-code/README.md` counts were stale during the
  recent status pass.
- Several bad-code cards reference old `.js` names or historical file
  sizes.
- Existing cards already cover many of the patterns found here, but not
  all current file names and severities.

## Top Findings

### SS-0104-01 RuntimeHost Gravity Well

- Pattern name: god object / god file.
- Files: `src/domain/RuntimeHost.ts`.
- Evidence: 894 LOC, 59 imports, dozens of mutable host fields, 32
  DI-smell hits, 64 boundary-pattern hits.
- Why it is sludge: one runtime object owns persistence, controllers,
  caches, state, materialization, query, patching, checkpointing,
  subscriptions, provenance, trust, and effects.
- SOLID/DRY/DI impact: violates SRP and DIP; encourages host-bag
  coupling and duplicated controller seams.
- Runtime-object-per-file impact: one runtime object, but too many
  responsibilities in that object.
- Public API impact: high. Many public capability paths route through
  the host.
- Severity: P0.
- Recommended next cycle: `SLUDGE_host-bag-injection` /
  `PORT_runtime-helper-wrapper-seams`, starting with dependency seam
  extraction, not full rewrite.

### SS-0104-02 Internal Host Bags Leak Across Controllers

- Pattern name: public/internal boundary leak.
- Files: `PatchController.ts`, `CheckpointController.ts`,
  `ComparisonSelector.ts`, `QueryRunner.ts`, `StrandPatchService.ts`.
- Evidence: controller host types expose `_materializeGraph`,
  `_materializeCoordinateGraph`, `_persistence`, `_cachedState`, and
  other runtime internals.
- Why it is sludge: private-ish runtime seams become structural
  contracts and make controllers hard to move or test honestly.
- SOLID/DRY/DI impact: violates ISP and DIP; callers depend on broad
  host bags instead of narrow ports.
- Runtime-object-per-file impact: not a class-count violation, but it
  spreads RuntimeHost responsibilities into peer files.
- Public API impact: medium to high if any internal surface leaks to
  consumer-facing types.
- Severity: P0.
- Recommended next cycle: split narrow controller ports by behavior.

### SS-0104-03 Test Gods Are Hiding Fixture Sludge

- Pattern name: god tests / fixture museums.
- Files: top offenders include `StrandService.test.ts`,
  `WarpGraph.test.ts`, `ConflictAnalyzerService.test.ts`,
  `JoinReducer.integration.test.ts`, `PatchBuilder.test.ts`,
  `SyncController.test.ts`.
- Evidence: 30 test files over 800 LOC; top file is 2,845 LOC; multiple
  top files have 70+ banned-pattern hits.
- Why it is sludge: large tests accumulate repeated host fakes, private
  field access, fixture DSL drift, and implementation assertions.
- SOLID/DRY/DI impact: test code repeats shapes instead of naming
  fixture ports/builders; weakens refactor confidence.
- Runtime-object-per-file impact: test helper classes and fakes are
  spread through giant files.
- Public API impact: indirect but high for refactor safety.
- Severity: P1.
- Recommended next cycle: `SPEC_test-gods-30-over-800` and
  `SPEC_test-helper-overlap`.

### SS-0104-04 Multi-runtime-object Source Files

- Pattern name: multiple runtime objects per file.
- Files: `OpStrategies.ts`, `ComparisonSelector.ts`,
  `AuditReceiptService.ts`, `BTR.ts`, `ConflictFrameLoader.ts`,
  `EffectEmission.ts`, `ImmutableSnapshot.ts`.
- Evidence: class-per-file scan found multiple classes in each.
- Why it is sludge: hidden peer concepts make ownership blurry and make
  files grow into local frameworks.
- SOLID/DRY/DI impact: SRP and OCP pressure; changes to one runtime
  concept risk unrelated peers.
- Runtime-object-per-file impact: direct violation.
- Public API impact: medium where exported classes share files.
- Severity: P1.
- Recommended next cycle: split by runtime object, starting with the
  files that also have public API or high churn.

### SS-0104-05 Core Type Theater Still Exists

- Pattern name: unknown / bag / `*Like` residues.
- Files: `OpStrategies.ts`, `PatchHydrator.ts`, `OpNormalizer.ts`,
  `CoordinateFactExport.ts`, `VisibleStateScope.ts`,
  `CoordinateComparison.ts`, plus others.
- Evidence: 714 core/app/ports/index/browser candidate banned-pattern hits;
  top breakdown includes 387 `unknown`, 124 `Record<string, unknown>`,
  and 146 `*Like` style matches.
- Why it is sludge: the count is a triage queue, not automatic guilt.
  Some hits may be boundary-local or private implementation detail, but
  the volume indicates likely unmodeled DTOs and domain nouns.
- SOLID/DRY/DI impact: weakens contracts and moves validation into
  helper logic.
- Runtime-object-per-file impact: unclear until per-file cycles.
- Public API impact: medium; coordinate and visible-state shapes are
  often user-facing.
- Severity: P1.
- Recommended next cycle: group by root-cause family, not a blanket
  0096 pass.

### SS-0104-06 Source Files Over Ceiling

- Pattern name: source god-file watchlist.
- Files: seven source files over 500 LOC listed below.
- Evidence: size scan.
- Why it is sludge: over-ceiling files hide multiple responsibilities
  even when class count is one.
- SOLID/DRY/DI impact: SRP pressure and review fatigue.
- Runtime-object-per-file impact: some direct, some responsibility
  bloat.
- Public API impact: varies.
- Severity: P1.
- Recommended next cycle: choose one over-ceiling file with clear owner
  boundaries; do not split mechanically.

### SS-0104-07 Utility Corridor Policy Leakage

- Pattern name: utility corridor.
- Files: `src/domain/utils/RefLayout.ts`, `defaultCodec.ts`,
  `defaultCrypto.ts`, `callInternalRuntimeMethod.ts`, others.
- Evidence: utility/helper/factory scan and manual inspection.
- Why it is sludge: domain policy and default dependency construction
  hide under `utils`.
- SOLID/DRY/DI impact: hides ownership and weakens DI.
- Runtime-object-per-file impact: mixed utility responsibilities rather
  than object count.
- Public API impact: medium; refs and IDs are protocol-critical.
- Severity: P2.
- Recommended next cycle: rename/extract by domain noun only when a
  concrete owner is selected.

### SS-0104-08 Ignored Lint Surfaces Need Manual Gates

- Pattern name: false confidence through ignored files.
- Files: `eslint.config.ts`, `test/type-check/**`, `**/*.d.ts`,
  `test/runtime/**`, `scripts/**`.
- Evidence: config scan and recent 0103 manual scan requirement.
- Why it is sludge: “ESLint passed” can overclaim if key public API
  files are ignored.
- SOLID/DRY/DI impact: process risk, not direct object-model risk.
- Runtime-object-per-file impact: not checked by ESLint for ignored
  files.
- Public API impact: high for consumer type-check files.
- Severity: P2.
- Recommended next cycle: tooling hardening slice after this survey.

## Top 20 Largest Files Review

| File | Lines | Primary responsibility | Secondary responsibilities | Runtime objects | Severity | Recommendation |
| --- | ---: | --- | --- | ---: | --- | --- |
| `test/unit/domain/services/strand/StrandService.test.ts` | 2845 | Strand service behavior tests | descriptor mocks, graph fakes, intent queues, private access | 0 | P1 | Split by strand behavior and extract named test fixtures. |
| `test/unit/domain/WarpGraph.test.ts` | 2213 | WarpCore integration behavior | persistence mocks, patch factories, materialization assertions | 0 | P1 | Split by capability surface and replace `any` mock persistence. |
| `test/unit/domain/services/strand/ConflictAnalyzerService.test.ts` | 2016 | conflict analyzer tests | graph fakes, fixture generation, classification constants | 0 | P1 | Split by conflict category and name fixture builders. |
| `test/unit/domain/services/CheckpointService.test.ts` | 1539 | checkpoint behavior tests | persistence fakes, state setup, error paths | 0 | P1 | Split checkpoint create/load/cache concerns. |
| `test/unit/domain/WarpGraph.strands.test.ts` | 1432 | strand foundation integration | runtime private shape, persistence mocks | 0 | P1 | Split by public strand use case and avoid runtime private aliases. |
| `test/unit/domain/services/JoinReducer.integration.test.ts` | 1423 | reducer integration invariants | random generation, migration, permutation, compaction | 0 | P1 | Extract fixture generators and replace `any` patch builders. |
| `test/unit/domain/services/CommitDagTraversalService.test.ts` | 1413 | commit DAG traversal tests | index reader fakes, traversal scenarios | 0 | P2 | Split scenario groups; keep as contract tests. |
| `test/unit/domain/services/PatchBuilder.test.ts` | 1353 | PatchBuilder behavior | persistence mocks, private assertions, op-shape checks | 0 | P1 | Split by builder capability and remove private-shape `any` assertions. |
| `test/unit/domain/services/controllers/PatchController.test.ts` | 1261 | PatchController tests | host fakes, persistence fakes, cached-state setup | 0 | P1 | Replace broad host fake with named port fixtures. |
| `test/unit/domain/services/AuditVerifierService.test.ts` | 1257 | audit verifier tests | trust fakes, mutation helpers, storage paths | 0 | P2 | Split by audit chain, trust, and storage failure surfaces. |
| `test/unit/domain/WarpGraph.coverageGaps.test.ts` | 1233 | WarpCore coverage gaps | persistence mocks, materialization edge cases | 0 | P2 | Fold valid scenarios into capability-specific tests. |
| `test/unit/domain/services/controllers/SyncController.test.ts` | 1232 | SyncController tests | host fakes, response builders, direct-peer mocks | 0 | P1 | Replace `Record<string, unknown>` host override bag with named fixtures. |
| `test/unit/domain/services/GraphTraversal.test.ts` | 1049 | graph traversal contract tests | provider builders, hook/stats tests, private helper coverage | 0 | P2 | Keep contract groups; move private-helper tests to public behavior. |
| `test/unit/domain/services/controllers/ComparisonController.test.ts` | 1006 | comparison controller tests | state builders, patch entries, host fakes | 0 | P2 | Extract comparison fixture objects. |
| `test/unit/domain/services/JoinReducer.test.ts` | 995 | reducer unit behavior | patch factory helpers, op setup | 0 | P2 | Replace `any` patch inputs with typed builders. |
| `test/unit/domain/services/SyncAuthService.test.ts` | 976 | sync auth behavior | metrics, nonce ordering, constructor modes | 0 | P2 | Split by public method; replace option bags. |
| `test/unit/domain/services/CheckpointService.edgeCases.test.ts` | 975 | checkpoint edge cases | persistence fakes, schema paths | 0 | P2 | Merge or split around checkpoint invariants. |
| `test/unit/domain/services/MigrationService.test.ts` | 967 | migration behavior | v1/v2 factories, v4 state builders, reducer helpers | 0 | P1 | Extract migration fixture builders and remove `any` patch factories. |
| `test/unit/domain/services/WormholeService.test.ts` | 966 | wormhole behavior | persistence setup, compression paths | 0 | P2 | Split create/compose/replay/serialize surfaces. |
| `test/unit/domain/services/SyncController.test.ts` | 951 | legacy sync controller tests | host fakes, response bags | 0 | P1 | De-duplicate with controller sync tests and replace broad host fakes. |

## Source Files Over 500 LOC

| File | Lines | Responsibilities observed | Runtime objects | Severity | Recommendation |
| --- | ---: | --- | ---: | --- | --- |
| `src/domain/RuntimeHost.ts` | 894 | runtime composition, state, controllers, caches, materialization, query, patching, trust, effects | 1 | P0 | Decompose by explicit ports/factories; do not feed it. |
| `src/domain/orset/trie/TrieCursor.ts` | 831 | trie mutation cursor, leaf split/merge, tombstones, lookup helpers | 1 | P1 | Extract route/leaf transition collaborators if behavior seams are stable. |
| `src/domain/services/JoinReducerSession.ts` | 586 | session reducer frame, patch folding, property snapshots, receipts | 1 | P1 | Separate patch folding, receipt mapping, and prop merge logic. |
| `src/domain/services/controllers/ComparisonSelector.ts` | 553 | selector classes, frontier normalization, materialization, strand metadata | 5 | P1 | Split selector runtime classes and frontier helpers. |
| `src/domain/services/controllers/CheckpointController.ts` | 536 | checkpoint create/load/GC/cache coverage, host bag access | 1 | P1 | Split checkpoint cache/storage/GC seams by port. |
| `src/domain/services/query/QueryRunner.ts` | 502 | query pipeline, traversal, projection, aggregation | 1 | P1 | Extract projection/aggregation/traversal executors. |
| `src/domain/services/audit/AuditChainVerifier.ts` | 502 | audit receipt schema, chain walking, data verification | 1 | P2 | Split schema validation from chain walking if touched. |

## One Runtime Object Per File Violations

Doctrine clarification: one public/runtime domain object per file is
the default. Private implementation helper classes are allowed only when
they are local, non-exported, sealed by the owning module, and do not
carry independent domain ownership. Do not split files mechanically into
file confetti.

High-priority source violations:

- `src/domain/services/OpStrategies.ts` — 8 strategy classes in one
  file.
- `src/domain/services/controllers/ComparisonSelector.ts` — 5 runtime
  selector/result classes in one file.
- `src/domain/services/audit/AuditReceiptService.ts` — value object and
  service in one file.
- `src/domain/services/provenance/BTR.ts` — record and verification
  result in one file.
- `src/domain/services/strand/ConflictFrameLoader.ts` — frame and scan
  window classes in one file.
- `src/domain/types/EffectEmission.ts` — coordinate and emission classes
  in one file.
- `src/domain/services/ImmutableSnapshot.ts` — internal map subclasses
  hidden inside builder module.

Lower-priority test/helper violations:

- `test/helpers/trieHelpers.ts` — three trie store fakes in one file.
- Several adapter tests define multiple local fakes. That is tolerable
  only when the fakes are test-local and not repeated elsewhere.

## NO GODS Watchlist

- `src/domain/RuntimeHost.ts` — P0. Current central gravity well.
- `src/domain/services/controllers/CheckpointController.ts` — P1. Too
  much checkpoint lifecycle plus cache and GC coordination.
- `src/domain/services/controllers/MaterializeController.ts` — P1.
  Better DI than RuntimeHost, but still broad replay/cache/provenance
  behavior.
- `src/domain/services/query/QueryRunner.ts` — P1. Query execution,
  traversal, projection, and aggregation in one file.
- `src/domain/services/controllers/ComparisonSelector.ts` — P1. Selector
  class family plus frontier and state summarization helpers.
- `src/domain/orset/trie/TrieCursor.ts` — P1. Large mutation cursor with
  many helper paths.
- `src/domain/services/JoinReducerSession.ts` — P1. Reducer session
  owns fold, merge, receipts, and property normalization.
- `src/domain/services/strand/StrandPatchService.ts` — P1/P2. It uses a
  broad `WarpRuntime` private-field seam and owns patch builder/intent
  commit logic.

## DI Health

Good DI:

- `MaterializeController` accepts `MaterializeDeps`.
- Snapshot value classes are narrow and dependency-free.
- Ports exist for crypto, codec, persistence, logging, checkpoints,
  patch journals, and storage.
- 0102 moved public snapshot values away from storage/live types.

Weak or fake DI:

- `RuntimeHost` constructs the controller graph and carries most
  dependencies.
- Host bags expose internal fields instead of narrow behavior ports.
- Several services default to concrete domain utilities such as
  `defaultCodec`, `defaultCrypto`, or internal constructors.
- `StrandPatchService` takes a `WarpRuntime` shape instead of explicit
  ports.
- `AuditVerifierService` constructs `TrustEvaluationService` directly.

## DRY Health

Good DRY:

- Snapshot API now has named concepts rather than repeated byte shapes.
- Some controller helper files already exist for materialization and
  query reads.

Weak DRY:

- Repeated `MaterializedState`/`MaterializedGraph` shapes.
- Repeated snapshot property bag and visible edge shapes.
- Repeated host fake shapes in tests.
- Repeated validation and canonical JSON sorting helpers.
- Repeated patch factories in tests.

Do not fix this by creating a helper landfill. Each repeated shape needs
an owner.

## Public API Boundary Health

Crisp boundaries:

- Public snapshot APIs now expose `SnapshotWarpState`,
  `SnapshotPropValue`, `ImmutableBytes`, `SnapshotORSet`, and
  `SnapshotVersionVector`.
- `npm run typecheck:consumer` now passes against current package-root
  public API smoke coverage.

Leaky boundaries:

- Internal runtime methods with `_` names appear in structural types.
- `callInternalRuntimeMethod.ts` exists as an explicit escape hatch.
- Root `index.ts` is a large package barrel and needs discipline to
  avoid export carpet.
- Some domain services still expose or accept storage/live shapes where
  read-side or boundary DTOs may be more honest.

## Test Health

Contract-test strengths:

- Snapshot conformance tests enforce runtime immutability behavior.
- Consumer typecheck verifies current package-root type surface.
- Boundary tripwires exist for codec and snapshot regressions.

Test sludge:

- 30 test files over 800 LOC.
- Many tests use `as any`, `any[]`, broad host bags, private-field
  access, or repeated fixture factories.
- Some test files are coverage museums rather than contract-focused
  suites.
- `test/type-check/**` is ESLint-ignored, so manual scans remain
  required for that public API gate.

## Release Risk

Release-blocking or release-confidence sludge:

- P0 RuntimeHost/host-bag seam if new public API changes must pass
  through it.
- Public/internal boundary leak risk around `_materializeGraph` and
  related runtime seams.
- Consumer gate is now green, but package API notes remain for 0102
  snapshot return type changes.
- Test gods reduce confidence in safe refactors because fixtures encode
  private implementation shapes.

Structural debt but not immediate release blocker:

- Multi-runtime-object files that are stable and not actively changing.
- Utility corridor cleanup where no active bug is tied to the file.
- Source files just over 500 LOC with clean ownership.

Merely ugly unless touched:

- Test-local mock classes in one file.
- Private helper functions in large files where ownership is clear and
  no public/internal seam leaks.

## Recommended Attack Order

1. MUST — blocks trust/release:

   - Close release/API-note debt for 0102 public snapshot return types.
   - Attack `RuntimeHost` host-bag seams by extracting narrow ports from
     one controller path at a time.
   - Remove or replace public/internal runtime method seams used by
     `QueryRunner`, `ComparisonSelector`, `CheckpointController`, and
     `PatchController`.
   - Keep `npm run typecheck:consumer` green as a release gate.

2. SHOULD — structural paydown:

   - Split `ComparisonSelector.ts` by selector runtime object.
   - Split `AuditReceipt` out of `AuditReceiptService.ts`.
   - Split `OpStrategies.ts` into one strategy class per file or
     replace the strategy family with an honest operation-owned model.
   - Decompose the top test gods by capability and shared fixture nouns.
   - Replace repeated inline materialized graph/state shapes with named
     seam models owned by their boundary.

3. COULD — cleanup/hardening:

   - Add the staged anti-sludge pre-commit hook.
   - Refresh stale backlog counts and old `.js` references.
   - Add a script that reports source/test LOC ceiling violations.
   - Add a manual-scan script for ESLint-ignored public API surfaces.

4. DO NOT — tempting but wrong right now:

   - Do not resume all of 0096 as one blob.
   - Do not mechanically split files without choosing ownership.
   - Do not create `helpers`, `utils`, `manager`, or `factory` junk
     drawers to reduce line counts.
   - Do not widen `index.ts` to satisfy stale tests.
   - Do not convert private implementation collections into fake public
     immutability claims.

## Backlog Mapping

Existing cards that map to survey findings:

- `docs/method/backlog/v17.0.0/SLUDGE_host-bag-injection.md`
- `docs/method/backlog/v17.0.0/PORT_runtime-helper-wrapper-seams.md`
- `docs/method/backlog/v17.0.0/TS_wave-09-gods-and-monsters.md`
- `docs/method/backlog/v17.0.0/GOD_materialize-controller.md`
- `docs/method/backlog/v17.0.0/GOD_query-controller.md`
- `docs/method/backlog/v17.0.0/GOD_strand-service.md`
- `docs/method/backlog/bad-code/OWN_materialize-controller-god-object.md`
- `docs/method/backlog/bad-code/OWN_conflict-analyzer-god-object.md`
- `docs/method/backlog/bad-code/OWN_checkpoint-controller-mixed-concerns.md`
- `docs/method/backlog/bad-code/OWN_warpruntime-delegation-dry.md`
- `docs/method/backlog/bad-code/MODEL_incremental-index-updater-shape-sludge.md`
- `docs/method/backlog/bad-code/CAST_call-internal-runtime-method.md`
- `docs/method/backlog/bad-code/CAST_worldline-detached-double-cast.md`
- `docs/method/backlog/bad-code/SPEC_test-gods-30-over-800.md`
- `docs/method/backlog/bad-code/SPEC_test-helper-overlap.md`
- `docs/method/backlog/bad-code/SPEC_js-test-typecheck-drift.md`
- `docs/method/backlog/bad-code/IDX_property-reader-capability-port.md`

No new backlog cards were created during this survey.

Potential card names if maintainers decide the survey needs narrower
follow-ups:

- `SLUDGE_runtimehost-controller-port-seams`
- `SPEC_test-god-fixture-decomposition`
- `OWN_multi-runtime-object-files`
- `DX_ignored-tooling-manual-scan-gate`

## Playback / Decision Note

The survey is accepted as a screening map, not an implementation plan.
Its raw grep counts are candidate sludge hits requiring triage; they are
not all confirmed violations and must not be converted into regex
whack-a-mole.

The next implementation cycle must target exactly one seam. Do not start
"fix `RuntimeHost`," do not resume broad 0096, do not attempt a
god-object rewrite, and do not create helper landfills.

Recommended next PULL:

```txt
SLUDGE_runtimehost-controller-port-seam-one
```

Goal: pick exactly one `RuntimeHost`/controller host-bag seam and design
the first extraction.

Candidate seams:

- `QueryRunner` / `_materializeGraph`
- `ComparisonSelector` / `_materializeCoordinateGraph`
- `CheckpointController` / `_materializeGraph`
- `PatchController` / `_cachedState` / `_persistence` host bag

Preferred first target: `QueryRunner` / `_materializeGraph`, because it
appears smaller than patch/checkpoint seams and is near the 0102
snapshot API workstream. The expected shape is a narrow
`QueryMaterializationPort` or equivalent explicit seam, not a general
runtime facade.

## Cycle End

0104 is hill met as a doc-only screening and survey cycle. It produced
a sludge map, not an implementation fix.

Closeout confirmations:

- The codebase sludge rating is `ORANGE` with RED pockets.
- Raw grep counts are candidate sludge hits, not automatic violations.
- The next implementation cycle must target exactly one seam.
- The preferred first seam is `QueryRunner` / `_materializeGraph`.
- The likely model is a narrow `QueryMaterializationPort` or equivalent
  explicit seam.
- The cycle did not edit production code.
- The cycle did not create backlog cards.
- The cycle did not resume 0096.
- The cycle did not add the anti-sludge hook.
- The cycle did not mechanically split files.

Doctrine for the next implementation cycle:

- SOLID: each object or module needs one reason to change.
- DRY: do not repeat structural seam shapes; name the concept once.
- DI: dependencies enter through explicit ports, not host bags or hidden
  runtime access.
- One public/runtime domain object per file by default.
- NO GODS: no `RuntimeHost` mega-rewrite, no new god facade, and no
  helper landfill.

## Validation

Required validation for this doc-only survey:

```sh
npm run typecheck
npm run lint:sludge
git diff --check
npx markdownlint docs/design/0104-sludge-sleuth-screening-and-survey.md
```

Results are recorded after validation in the final turn report.

## SLUDGE STRIKER SUMMARY

### 1. Sludge Encountered

- Pattern: `RuntimeHost` gravity well.
  Files: `src/domain/RuntimeHost.ts`.
  Why it is sludge: one object owns too many subsystem dependencies and
  lifecycle responsibilities.
  Status: surveyed, not fixed.
- Pattern: internal host-bag seams.
  Files: `PatchController.ts`, `CheckpointController.ts`,
  `ComparisonSelector.ts`, `QueryRunner.ts`, `StrandPatchService.ts`.
  Why it is sludge: broad private-ish fields and underscore methods act
  as hidden dependency contracts.
  Status: surveyed, not fixed.
- Pattern: test gods.
  Files: top 20 largest test files listed above.
  Why it is sludge: large tests hide repeated fixture shapes, private
  access, and implementation-coupled assertions.
  Status: surveyed, not fixed.
- Pattern: multi-runtime-object files.
  Files: `OpStrategies.ts`, `ComparisonSelector.ts`,
  `AuditReceiptService.ts`, `BTR.ts`, `ConflictFrameLoader.ts`,
  `EffectEmission.ts`, `ImmutableSnapshot.ts`.
  Why it is sludge: multiple runtime concepts share ownership and
  change pressure.
  Status: surveyed, not fixed.
- Pattern: type theater and bag residues.
  Files: top banned-pattern files listed above.
  Why it is sludge: high candidate counts of `unknown`,
  `Record<string, unknown>`, and `*Like` indicate likely unmodeled
  boundaries or missing domain nouns, but every hit still needs triage.
  Status: surveyed, not fixed.

### 2. Sludge Fixed

No production sludge was fixed in this cycle. That was deliberate.

This cycle fixed process ambiguity by replacing ticket-count burndown
with an evidence-scoped codebase sludge map.

### 3. Sludge Rejected

- Did not edit production code.
- Did not pull another v17 implementation ticket.
- Did not resume 0096.
- Did not add the pre-commit hook.
- Did not create new backlog cards.
- Did not mechanically split or rename files.
- Did not claim clean surfaces beyond the scans and manual inspections.

### 4. Sludge Deferred / Tracked

Deferred/tracked by existing cards:

- Runtime host and helper seams: `SLUDGE_host-bag-injection`,
  `PORT_runtime-helper-wrapper-seams`.
- God files and controller bloat: `TS_wave-09-gods-and-monsters`,
  `GOD_materialize-controller`, `GOD_query-controller`,
  `GOD_strand-service`.
- Test gods and fixture overlap: `SPEC_test-gods-30-over-800`,
  `SPEC_test-helper-overlap`.
- Internal method escape hatches:
  `CAST_call-internal-runtime-method`.
- Incremental index shape sludge:
  `MODEL_incremental-index-updater-shape-sludge`.

### 5. Anti-Sludge Checks Actually Run

- Broad banned-pattern scan over `src test bin index.ts browser.ts`.
- Size scan over `src test bin`.
- Class-per-file scan over `src test bin`.
- Utility/helper/factory/manager scan over `src test bin`.
- Public/internal boundary scan over `src index.ts browser.ts`.
- DI smell scan over `src`.
- Repeated inline type scan over `src test bin`.
- Tooling/config scan via `package.json`, ESLint config, and tsconfig
  files.
- `npm run typecheck` passed.
- `npm run lint:sludge` passed.
- `git diff --check` passed.
- `npx markdownlint
  docs/design/0104-sludge-sleuth-screening-and-survey.md` passed.

### 6. Remaining Risk

Remaining risk: this survey is a screening map, not a cure. It
identifies the highest-risk structural sludge but does not prove every
file clean and does not perform line-by-line semantic review of the
entire codebase.
