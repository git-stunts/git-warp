# BEARING

Updated at cycle boundaries. Keep this file as a live signpost, not a
warehouse for completed slice history.

Completed v18 slice history through slice 112 is summarized in
[0146-bearing-v18-completed-rotation](method/retro/0146-bearing-v18-completed-rotation/bearing-v18-completed-rotation.md).

Scope note:

- `BEARING` says where the repo stands now, what feels wrong now, and what is
  next.
- For canonical noun meanings, use [GLOSSARY.md](GLOSSARY.md).
- For the runtime architecture ladder, use
  [0035-observer-geometry-architecture-ladder.md](design/0035-observer-geometry-architecture-ladder.md).
- For later-major horizon planning, use
  [release-horizon-v20-v21.md](design/release-horizon-v20-v21.md).

## Continuum Optic Admission Posture

For cross-repo optic admission, git-warp is a complete Continuum participant.
Continuum is the protocol for exchanging witnessed causal history. Wesley
compiles artifacts and descriptors, Echo admits Echo-local runtime
invocations, git-warp admits git-warp-local causal history and readings,
authority layers issue grants, and applications hide handles and basis
references behind product adapters.

Continuum-shaped values are not automatically Continuum-native witnesses.
Until native witnesshood is proven, git-warp evidence that is shaped for
Continuum remains translated git-warp evidence.

## Worldline/Optic Public API Posture

The Worldline-first public API pivot has landed, but it uncovered a release
truth: Optics are part of the v18 public-facing value proposition, so exposing
`events.optic()` is not enough. V18 must not ship until the Optics first-use
path is product-complete enough to exercise, document, and recover.

- Worldlines are now the first-use public API story.
- Coordinate-backed Optics are implemented through `prepareOpticBasis()`,
  `coordinate()`, and `coordinate.optic()`. PR #574 removes the direct
  `prepareOpticBasis()` materialization/checkpoint-creation footgun, but this
  evidence is still not release-complete until the bounded-memory gate passes.
- V18 now has two release gates. The honesty gate requires every documented
  first-use application path to avoid full graph materialization. The
  bounded-memory large-graph gate requires normal public reads, writes, content
  lookup, and sync to operate under an explicit git-warp memory budget against a
  graph larger than that budget.
- Memory pools, streaming basis construction, sharded fact resolvers,
  cursorized reads and sync, bounded content lookup, capability reporting,
  doctor tooling, and bounded-mode legacy rejection are v18 blockers.
- `openWarpGraph()`, `WarpApp.open()`, `WarpCore.open()`, and public
  materialize-first methods should remain compatible but become legacy,
  compatibility, or diagnostic surfaces.
- Current exact-read shapes such as `live().getNodeProps(id)` are not banned as
  concepts. Their current full-state providers are transitional until exact
  reads are backed by bounded shard or fact resolvers.
- The next work should stay scoped to the two v18 gates. Do not mix it with
  native Continuum witnesshood, Echo scheduler parity, or distributed braid
  semantics.

The completed pivot plan is
[0261-worldline-optic-public-api-deprecation-prd](design/0261-worldline-optic-public-api-deprecation-prd/worldline-optic-public-api-deprecation-prd.md).
The active release-blocking closeout plan is
[0265-v18-optics-public-api-closeout](design/0265-v18-optics-public-api-closeout/v18-optics-public-api-closeout.md).
The two new gate designs are
[0266-v18-no-full-materialization-first-use-optics](design/0266-v18-no-full-materialization-first-use-optics/v18-no-full-materialization-first-use-optics.md)
and
[0267-v18-bounded-memory-large-graph-product-gate](design/0267-v18-bounded-memory-large-graph-product-gate/v18-bounded-memory-large-graph-product-gate.md).
Gate 1 active branch evidence is
[0269-v18-gate-1-optics-honesty](design/0269-v18-gate-1-optics-honesty/v18-gate-1-optics-honesty.md).

## Method Tracker Posture

GitHub Issues are now the live Method tracker for this repo. The filesystem
backlog cards were migrated on 2026-06-01, labeled by source lane, and archived
as evidence. The migration map is
[github-issue-migration-2026-06-01.json](method/github-issue-migration-2026-06-01.json).

Current release-blocking issue:

