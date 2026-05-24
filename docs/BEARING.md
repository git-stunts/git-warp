# BEARING

Updated at cycle boundaries and before the final commit of each v18 slice.

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

## Where Are We

`git-warp` has shipped `v17.0.0` and the `v17.0.1` release repair. The
active major direction is `v18.0.0`: Continuum/WARP Optic compatibility for
git-warp as an independent Continuum participant.

The long-term compatibility target is the WARP Optic shape described in
`~/git/blog/aion-paper-07/dist/aion-paper-07.txt`, plus the Continuum
contract families authored in `~/git/continuum/schemas/` and compiled by
Wesley. `warp-ttd` should eventually consume generated-family facts instead
of handwritten adapter folklore.

Current branch state at this boundary:

- Branch: `v18-continuum-slices-46-55`
- Base branch: `main`
- Current `origin/main`: `b274bbc9`
- Latest merged PR: #103, v18 migration dry-run CLI and genesis equivalence
  evidence
- Latest released package line: `17.0.1`
- Latest completed implementation cycle:
  `0199-v18-v17-golden-graph-fixtures`
- Current work: PR E has started. Slice 46 is complete on this branch, and
  slices 47 through 55 are the current drift-check batch.
- Cleanup checkpoint: `main` has been fast-forwarded to `origin/main` after
  PR #103 merged; this branch starts from that merge commit.

The current v18 graph-model posture is:

- Runtime-backed node records exist.
- Runtime-backed edge records exist.
- Generic attachment records exist.
- Graph-op algebra projection exists.
- Typed content payload nouns exist.
- Content attachment projection exists.
- Public content reads use the content projection.
- Content writes construct typed intent before lowering to legacy `_content*`
  compatibility properties.
- Runtime-backed legacy property projection nouns exist.
- Node and edge property projections exist.
- Public query property reads use projection-backed compatibility records.
- State-reader property and content views use projection-backed compatibility
  records.
- Generic node and edge property writes construct runtime-backed write intents
  before lowering to legacy compatibility operations.
- Graph-op algebra projection emits typed content and property operation
  nouns, not raw property-map entries.
- Query read-model node props, translation-cost property-key accounting, and
  public property counts use property projection nouns.
- Runtime-backed graph-model migration manifest nouns exist for dry-run
  planning, including source/target basis, node, edge, property, content
  mapping entries, warnings, and fatal planning failures.
- Runtime-backed migration source inventory nouns exist for adapter-collected
  graph identity, optional source basis, writer chains, patch descriptors,
  state snapshot references, content/blob sources, warnings, and fatal
  collection errors.
- A pure dry-run graph-model migration planner exists. It consumes source
  inventory, returns result values for incomplete inputs, emits a migration
  manifest and planned graph-operation facts, and still writes no graph
  history.
- Ordered migration history input nouns exist for writer segments, patch
  identity, per-writer patch sequence, per-patch operation indexes, and
  frontier evidence needed by later genesis equivalence work.
- Manifest JSON serialization exists as an infrastructure adapter boundary.
  Domain migration nouns still do not parse or stringify JSON.
- A non-destructive migration dry-run CLI exists under
  `scripts/v18.0.0/migrations/graph-model/`. It accepts explicit request JSON,
  emits deterministic manifest output, and refuses apply/write verbs.
- Genesis equivalence proof nouns exist for basis pairs, visible reading
  facts, patch boundary evidence, structured mismatches, proof summaries, and
  success/failure result values.
- First equivalence fixtures exist for node lifecycle, edge lifecycle, content
  attachment metadata, removed-node visibility, multi-writer ordering, and one
  intentional divergent property case.
- A genesis divergence reporter exists and turns proof failures into
  structured first-divergence reports.
- A v17 golden graph-history fixture design now precedes real source
  inventory collection so migration work can prove against restored persisted
  Git data, not only compact in-memory proof cases.
- A first v17 golden graph-history fixture bundle and manifest now restore
  real `refs/warp/*` writer refs into an isolated repository and validate
  writer heads, patch counts, and visible fact-family coverage.
- A read-only restored source inventory collector now discovers real writer
  refs, decodes patch commit trailers, records writer chains and patch
  descriptors, derives a deterministic source basis, and fails closed with
  structured migration notices.
- Pure migration operation lowering now turns successful dry-run plans into
  runtime-backed write-ready operation facts while refusing fatal dry-run plans.
- An explicit scratch migration writer now writes lowered operation facts only
  under `refs/warp-migration-scratch/*`, rejects live graph refs, and advances
  scratch refs with expected-head `git update-ref` calls.
