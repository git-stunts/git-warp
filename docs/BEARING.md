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
- Coordinate-backed Optics are implemented on this branch through
  `prepareOpticBasis()`, `coordinate()`, and `coordinate.optic()`. Public v18
  still waits for this branch to pass review, merge, release preflight, tag, and
  publish evidence.
- `openWarpGraph()`, `WarpApp.open()`, `WarpCore.open()`, and public
  materialize-first methods should remain compatible but become legacy,
  compatibility, or diagnostic surfaces.
- The next branch should stay scoped to Optics public API closeout. Do not mix
  it with storage retirement, native Continuum witnesshood, or end-to-end graph
  streaming claims.

The completed pivot plan is
[0261-worldline-optic-public-api-deprecation-prd](design/0261-worldline-optic-public-api-deprecation-prd/worldline-optic-public-api-deprecation-prd.md).
The active release-blocking closeout plan is
[0265-v18-optics-public-api-closeout](design/0265-v18-optics-public-api-closeout/v18-optics-public-api-closeout.md).

## Where Are We

The repo has crossed the v18 implementation and release-prep boundary.
`18.0.0` package metadata, JSR metadata, changelog, release notes, migration
evidence, generated-contract evidence, and post-v18 planning docs are merged to
`main`.

Current release facts:

- Latest v18 release-prep merge: PR #110, Worldline-first public API, at
  `7711bc0a`.
- Package metadata: `18.0.0` in `package.json` and `jsr.json`.
- Public package/tag line: still `17.0.0` until the `v18.0.0` tag and registry
  publishes complete.
- Latest recorded repair entry: `17.0.1` exists in source docs/changelog
  without public npm/tag evidence.
- Last recorded release preflight predates the Worldline-first merge. Rerun
  release preflight only after Optics public API closeout lands.
- If `main` moves after `7711bc0a` before tagging, rerun release preflight from
  the exact commit that will receive the `v18.0.0` tag.
- No `v18.0.0` tag or registry publish evidence is recorded yet.
- `v18.0.0` is intentionally delayed until `API_optics-public-api-closeout`
  merges and release operation evidence exists.

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
- Worldline-first application entry is merged. On this branch, the public
  Optics story now has pinned coordinates, documented checkpoint-tail basis
  setup, success-path tests, recovery docs, and consumer type evidence.
- Release-candidate evidence accepts the residual raw content/property storage
  risk and preserves the non-claim that v18 has end-to-end graph streaming.

That is useful progress, not a finish line. Public v18 is not published until
Optics closeout, tag, npm, and JSR evidence exist.

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
- The shipped v17 residual backlog lane is archived under
  `docs/archive/backlog/v17.0.0-residual-backlog/`; archived notes need an
  explicit rehome or pull decision before they can block later work.
- End-to-end graph streaming reads and writes are a `v20.0.0` goal. V18 must
  keep public docs honest and avoid claiming full graph streaming.

## Where We Are Heading

The next work should stay split into distinct modes:

1. **Public API product pivot**: make Worldlines and Optics the v18 first-use
   story while deprecating graph/materialize-first public paths. Worldlines are
   done; coordinate Optics are branch-local complete and awaiting review.
2. **Optics public API closeout**: prove public success paths for node and
   property optics through `openWarpWorldline(...).coordinate().optic()`,
   document basis setup and recovery, and lock the package/consumer type
   surface.
3. **Release operation**: cut and publish `v18.0.0` from aligned `main` only
   after Optics closeout.
4. **Substrate debt**: retire one more raw content/property compatibility
   boundary and ratchet the closeout audit.
5. **v19 runway**: start native Continuum witnesshood work without backdating a
   stronger v18 claim.
6. **v20 runway**: design end-to-end graph streaming reads and writes without
   assuming full-graph materialization.

Do not blend these into one ambiguous branch.

## Live Checklist

Release-operation work is paused behind Optics merge and release evidence:

- [x] Complete `API_optics-public-api-closeout` branch-local implementation,
  tests, and docs.
- [ ] Merge `API_optics-public-api-closeout` to `main`.
- [ ] Rerun `npm run release:preflight` from aligned `main` after Optics
  closeout lands.
- [ ] Cut the signed or annotated `v18.0.0` tag from the release commit after
  explicit release approval.
- [ ] Push the `v18.0.0` tag.
- [ ] Publish npm and JSR artifacts from the release path.
- [ ] Record the release evidence archive: tag SHA, preflight result, npm
  version evidence, JSR version evidence, and any audit note.

Completed coordinate Optics closeout 20-slice checklist:

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