- [#552 v18 public release blockers](https://github.com/git-stunts/git-warp/issues/552)

Completed gate evidence:

- [#546 No full materialization in first-use Optics](https://github.com/git-stunts/git-warp/issues/546)
  closed on 2026-06-02 through PR #574.
- V18-GP4 Holographic slicing and checkpoint basis closed on 2026-06-06
  through PR #643 plus tracker closeout for issues #629 through #632.
- V18-GP3 Content attachment-plane honesty closed on 2026-06-06 by naming the
  v18 residual risk and carrying full storage-plane retirement to #646.
- V18-GP1 Optics public API closeout closed on 2026-06-06 with public
  coordinate node/property read, first-use honesty, recovery, docs, and
  consumer type evidence.
- V18-GP2 Bounded-memory large-graph product gate closed on 2026-06-09 through
  PR #647 with non-release evidence for memory budgeting, large-graph fixture
  conformance, bounded reads, patch streams, basis building, fact resolvers,
  sync batching, capability reporting, and operator witness output.

## Where Are We

The repo has crossed the v18 implementation and release-prep boundary.
`18.0.0` package metadata, JSR metadata, changelog, release notes, migration
evidence, generated-contract evidence, and post-v18 planning docs are merged to
`main`.

Current release facts:

- Latest v18 release-prep merge: PR #574, Gate 1 Optics honesty, at
  `5e081cca`.
- Package metadata: `18.0.0` in `package.json` and `jsr.json`.
- Public package/tag line: still `17.0.0` until the `v18.0.0` tag and registry
  publishes complete.
- Latest recorded repair entry: `17.0.1` exists in source docs/changelog
  without public npm/tag evidence.
- Last recorded release preflight predates the Worldline-first and Method
  tracker merges. Rerun
  release preflight only after Optics public API closeout lands.
- If `main` moves after `5e081cca` before tagging, rerun release preflight from
  the exact commit that will receive the `v18.0.0` tag.
- No `v18.0.0` tag or registry publish evidence is recorded yet.
- `v18.0.0` is intentionally delayed until release operation evidence closes in
  GitHub Issues and the operator explicitly approves tagging.

Current v18 implementation posture:

- Runtime-backed node, edge, attachment, content, and property projection nouns
  exist over the legacy storage plane.
- Graph-op algebra projection emits typed graph operation nouns rather than raw
  property-map entries.
- Graph-model migration now has dry-run planning, source inventory, operation
  lowering, scratch writing, equivalence gating, runtime conformance, guarded
  finalization, and deterministic operator reports.
- The v17 golden graph-history fixture can be restored, migrated through
  scratch history, replayed through the production runtime, and proven against
  public-read equivalence with zero canonical mismatches.
- Generated Continuum/WARP Optic contract evidence is ingested for the
  runtime-boundary family, and the `warp-ttd` generated-family smoke exists.
- Worldline-first application entry is merged. Coordinate Optics have pinned
  coordinates, checkpoint-tail identity assertions, success-path tests,
  recovery docs, and consumer type evidence.
- On `main`, `prepareOpticBasis()` verifies existing
  checkpoint-tail basis evidence and fails closed with
  `E_OPTIC_NO_BOUNDED_BASIS` when that evidence is missing. It no longer
  creates a basis by calling full materialization.
- PERF-0270 adds `prepareOpticBasis()` evidence that verifies checkpoint-tail
  basis through bounded tree-entry probes instead of full tree OID maps.
- Release-candidate evidence accepts the residual raw content/property storage
  risk, but the previous "no streaming claim" escape hatch is no longer enough:
  v18 is blocked on bounded-memory conformance for normal public paths.

That is useful progress, not a finish line. Public v18 is not published until
Optics closeout, the bounded-memory large-graph gate, tag, npm, and JSR evidence
exist.

## What Feels Wrong

- Content persistence still uses legacy `_content*` compatibility properties.
  Typed reads and writes exist over that plane, but the storage cutover is not
  complete.
- The source audit still finds raw property-map dependencies in named
  compatibility, serialization, replay, reducer/op-strategy, visible-scope,
  logical-index, and migration-source boundaries.
- Temporal replay still extracts node snapshots from the raw legacy property
  map because historical replay tests carry pre-codec inline fixture classes
  that are not `PropValue`-honest enough for `LegacyPropertyValue`.
- Broader non-fixture replay coverage remains future work, even though the v17
  golden fixture wet run is now green.
- Native Continuum witnesshood is still not claimed. Current v18 evidence is
  translated git-warp evidence shaped for Continuum.
- `events.optic()` remains visible as a one-off live convenience. The coherent
  multi-read story is now `prepareOpticBasis()`, `coordinate()`, and
  `coordinate.optic()`. Review should check that all docs keep that distinction
  sharp.
- Gate 1 removes the direct `prepareOpticBasis()` materialization footgun, but
  it does not build the bounded-memory platform. Basis construction, normal
  public reads, writes, content lookup, and sync still wait for gate 2.
- Several public surfaces are still full-residency or full-result by shape:
  `materialize()`, `getStateSnapshot()`, `getNodes()`, `getEdges()`, naked
  `toArray()`-style reads, and sync responses that accumulate arrays. They
  remain compatibility, diagnostic, or transitional until bounded providers and
  limit contracts exist.
- Content bytes can stream, but content-reference lookup still depends on the
  graph state path. Do not call content streaming large-graph-safe until lookup
  is bounded too.
- The live backlog has moved to GitHub Issues. Historical backlog cards are
  archived under `docs/archive/backlog/`; archived notes need a GitHub issue or
  explicit pull decision before they can block later work.
- End-to-end bounded-memory graph reads, writes, content lookup, and sync are a
  v18 release gate. V18 must not ship until the normal public path is proven
  against a graph larger than git-warp's configured memory pool.

## Where We Are Heading

The next work should stay split into distinct modes:

1. **Public API product pivot**: make Worldlines and Optics the v18 first-use
   story while deprecating graph/materialize-first public paths. Worldlines are
   done; coordinate Optics exist but are blocked on both gates below.
2. **V18 honesty gate**: landed as V18-GP1 plus gate evidence; keep first-use
   docs honest about transitional surfaces.
3. **V18 bounded-memory large-graph gate**: landed as V18-GP2 at the
   non-release evidence layer. Release/tag evidence remains separate.
4. **Optics public API closeout**: landed as V18-GP1 with public node/property
   Optics, setup, recovery, docs, and consumer type evidence.
5. **Release operation**: cut and publish `v18.0.0` from aligned `main` only
   after tracker reconciliation, release preflight, explicit tag approval, and
   recorded publish evidence.
6. **Substrate debt**: retire one more raw content/property compatibility
   boundary and ratchet the closeout audit.
7. **v19 runway**: start native Continuum witnesshood work without backdating a
   stronger v18 claim.

Do not blend these into one ambiguous branch.

## Live Checklist

Release-operation work is paused behind Optics merge and release evidence:

- [~] Keep `API_optics-public-api-closeout` as branch-local implementation
  evidence, not a release-complete claim, until the first-use basis setup path
  stops materializing and the bounded-memory gate passes.
- [x] Complete gate 1 branch evidence for
  [#546](https://github.com/git-stunts/git-warp/issues/546):
  tracker cleanup, public API cost inventory, first-use tripwires, docs guards,
  and fail-closed `prepareOpticBasis()` verification.
- [x] Reconcile migrated/completed tracker issues after PR #111:
  [#572](https://github.com/git-stunts/git-warp/issues/572),
  [#573](https://github.com/git-stunts/git-warp/issues/573),
  [#548](https://github.com/git-stunts/git-warp/issues/548),
  [#551](https://github.com/git-stunts/git-warp/issues/551), and
  [#553](https://github.com/git-stunts/git-warp/issues/553).
- [x] Add public API cost inventory:
  [PUBLIC_API_COSTS.md](PUBLIC_API_COSTS.md).
- [x] Add first-use Optics materialization tripwire evidence.
- [x] Change `prepareOpticBasis()` to verify existing checkpoint-tail basis evidence or
  fail closed.
- [x] Complete [#549](https://github.com/git-stunts/git-warp/issues/549)
  `PERF_bounded-memory-large-graph-product-gate` with
  [0270-v18-bounded-tree-entry-basis-probes](design/0270-v18-bounded-tree-entry-basis-probes/v18-bounded-tree-entry-basis-probes.md):
  memory-budget, large-graph fixture, bounded read, patch stream, basis builder,
  fact resolver, sync batch, capability report, and operator witness evidence.
- [x] Add bounded tree-entry probe evidence for checkpoint-tail basis setup in
  PR #579:
  [0270-v18-bounded-tree-entry-basis-probes](design/0270-v18-bounded-tree-entry-basis-probes/v18-bounded-tree-entry-basis-probes.md).
- [x] Complete [#549](https://github.com/git-stunts/git-warp/issues/549)
  `PERF_bounded-memory-large-graph-product-gate`.
- [x] Add tripwire evidence for documented first-use Optics paths.
- [x] Add large-graph-over-small-pool conformance evidence.
- [x] Update first-use docs and public API labels so bounded, streaming,
  cursor, transitional, diagnostic, offline, and legacy surfaces are explicit.
- [x] Complete [#547](https://github.com/git-stunts/git-warp/issues/547)
  `API_optics-public-api-closeout` and merge to `main`.
- [ ] Rerun `npm run release:preflight` from aligned `main` after Optics
  closeout lands.
- [ ] Cut the signed or annotated `v18.0.0` tag from the release commit after
  explicit release approval.
- [ ] Push the `v18.0.0` tag.
- [ ] Publish npm and JSR artifacts from the release path.
- [ ] Record the release evidence archive: tag SHA, preflight result, npm
  version evidence, JSR version evidence, and any audit note.

Branch-local coordinate Optics implementation checklist, now superseded for
release honesty by `API_no-full-materialization-first-use-optics`:

- [x] 133: Decide the Worldline-first coordinate and optic basis setup APIs and
  receipt contracts.
- [x] 134: Decide package exports versus opaque return types for coordinate,
  optic/result nouns.
- [x] 135: Bridge the checkpoint-tail fixture to the public
  `openWarpWorldline(...)` path.
- [x] 136: Add RED coverage for `prepareOpticBasis()` or the approved
  equivalent.
- [x] 137: Implement the smallest Worldline-first basis setup path.
- [x] 138: Add RED coverage for `coordinate()` or the approved equivalent.
- [x] 139: Implement the smallest Worldline-first coordinate capture path.
- [x] 140: Add RED coverage for public coordinate node optic success with
  checkpoint-tail identity assertions.
- [x] 141: Make public coordinate node optic success pass through bounded
  evidence.
- [x] 142: Add RED coverage for public coordinate property optic success.
- [x] 143: Make public coordinate property optic success pass, including live tail
  evidence.
- [x] 144: Prove one coordinate stays coherent while the live worldline
  advances.
- [x] 145: Lock missing node and missing property result semantics.
- [x] 146: Document and test `E_OPTIC_NO_BOUNDED_BASIS` recovery.
- [x] 147: Document and test `E_OPTIC_TAIL_BUDGET_EXCEEDED` and
  `E_OPTIC_READ_IDENTITY` recovery.
- [x] 148: Decide and test blank node id and property key behavior.
- [x] 149: Add consumer type tests for documented coordinate setup and reads.
- [x] 150: Align root exports, package surface, and docs with the export
  decision.
- [x] 151: Close API and release docs for setup, coordinate capture, success,
  recovery, and bounded scope.
- [x] 152: Run full verification, drift-check against the PRD, and evaluate PR
  readiness.

Completed Worldline-first API pivot checklist:

- [x] 113: PRD and BEARING pivot.
- [x] 114: Public surface inventory.
- [x] 115: API naming and dependency contract.
- [x] 116: Runtime-backed public types.
- [x] 117: Entrypoint wrapper.
- [x] 118: Commit path.
- [x] 119: Read, observer, and optic path.
- [x] 120: Legacy graph API deprecation.
- [x] 121: Materialize API deprecation/classification.
- [x] 122: Public surface tests.
- [x] 123: README rewrite.
- [x] 124: Readings & Optics rewrite.
- [x] 125: API reference rewrite.
- [x] 126: CLI diagnostic wording.
- [x] 127: Error and runtime docs sweep.
- [x] 128: Migration guide.
- [x] 129: Non-functional guards.
- [x] 130: Package surface audit.
- [x] 131: Changelog and release story.
- [x] 132: Drift check and go/no-go.

## Invariants

Compact list here; full derivations with paper grounding, codebase mapping,
and concrete checks live in `docs/invariants/`.

1. **TICK-CONFLUENCE**: same patches, any order, same materialized state.
2. **HOLOGRAPHIC-BOUNDARY**: initial state plus patch chains is complete
   replay, with no ambient state.
3. **BACKWARD-PROVENANCE**: every value traces to producing patch evidence.
4. **PAYLOAD-MONOID**: checkpoint plus remaining patches equals full replay.
5. **STATE-PROVENANCE-SEP**: state convergence is not history convergence.
6. **EXPLICIT-CONFLICT**: conflicts are surfaced, never silently erased.
7. **APPEND-ONLY**: Git history is never rewritten.
8. **DOMAIN-PURITY**: domain code does not import infrastructure or ambient
   state.
9. **WRITER-ISOLATION**: each writer owns its ref without coordination.
10. **TWO-PLANE-COMMUTATION**: property and topology ops commute.
11. **CAS-ATOMICITY**: writer ref updates are compare-and-swap.
12. **OBSERVER-DETERMINISM**: reads are deterministic functions of state.
13. **TRAVERSAL-TRUTH**: streams carry traversal; ports carry truth.
14. **NO-SCALARIZATION**: observer comparison is multi-dimensional.
15. **SUFFIX-TRANSPORT**: sync transports suffixes from tips.