- A scratch equivalence gate now compares legacy and scratch genesis readings,
  reports first divergence, and blocks promotion when proof fails or visible
  facts lack patch-boundary evidence.
- Finalization safety is now modeled as pure domain evidence: explicit
  confirmation, passed equivalence gate, archive ref target, scratch output,
  and live-ref expected-head match are required before live refs can move.
- Archive-preserving finalization now exists as an adapter-layer Git updater:
  it refuses failed safety results, rejects live-ref drift, creates an archive
  ref for old lineage, and advances the live ref with expected-head CAS.
- Command-level migration wiring now runs dry-run planning, lowering, scratch
  writing, equivalence gating, and optional finalization in order, with
  finalization absent by default.
- Finalization now also requires post-migration runtime conformance evidence
  tied to the exact scratch ref and scratch head.
- The remaining raw content/property compatibility files are now listed in an
  executable closeout audit.
- Legacy fixture manifests can now be projected into genesis-equivalence
  readings with deterministic patch-boundary evidence.
- Scratch migration operation commits can now be projected into
  genesis-equivalence readings with scratch commit boundary evidence.
- The migration command can now construct equivalence readings through command
  reading providers after scratch writing.
- Scratch migration runtime conformance now has an adapter-level provider that
  verifies the scratch ref still points at the expected head and reads
  operation commits back into genesis evidence.
- Command finalization is now covered with command-owned legacy/scratch reading
  providers plus scratch operation readback conformance, not only supplied test
  proof values.
- Provider-built scratch readings now have a divergence regression proving
  finalization remains blocked when scratch history is readable but not
  equivalent.
- The migration command now has deterministic operator report formatting for
  planning, scratch, equivalence, and finalization evidence.
- A non-finalizing migration command CLI wrapper now writes scratch history,
  builds command-owned readings, emits the command report, and refuses live-ref
  finalization flags.

That is useful progress, not a finish line. The repo still needs property
projection beyond replay/serialization boundaries, graph-model migration
tooling over real graph history, and genesis replay equivalence over scratch
migrated history before v18 can make stronger compatibility claims.

## What Just Shipped

PR #97 landed v18 slices 21 through 25:

- post-slice-20 content-cutover runway;
- runtime-backed content attachment payload nouns;
- content attachment projection over legacy `_content*` compatibility state;
- public content reads routed through typed content projection;
- typed content write intent before compatibility-property lowering;
- same-patch metadata lineage repair for content projection.

PRs #94 through #96 had already landed the earlier v18 evidence posture,
generated-family readiness, runtime-boundary source facts, node and edge
records, generic attachment substrate, and graph-op algebra groundwork.

PR #98 landed the detailed design documents for slices 26 through 45 and
reset this bearing around the property-projection, migration dry-run, and
genesis-equivalence runway.

PR #99 landed v18 slices 26 through 30:

- post-slice-25 property-projection runway;
- runtime-backed legacy node and edge property key/value nouns;
- node property projection over visible `WarpState` facts;
- edge property projection over visible `WarpState` facts;
- query node properties, edge properties, and edge-list property payloads
  routed through projection-backed compatibility records;
- review follow-up preserving tolerant misses, targeted projection reads,
  malformed-record skipping, shared legacy content keys, and plain-object
  property carrier guards.

PR #101 landed v18 slices 31 through 35:

- state-reader node, edge, and content property views route through typed
  projections;
- runtime-backed node and edge property write intent nouns exist;
- `PatchBuilder` generic property writes lower through those intents while
  preserving the existing patch wire shape;
- graph-op algebra projection emits typed content and property operation
  nouns;
- closeout routed the remaining live read-model property views through
  projections and documented the remaining raw legacy-property boundaries.
- review follow-up hardened CI action pinning, property-value recursion and
  prototype guards, and hostile `SnapshotWarpState` hydration boundaries.

PR #102 landed v18 slices 36 through 40:

- graph-model migration manifest nouns;
- migration source inventory;
- dry-run state migration planner;
- ordered migration history input;
- migration manifest serialization.

Slice 36 is complete on this branch. The migration manifest root now exists
as a frozen domain noun, with runtime-backed basis, mapping, warning, and
fatal-error entries. It does not serialize, read Git, or write graph history.

Slice 37 is complete on this branch. The migration source inventory now
separates adapter-collected facts from planner input, rejects duplicate or
inconsistent patch facts, records missing source basis as a fatal collection
condition, and still performs no Git I/O.

