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

The next 20-slice branch is a product-value pivot for v18:

- Worldlines and optics should become the first-use public API story.
- `openWarpGraph()`, `WarpApp.open()`, `WarpCore.open()`, and public
  materialize-first methods should remain compatible but become legacy,
  compatibility, or diagnostic surfaces.
- The implementation should wrap existing runtime seams where possible. Do not
  mix this branch with storage retirement, native Continuum witnesshood, or
  end-to-end graph streaming claims.

The controlling plan is
[0261-worldline-optic-public-api-deprecation-prd](design/0261-worldline-optic-public-api-deprecation-prd/worldline-optic-public-api-deprecation-prd.md).

## Where Are We

The repo has crossed the v18 implementation and release-prep boundary.
`18.0.0` package metadata, JSR metadata, changelog, release notes, migration
evidence, generated-contract evidence, and post-v18 planning docs are merged to
`main`.

Current release facts:

- Latest v18 release-prep merge: PR #108, post-v18 release handoff and
  next-goalpost planning, at `59beefed`.
- Package metadata: `18.0.0` in `package.json` and `jsr.json`.
- Public package/tag line: still `17.0.0` until the `v18.0.0` tag and registry
  publishes complete.
- Latest recorded repair entry: `17.0.1` exists in source docs/changelog
  without public npm/tag evidence.
- Last recorded release preflight passed from aligned `main` at `59beefed`.
- If `main` moves after `59beefed` before tagging, rerun release preflight from
  the exact commit that will receive the `v18.0.0` tag.
- No `v18.0.0` tag or registry publish evidence is recorded yet.

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
- Release-candidate evidence accepts the residual raw content/property storage
  risk and preserves the non-claim that v18 has end-to-end graph streaming.

That is useful progress, not a finish line. Public v18 is not published until
tag, npm, and JSR evidence exist.

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
- The v17 backlog lane is no longer an active release plan, but its remaining
  notes still need item-level archive, rehome, or explicit pull decisions.
- End-to-end graph streaming reads and writes are a `v20.0.0` goal. V18 must
  keep public docs honest and avoid claiming full graph streaming.

## Where We Are Heading

The next work should stay split into distinct modes:

1. **Public API product pivot**: make Worldlines and Optics the v18 first-use
   story while deprecating graph/materialize-first public paths.
2. **Release operation**: cut and publish `v18.0.0` from aligned `main`.
3. **Substrate debt**: retire one more raw content/property compatibility
   boundary and ratchet the closeout audit.
4. **v19 runway**: start native Continuum witnesshood work without backdating a
   stronger v18 claim.
5. **v20 runway**: design end-to-end graph streaming reads and writes without
   assuming full-graph materialization.

Do not blend these into one ambiguous branch.

## Live Checklist

Release-operation work still pending outside this branch:

- [ ] Cut the signed `v18.0.0` tag from the release commit after explicit
  release approval.
- [ ] Push the `v18.0.0` tag.
- [ ] Publish npm and JSR artifacts from the release path.
- [ ] Record the release evidence archive: tag SHA, preflight result, npm
  version evidence, JSR version evidence, and any audit note.

Current 20-slice API checklist:

- [x] 113: PRD and BEARING pivot.
- [x] 114: Public surface inventory.
- [x] 115: API naming and dependency contract.
- [x] 116: Runtime-backed public types.
- [ ] 117: Entrypoint wrapper.
- [ ] 118: Commit path.
- [ ] 119: Read, observer, and optic path.
- [ ] 120: Legacy graph API deprecation.
- [ ] 121: Materialize API deprecation/classification.
- [ ] 122: Public surface tests.
- [ ] 123: README rewrite.
- [ ] 124: Readings & Optics rewrite.
- [ ] 125: API reference rewrite.
- [ ] 126: CLI diagnostic wording.
- [ ] 127: Error and runtime docs sweep.
- [ ] 128: Migration guide.
- [ ] 129: Non-functional guards.
- [ ] 130: Package surface audit.
- [ ] 131: Changelog and release story.
- [ ] 132: Drift check and go/no-go.

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
