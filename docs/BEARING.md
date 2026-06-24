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

The Worldline-first public API pivot shipped in `v18.0.0`. The active
`v18.1.0` correction is narrower and sharper: `Optic` is no longer only a
fluent API idea or documentation noun. It is an exported, frozen runtime object
for node, node-property, neighborhood, and traversal read intent.

- The current public package and tag line is `v18.0.0`.
- Source metadata is aligned at `18.1.0`; no `v18.1.0` tag or GitHub release
  exists yet.
- PR #666 is the open `v18.1.0` release-prep vehicle.
- Issue #665 is closed as the reified Optic tracker.
- Coordinate-backed Optics remain the coherent first-use read path:
  `prepareOpticBasis()`, `coordinate()`, and `coordinate().optic()`.
- Missing non-empty node and property targets are ordinary absence results.
  Blank node ids and property keys are schema-invalid `Optic` targets and fail
  with `E_OPTIC_FAILURE_SCHEMA`.
- Native Continuum optic witnesshood, remote optic transport, live
  Echo/git-warp suffix exchange, common-basis braid validation, support-fragment
  cache storage, and plan-driven fragment execution remain outside the
  `v18.1.0` release claim.

The completed pivot plan is
[0261-worldline-optic-public-api-deprecation-prd](design/0261-worldline-optic-public-api-deprecation-prd/worldline-optic-public-api-deprecation-prd.md).
The completed v18 public API closeout plan is
[0265-v18-optics-public-api-closeout](design/0265-v18-optics-public-api-closeout/v18-optics-public-api-closeout.md).
The v18.0 bounded-read gate designs are
[0266-v18-no-full-materialization-first-use-optics](design/0266-v18-no-full-materialization-first-use-optics/v18-no-full-materialization-first-use-optics.md)
and
[0267-v18-bounded-memory-large-graph-product-gate](design/0267-v18-bounded-memory-large-graph-product-gate/v18-bounded-memory-large-graph-product-gate.md).
Gate 1 branch evidence is
[0269-v18-gate-1-optics-honesty](design/0269-v18-gate-1-optics-honesty/v18-gate-1-optics-honesty.md).
The active v18.1 design is
[0275-v18-reified-optics](design/0275-v18-reified-optics/v18-reified-optics.md).

## Method Tracker Posture

GitHub Issues are now the live Method tracker for this repo. The filesystem
backlog cards were migrated on 2026-06-01, labeled by source lane, and archived
as evidence. The migration map is
[github-issue-migration-2026-06-01.json](method/github-issue-migration-2026-06-01.json).

Current v18.1.0 tracker state:

- [#665 Reify Optic as a first-class runtime noun](https://github.com/git-stunts/git-warp/issues/665)
  is closed in the `v18.1.0` milestone.
- [#663 Gate D - git-warp Suffix Exchange Implementation](https://github.com/git-stunts/git-warp/issues/663)
  is closed as a scope correction, not as Continuum Gate D proof.
- PR #666 remains the open release-prep vehicle for `v18.1.0`.
- GitHub currently reports zero open `priority:asap` issues and zero open
  `v18.1.0` milestone issues.

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

The repo is on the `v18.1.0` source line. `v18.0.0` has a local tag, a GitHub
release published on 2026-06-17, and npm reports `@git-stunts/git-warp` at
`18.0.0`. The working release branch has package metadata at `18.1.0`, but no
`v18.1.0` tag or GitHub release exists yet.

Current release facts:

- Public package/tag line: `v18.0.0`.
- Source package metadata: `18.1.0` in `package.json` and `jsr.json`.
- Active PR: #666, `release/v18.1.0-prep` into `main`.
- Active release evidence packet:
  [docs/releases/v18.1.0/README.md](releases/v18.1.0/README.md).
- `v18.1.0` milestone: zero open issues; #665 and #663 are closed.
- `priority:asap`: zero open issues.
- The only observed CI blocker on PR #666 was the
  `coverage-threshold` conformance mismatch for blank Optic targets.

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
- Worldline-first application entry is shipped. Coordinate Optics have pinned
  coordinates, checkpoint-tail identity assertions, success-path tests,
  recovery docs, and consumer type evidence.
- `prepareOpticBasis()` verifies existing checkpoint-tail basis evidence and
  fails closed with `E_OPTIC_NO_BOUNDED_BASIS` when that evidence is missing. It
  no longer creates a basis by calling full materialization.
- `Optic` is now a runtime-backed read-intent noun for fluent node,
  node-property, neighborhood, and traversal reads.
- Blank Optic target identities are schema errors, not missing-value reads.

That is useful progress, not a finish line. Public `v18.1.0` is not published
until PR #666 merges, release guard/preflight evidence is green, and the
operator explicitly approves tagging.

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
- PR #666 is still blocked until CI reruns green after the blank Optic target
  contract correction.

## Where We Are Heading

The next work should stay split into distinct modes:

1. **v18.1 release operation**: merge PR #666 only after CI is green, then run
   final release guard/preflight evidence before any tag request.
2. **Optic runtime honesty**: keep `Optic` documented as a git-warp transition
   noun until native Continuum witnesshood and remote transport exist.
3. **Substrate debt**: retire one more raw content/property compatibility
   boundary and ratchet the closeout audit.
4. **v19 runway**: start native Continuum witnesshood work without backdating a
   stronger v18 claim.

Do not blend these into one ambiguous branch.

## Live Checklist

Release-operation work is now the `v18.1.0` PR #666 closeout:

- [x] Ship `v18.0.0` as the current public package/tag line.
- [x] Align source metadata at `18.1.0`.
- [x] Close #665 with reified `Optic` runtime evidence.
- [x] Close #663 as a v18.1 scope correction without claiming Continuum Gate D.
- [x] Record `v18.1.0` release evidence in
  [docs/releases/v18.1.0/README.md](releases/v18.1.0/README.md).
- [x] Document blank Optic targets as schema-invalid and missing non-empty
  targets as absence data.
- [ ] Merge PR #666 after CI is green.
- [ ] Run final release guard/preflight evidence from aligned `main`.
- [ ] Cut and publish `v18.1.0` only after explicit operator approval.

Historical branch-local coordinate Optics implementation checklist, superseded
for release honesty by `API_no-full-materialization-first-use-optics`:

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