Slice 38 is complete on this branch. The dry-run planner consumes migration
source inventory and planned mapping inputs, emits a manifest plus planned
operation facts for complete input, and fails closed as a value when source
inventory or required content sources are incomplete.

Slice 39 is complete on this branch. Ordered history input now preserves
writer, patch, operation, and frontier boundaries as frozen migration-domain
values so future equivalence checks can report exact divergence locations.

Slice 40 is complete on this branch. Manifest JSON serialization now
round-trips through an infrastructure adapter with deterministic output,
field-specific parse errors, and domain construction enforcing duplicate
mapping invariants.

This branch starts PR D, v18 slices 41 through 45:

- migration dry-run CLI;
- genesis equivalence proof nouns;
- genesis equivalence fixtures;
- genesis divergence reporter;
- evidence-backed replan.

Slice 41 is complete on this branch. The dry-run CLI now accepts an explicit
request JSON artifact, decodes source facts at the infrastructure boundary,
calls the pure dry-run planner, writes only an optional deterministic manifest
artifact, reports summary counts, and refuses destructive apply/write verbs.

Slice 42 is complete on this branch. Genesis equivalence now has
runtime-backed comparison basis, reading fact, boundary evidence, mismatch,
summary, and success/failure result nouns. The proof comparer returns
structured expected failures instead of throwing for non-equivalent readings.

Slice 43 is complete on this branch. The first deterministic equivalence
fixtures now cover node lifecycle, edge lifecycle, content attachment metadata,
removed-node visibility, multi-writer non-coordinated ordering, and one
intentional divergent property case.

Slice 44 is complete on this branch. Genesis divergence reporting now selects
the first deterministic proof mismatch and exposes mismatch kind, graph fact
identity, field path, optional writer/patch/operation boundary evidence, and
bounded value summaries as structured report fields.

Slice 45 is complete on this branch. Evidence-backed replanning inspected
remaining raw legacy-property boundaries, migration-domain coverage, dry-run
CLI coverage, and equivalence proof fixtures, then created design docs for
slices 47 through 51 and inserted the v17 golden graph-history fixture as the
new slice 46.

Slice 46 is complete on this branch. A deterministic v17 golden graph-history
fixture now exists as a Git bundle plus manifest. The restore helper initializes
an explicit target repository, fetches the fixture refs, verifies writer heads
and patch counts, and keeps Docker optional instead of making it the fixture
artifact of record.

Slice 47 is complete on this branch. The source inventory collector reads
restored writer refs from Git, decodes patch trailers through the adapter
codec boundary, records writer chains and patch descriptors, derives a source
basis from restored heads, and produces fatal inventory notices when source
refs are absent or malformed.

Slice 48 is complete on this branch. Operation lowering now consumes
successful dry-run plans, emits source/target-basis patch plans with sorted
lowered operation facts, and keeps graph-history writes out of the domain
lowering step.

Slice 49 is complete on this branch. Scratch migration writing now requires an
explicit scratch ref, rejects live `refs/warp/*` targets before writing,
creates deterministic per-operation commits, and appends with CAS-shaped
`git update-ref` calls.

Slice 50 is complete on this branch. Scratch equivalence gating now wraps the
genesis proof and divergence reporter into a promotion decision, with explicit
blocking for missing patch-boundary evidence even when visible readings match.

Slice 51 is complete on this branch. Finalization safety now exists as a pure
precondition gate: no confirmation, failed equivalence, missing archive target,
missing scratch output, or stale live-ref expectation can pass into a future
live-ref update step.

Slice 52 is complete on this branch. Finalization implementation now archives
the old live head under `refs/warp-migration-archive/*` and advances the live
ref to the scratch head with `git update-ref <live> <scratch> <old>`, while
blocking failed safety, existing archive refs, and live-ref drift.

Slice 53 is complete on this branch. The command runner now wires the v18
migration stages in order and only calls finalization when explicit
finalization options are supplied and the equivalence gate passes.

Slice 54 is complete on this branch. Finalization safety now rejects promotion
without runtime conformance evidence for the exact scratch ref/head, which
keeps supplied equivalence readings from masquerading as runtime readability.

Slice 55 is complete on this branch. The content/property closeout audit now
enumerates every current `src/domain` file that still touches raw legacy
content/property compatibility patterns and fails if that set drifts without
review.

## What Feels Wrong

- Content persistence still uses legacy `_content*` compatibility properties.
  Typed reads and writes exist over that plane, but the storage cutover is not
  complete.
