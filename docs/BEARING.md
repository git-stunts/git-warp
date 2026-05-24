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

- Branch: `v18-continuum-slices-36-40`
- Base branch: `main`
- Current `origin/main`: `f9230f09`
- Latest merged PR: #101, v18 property projection cutover
- Latest released package line: `17.0.1`
- Latest completed implementation cycle:
  `0183-v18-property-projection-closeout`
- Current work: v18 slices 36 through 40 are the active dry-run migration
  batch on this branch.
- Cleanup checkpoint: `main` has been fast-forwarded to `origin/main` after
  PR #101 merged; this branch starts from that merge commit.

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

That is useful progress, not a finish line. The repo still needs property
projection beyond replay/serialization boundaries, graph-model migration
tooling, and genesis replay equivalence before v18 can make stronger
compatibility claims.

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

This branch starts PR C, v18 slices 36 through 40:

- graph-model migration manifest nouns;
- migration source inventory;
- dry-run state migration planner;
- ordered migration history input;
- migration manifest serialization.

Slice 36 is complete on this branch. The migration manifest root now exists
as a frozen domain noun, with runtime-backed basis, mapping, warning, and
fatal-error entries. It does not serialize, read Git, or write graph history.

## What Feels Wrong

- Content persistence still uses legacy `_content*` compatibility properties.
  Typed reads and writes exist over that plane, but the storage cutover is not
  complete.
- Temporal replay still extracts node snapshots from the raw legacy property
  map because historical replay tests carry pre-codec inline fixture classes
  that are not `PropValue`-honest enough for `LegacyPropertyValue`.
- Checkpoint, serializer, state-diff, visible-scope, logical-index,
  reducer/op-strategy, and content-projection code still touch the raw
  property map as named compatibility or migration boundaries.
- The v18 migration tool does not exist yet. Starting with a write-capable
  script would be reckless; the next migration work must be dry-run first.
- Genesis replay equivalence has not been proven. Migration cannot be trusted
  without structured divergence evidence.
- The repo has enough graph-model pieces that vague planning is now more
  dangerous than helpful. The next slices need design documents before code.

## Where We Are Heading

The remaining planned slices are the runway from "typed graph-model surfaces
exist" to "we have enough evidence to decide the migration path."

Suggested implementation batches:

- PR B, slices 31 through 35: state-reader routing, property write intents,
  graph-op property cutover, and property-projection closeout.
- PR C, slices 36 through 40: migration manifest, source inventory, dry-run
  planner, history input, and manifest serialization.
- PR D, slices 41 through 45: dry-run CLI, equivalence nouns, fixtures,
  divergence reporter, and evidence-backed replan.

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
- [ ] 37. Add migration source inventory:
  [0185](design/0185-v18-migration-source-inventory/v18-migration-source-inventory.md).
- [ ] 38. Add the dry-run state migration planner:
  [0186](design/0186-v18-dry-run-state-migration-planner/v18-dry-run-state-migration-planner.md).
- [ ] 39. Add ordered migration history input:
  [0187](design/0187-v18-migration-history-input/v18-migration-history-input.md).
- [ ] 40. Add migration manifest serialization:
  [0188](design/0188-v18-migration-manifest-serialization/v18-migration-manifest-serialization.md).
- [ ] 41. Add the migration dry-run CLI:
  [0189](design/0189-v18-migration-dry-run-cli/v18-migration-dry-run-cli.md).
- [ ] 42. Add genesis equivalence proof nouns:
  [0190](design/0190-v18-genesis-equivalence-nouns/v18-genesis-equivalence-nouns.md).
- [ ] 43. Add genesis equivalence fixtures:
  [0191](design/0191-v18-genesis-equivalence-fixtures/v18-genesis-equivalence-fixtures.md).
- [ ] 44. Add the genesis divergence reporter:
  [0192](design/0192-v18-genesis-divergence-reporter/v18-genesis-divergence-reporter.md).
- [ ] 45. Re-plan with migration evidence in hand:
  [0193](design/0193-v18-replan-with-migration-evidence/v18-replan-with-migration-evidence.md).