- The source audit still finds raw property-map dependencies in named
  compatibility, serialization, replay, reducer/op-strategy, visible-scope,
  logical-index, and migration-source boundaries. The closeout audit pattern is
  `decodePropKey|decodeEdgePropKey|state\\.prop|_content` over `src/domain`.
- Temporal replay still extracts node snapshots from the raw legacy property
  map because historical replay tests carry pre-codec inline fixture classes
  that are not `PropValue`-honest enough for `LegacyPropertyValue`.
- The v18 migration tool can now write scratch history and derive scratch
  operation readings, but it does not yet open scratch output through the full
  production graph runtime.
- Genesis equivalence is a gate vocabulary now, but not yet a full real-history
  ship gate wired through finalization.
- Compact equivalence fixtures are not enough by themselves. The golden v17
  fixture now restores Git refs and source inventory consumes those refs, but
  the command still needs real-history reading construction from migrated Git
  output.
- The next migration work must wire real-history reading and runtime
  conformance providers through finalization, then broaden the evidence beyond
  scratch operation readback where the production runtime needs it.

## Where We Are Heading

The remaining planned slices are the runway from "typed graph-model surfaces
and fixture-level migration proof exist" to "scratch migrated history can be
proven equivalent before finalization."

Suggested implementation batches:

- PR D, slices 41 through 45: merged in PR #103.
- PR E, slices 46 through 55: v17 golden graph-history fixtures, real source
  inventory collection, migration operation lowering, scratch migration
  writing, scratch equivalence gating, finalization safety, finalization
  implementation, end-to-end command wiring, post-migration runtime
  conformance, and content/property closeout audit.

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

## Running Task List

- [x] 1. Sync and clean the v18 runway.
- [x] 2. Create the v18 Continuum compatibility charter.
- [x] 3. Build the cross-repo contract matrix.
- [x] 4. Define git-warp's WARP Optic realization map.
- [x] 5. Add the generated-artifact ingestion path.
- [x] 6. Make evidence posture explicit.
- [x] 7. Prove the patch commit visibility contract.
- [x] 8. Prove same-writer CAS conflict posture.
- [x] 9. Project receipt-family source facts.
- [x] 10. Add the first `warp-ttd` receipt-family smoke.
- [x] 11. Re-plan with evidence from the first ten slices.
- [x] 12. Inventory generated-family readiness.
- [x] 13. Name the tick patch and receipt witness ladder.
- [x] 14. Project runtime-boundary reading-envelope source facts.
- [x] 15. Project runtime-boundary witnessed-suffix source facts.
- [x] 16. Reset the graph-model substrate runway.
- [x] 17. Add runtime-backed node records.
- [x] 18. Add runtime-backed edge records.
- [x] 19. Add the generic attachment-plane substrate.
- [x] 20. Add graph-op algebra projection.
- [x] 21. Reset the content-cutover runway after graph-op algebra.
- [x] 22. Add runtime-backed content attachment payload nouns.
- [x] 23. Add content attachment projection.
- [x] 24. Route public content reads through content projection.
- [x] 25. Route content writes through typed write intent.
- [x] 26. Reset the post-25 property projection runway:
  [0174](design/0174-v18-post-25-property-projection-runway/v18-post-25-property-projection-runway.md).
- [x] 27. Add legacy property projection nouns:
  [0175](design/0175-v18-legacy-property-projection-nouns/v18-legacy-property-projection-nouns.md).
- [x] 28. Add node property projection:
  [0176](design/0176-v18-node-property-projection/v18-node-property-projection.md).
- [x] 29. Add edge property projection:
  [0177](design/0177-v18-edge-property-projection/v18-edge-property-projection.md).
- [x] 30. Route query property reads through projection:
  [0178](design/0178-v18-query-property-projection-reads/v18-query-property-projection-reads.md).
- [x] 31. Route state-reader property views through projection:
  [0179](design/0179-v18-state-reader-property-projection/v18-state-reader-property-projection.md).
- [x] 32. Add property write intent nouns:
  [0180](design/0180-v18-property-write-intent-nouns/v18-property-write-intent-nouns.md).
- [x] 33. Route PatchBuilder property writes through intent lowering:
  [0181](design/0181-v18-patchbuilder-property-intent-lowering/v18-patchbuilder-property-intent-lowering.md).
- [x] 34. Cut graph-op algebra over to property projections:
  [0182](design/0182-v18-graph-op-projection-property-cutover/v18-graph-op-projection-property-cutover.md).
- [x] 35. Close out legacy-property projection with evidence:
  [0183](design/0183-v18-property-projection-closeout/v18-property-projection-closeout.md).
- [x] 36. Add graph-model migration manifest nouns:
  [0184](design/0184-v18-graph-model-migration-manifest/v18-graph-model-migration-manifest.md).
- [x] 37. Add migration source inventory:
  [0185](design/0185-v18-migration-source-inventory/v18-migration-source-inventory.md).
- [x] 38. Add the dry-run state migration planner:
  [0186](design/0186-v18-dry-run-state-migration-planner/v18-dry-run-state-migration-planner.md).
- [x] 39. Add ordered migration history input:
  [0187](design/0187-v18-migration-history-input/v18-migration-history-input.md).
- [x] 40. Add migration manifest serialization:
  [0188](design/0188-v18-migration-manifest-serialization/v18-migration-manifest-serialization.md).
- [x] 41. Add the migration dry-run CLI:
  [0189](design/0189-v18-migration-dry-run-cli/v18-migration-dry-run-cli.md).
- [x] 42. Add genesis equivalence proof nouns:
  [0190](design/0190-v18-genesis-equivalence-nouns/v18-genesis-equivalence-nouns.md).
- [x] 43. Add genesis equivalence fixtures:
  [0191](design/0191-v18-genesis-equivalence-fixtures/v18-genesis-equivalence-fixtures.md).
- [x] 44. Add the genesis divergence reporter:
  [0192](design/0192-v18-genesis-divergence-reporter/v18-genesis-divergence-reporter.md).
- [x] 45. Re-plan with migration evidence in hand:
  [0193](design/0193-v18-replan-with-migration-evidence/v18-replan-with-migration-evidence.md).
- [x] 46. Add v17 golden graph-history fixtures:
  [0199](design/0199-v18-v17-golden-graph-fixtures/v18-v17-golden-graph-fixtures.md).
- [x] 47. Add real source inventory collection:
  [0194](design/0194-v18-real-source-inventory-collector/v18-real-source-inventory-collector.md).
- [x] 48. Add migration operation lowering:
  [0195](design/0195-v18-migration-operation-lowering/v18-migration-operation-lowering.md).
- [x] 49. Add the scratch migration writer:
  [0196](design/0196-v18-scratch-migration-writer/v18-scratch-migration-writer.md).
- [x] 50. Add the scratch equivalence gate:
  [0197](design/0197-v18-scratch-equivalence-gate/v18-scratch-equivalence-gate.md).
- [x] 51. Design migration finalization safety:
  [0198](design/0198-v18-migration-finalization-safety/v18-migration-finalization-safety.md).
- [x] 52. Implement archive-preserving migration finalization:
  [0200](design/0200-v18-migration-finalization-implementation/v18-migration-finalization-implementation.md).
- [x] 53. Wire the end-to-end migration command:
  [0201](design/0201-v18-migration-command-wiring/v18-migration-command-wiring.md).
- [x] 54. Prove post-migration runtime conformance:
  [0202](design/0202-v18-post-migration-runtime-conformance/v18-post-migration-runtime-conformance.md).
- [x] 55. Close the content/property migration audit:
  [0203](design/0203-v18-content-property-closeout-audit/v18-content-property-closeout-audit.md).
- [x] 56. Construct legacy fixture genesis readings:
  [0204](design/0204-v18-legacy-fixture-reading-construction/v18-legacy-fixture-reading-construction.md).
- [x] 57. Construct scratch operation genesis readings:
  [0205](design/0205-v18-scratch-operation-reading-construction/v18-scratch-operation-reading-construction.md).
- [x] 58. Add command reading providers:
  [0206](design/0206-v18-command-reading-providers/v18-command-reading-providers.md).
- [x] 59. Add a scratch runtime conformance provider:
  [0207](design/0207-v18-scratch-runtime-conformance-provider/v18-scratch-runtime-conformance-provider.md).
- [x] 60. Prove command finalization with providers:
  [0208](design/0208-v18-command-provider-finalization/v18-command-provider-finalization.md).
- [x] 61. Add provider-built divergence coverage:
  [0209](design/0209-v18-provider-divergence-coverage/v18-provider-divergence-coverage.md).
- [x] 62. Add migration command report output:
  [0210](design/0210-v18-migration-command-report/v18-migration-command-report.md).
- [x] 63. Add a migration command CLI wrapper:
  [0211](design/0211-v18-migration-command-cli-wrapper/v18-migration-command-cli-wrapper.md).
