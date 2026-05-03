# 0111 v17 Optics Causal Slice Architecture

- Status: `draft for human approval`
- Release lane: `v17.0.0`
- Source: `0111-v17-optics-architecture-and-foundation-plan`
- Design role: architecture doctrine and theory alignment
- Review audience: maintainers and future agents
- Delivery scope: see `0112-v17-foundation-delivery-plan`

## Hill

Explain the full architecture so v17 implementation does not lose the plot:
there is no privileged materialized graph, a WARP optic is an observer in
action, and the system stores witnessed causal history that can be read through
lawful optics.

This document is the cathedral map. It is not the v17 implementation scope.
The narrow delivery scope is `0112-v17-foundation-delivery-plan.md`.

## Cycle Boundary

This cycle is design only.

It does not:

- edit production code
- write implementation tests
- remove `_materializeGraph()`
- generate backlog cards
- add cryptographic commitments
- specify the Continuum wire protocol as v17 scope
- add Echo interoperability as v17 scope

## Sources Read

Compass doctrine:

- `/Users/james/git/blog/there-is-no-graph.md`
- `/Users/james/git/blog/aion-paper-07/dist/aion-paper-07.txt`
- `/Users/james/git/aion-og-1/dist/observer_geometry_1.txt`
- `/Users/james/git/aion-og-2/dist/observer_geometry_2.txt`

Continuum material:

- `/Users/james/git/mktxt/continuum.txt`
- `/Users/james/git/mktxt/continuum_toc.md`
- `/Users/james/git/continuum/docs/OVERVIEW.md`
- `/Users/james/git/continuum/docs/invariants/CONTINUUM.md`
- `/Users/james/git/continuum/docs/design/0016-engine-local-vs-shared-observer-contract/README.md`
- `/Users/james/git/continuum/docs/design/0018-one-graph-two-temperatures-and-runtime-handoff/README.md`
- `/Users/james/git/continuum/docs/design/0020-shared-admission-and-policy-publication/README.md`
- `/Users/james/git/continuum/docs/design/0027-witnessed-causal-suffix-sync/README.md`
- `/Users/james/git/continuum/docs/design/0028-minimum-runtime-boundary-contract-family/README.md`

Requested files not present:

- `/Users/james/git/mktxt/mktxt_aggregate.txt`
- `/Users/james/git/mktxt/mktxt_aggregate_toc.txt`

Repo anchors:

- `docs/design/0107-v17-reality-check.md`
- `docs/design/0109-large-graph-bounded-residency-validation.md`
- `docs/design/0110-graph-query-bounded-read-model-provider.md`
- `docs/design/holography-and-warp-optics.md`
- `docs/design/warp-optic-worked-example.md`
- `docs/design/observer-optics-and-effect-architecture.tex`

Current code anchors:

- `src/domain/services/controllers/QueryController.ts`
- `src/domain/services/query/LiveQueryReadModelProvider.ts`
- `src/domain/services/query/StateQueryReadModel.ts`
- `src/domain/services/query/QueryReadModelProvider.ts`
- `src/domain/services/query/QueryRunner.ts`
- `src/domain/services/query/Observer.ts`
- `src/domain/services/Worldline.ts`
- `src/domain/services/query/LogicalTraversal.ts`
- `src/domain/services/query/GraphTraversal.ts`
- `src/domain/services/query/TraversalContext.ts`
- `src/domain/services/query/AdjacencyNeighborProvider.ts`
- `src/domain/services/controllers/QueryReads.ts`
- `src/domain/services/controllers/QueryContent.ts`
- `src/domain/services/controllers/MaterializeController.ts`
- `src/domain/services/controllers/CheckpointController.ts`
- `src/domain/services/index/BitmapNeighborProvider.ts`
- `src/domain/services/index/BitmapIndexReader.ts`
- `src/domain/services/index/LogicalIndexReader.ts`
- `src/domain/services/index/StreamingBitmapIndexBuilder.ts`
- `src/domain/artifacts/IndexShard.ts`
- `src/domain/artifacts/ReceiptShard.ts`
- `src/domain/types/TickReceipt.ts`
- `src/domain/services/ReceiptBuilder.ts`
- `src/ports/WarpStateCachePort.ts`
- `src/ports/SeekCachePort.ts`
- `src/ports/StreamingIndexStoragePort.ts`

## Controlling Doctrine

There is no graph.

The system stores witnessed causal history:

- admitted transitions
- frontiers
- lane identities
- payload hashes
- receipts
- witnesses
- checkpoints
- boundary artifacts

Graph-like structure is an observer-relative reading over that history. It is
real as a lawful projection, but it is not the substrate, not the source of
truth, and not the default internal object that reads should load.

The practical translation is:

- say causal history, not graph-in-itself
- say witnessed suffix exchange, not graph sync
- say materialized reading, not state truth
- say observe through an optic, not query the substrate

## Core Model

Internally, everything is a braid.

A braid may contain one lane or many lanes. A single-lane braid is still a
braid because the execution engine should not need a separate ontology when a
second lane appears.

The nouns are:

- Worldline: a canonical named braid entrypoint.
- Strand: a derived, scoped, or fork-relative braid entrypoint.
- Braid: the internal causal weave over one or more lanes.
- BraidOptic: the canonical execution engine.
- Optic: the blessed user-facing observer API.
- Plumber: the explicit low-level operational substrate API.
- Observer: the lawful actor that slices, lowers, witnesses, retains,
  projects, and evolves.

The Optic API is the product surface. The Plumber API is not a secret read
path. It is the place for operations that may export, prewarm, inspect, repair,
or deliberately materialize a large universe.

## Execution Law

A WARP optic is an observer in action.

Every operation follows:

```text
slice -> lower -> witness -> retain -> project -> evolve
```

This applies to:

- reads
- ticks
- merges
- braid collapse
- imports
- property certificates
- recursive WARP revelation

The architecture goal is that every output is first-class and witness-bearing:

- tick receipt
- merge shell
- braid shell
- import shell
- property certificate
- slice result
- optic result

Those outputs can later be:

- folded
- revealed
- compared
- transported
- verified
- cached
- used as input to another optic

v17 does not need to ship all of these product shapes. It does need to avoid
blocking them by returning fake identities or hiding full materialization behind
the read API.

## Architecture Pipeline

The full architecture pipeline is:

```text
Worldline / Strand
  -> Braid
    -> BraidOptic
      -> Intent
        -> CausalSlicePlanner
          -> WitnessLocator
            -> SliceReducer
              -> HolographicReading
              -> IndexDelta
              -> SliceCache / CAS retention
```

Intent includes:

- `FactIntent`
- `ReadIntent`
- `TickIntent`
- `MergeIntent`
- `BraidIntent`
- `ImportIntent`
- `AttachmentIntent`
- `RecursiveWarpIntent`

This is the architecture map. `0112` defines which slice of it v17 actually
ships.

## Optic API

Normal users use optics.

Example target shape:

```ts
await worldline.optic().node(id).read();
await worldline.optic().node(id).prop("title").read();
await worldline.optic().node(id).neighbors().read();
await strand.optic().from(id).traverse({ depth: 3 }).read();
await worldline.optic().node(id).attachment("body").ref();
await worldline.optic().node(id).attachment("body").stream();

await worldline
  .optic()
  .node(id)
  .attachment("subgraph")
  .warp()
  .optic()
  .node(childId)
  .read();
```

These examples are architecture targets, not the v17 minimum. The v17 minimum
is intentionally smaller.

## Plumber API

Operational users use plumber.

Example target shape:

```ts
await worldline.plumber().prewarmIndexes().run();
await worldline.plumber().exportUniverse().run();
await worldline.plumber().inspectCheckpoint(ref).run();
await worldline.plumber().repairIndexes().run();
```

Plumber operations are explicit, low-level, and may be expensive. They are not
the blessed read API.

Full materialization, if it survives, belongs here as an export, prewarm,
checkpoint, or universe operation. It must not be the hidden substrate for
ordinary reads.

## Fact Slices

Everything read through optics is a fact slice:

```text
(entity, aspect, coordinate) -> witness-bearing value
```

Examples:

```text
(node:xyz, liveness, C) -> alive
(node:xyz, prop:title, C) -> "hello"
(edge:abc, liveness, C) -> alive
(edge:abc, prop:weight, C) -> 5
(node:xyz, attachment:body, C) -> attachmentRef
(node:xyz, attachment:subwarp, C) -> recursiveWarpRef
(node:xyz, neighbors:out, C) -> neighborSlice
```

Rules:

- `node(id).read()` must not imply all props, edges, and attachments.
- Expansion is explicit.
- Property reads support property-level slices.
- Attachment content is streamed or referenced explicitly.
- Neighbor reads return neighbor slices, not a materialized universe.

## Hologram Levels

Ticks give time.

Merges give decisions.

Braids give shape.

### Tick Hologram

Represents:

```text
this happened
```

Can materialize or project:

- event-level slices
- entity facts
- local state transitions
- fine-grained replay evidence

### Merge Hologram

Represents:

```text
these histories were reconciled under this admissibility law
```

Can materialize or project:

- resolution decisions
- conflict explanations
- resolved facts
- diffs between realities
- reconciliation proofs

### Braid Hologram

Represents:

```text
this is the consistent weave of these lanes
```

Can materialize or project:

- multi-lane structure
- overlay views
- cross-branch traversal surfaces
- consistency envelopes
- divergence surfaces
- convergence surfaces

Holograms are the future product shape for witness-bearing retained outputs.
They are not all v17 deliverables.

## Indexing And Storage Model

Truth:

```text
WARP witnessed log = source of truth
```

Navigation:

```text
Temporal inverted indexes = navigation
```

Acceleration:

```text
Roaring bitmap posting lists = compressed set algebra, not truth
```

Storage:

```text
CAS/Git = immutable storage for witnesses, bitmap pages, attachment chunks,
recursive WARP refs, and retained slice holograms
```

Full architecture indexes:

- entity to witnesses
- witness to entities
- entity/property to witnesses
- node to outgoing edge ids
- node to incoming edge ids
- attachment to witnesses
- recursive WARP attachment to child WARP coordinate
- shard freshness / last-touch coordinate

Rules:

- Rich coordinates, entities, and witnesses use dictionaries to integer IDs.
- Roaring stores integer posting lists.
- Indexes are sharded, CAS-backed, lazy-loaded, and LRU-cached.
- Do not assume indexes fit in memory.
- Last-touch indexes are freshness and cache-validation hints, not truth.
- `SliceReducer` computes truth from witnesses.

The full Roaring/CAS slice-cache system is future work unless the v17
foundation discovers that a minimal bounded read cannot ship without a smaller
index slice.

## Causal Cache Model

Semantic address names the question.

CAS hash names the answer.

Full cache keys include:

- braid, worldline, or strand coordinate
- observer aperture
- intent or fact intent
- `witnessSetHash`
- reducer or law version
- projection version

Cache values are witness-bearing holograms.

Reuse rule:

For a requested slice, find the maximal cached causal frontier contained in the
requested causal cone, then reduce only the missing witnesses.

Linear example:

```text
D history: A -> B -> C -> D
F history: A -> B -> X -> F
```

After materializing `C`, the cache has `A/B/C`. Later materializing `F` reuses
`A/B` and only reduces `X/F`.

General rule:

- frontiers are vector or antichain coordinates, not scalar ticks
- reuse is based on causal containment
- correctness must not key on last modified tick alone

The CAS slice cache is future work, not v17 foundation scope.

## Attachment Model

Every entity may have attachments.

Attachments may be large. Attachments may descend into another recursive WARP.

Rules:

- Entity slices return attachment refs, not attachment content.
- Attachment content is streamed explicitly.
- Recursive WARP attachment becomes a nested braid/optic source.
- Attachments must not load as part of default entity reads.

Full recursive WARP optics are future scope unless v17 needs only a narrow ref
shape to avoid loading attachment bodies.

## Hash And Identity Model

Names must say what they identify.

- `stateHash` names a full visible materialized graph-like reading only.
- `sliceHash` names a reduced slice result.
- `witnessSetHash` names the witnesses used.
- `readIdentity` names coordinate, intent, witness set, reducer or law version,
  and projection version.

Rules:

- Do not return checkpoint `stateHash` for stale live reads.
- Do not invent fake `stateHash`.
- If a result is not a full visible materialized reading, do not call its hash
  `stateHash`.

## LWW And Admissibility

Paper 7 rejects last-write-wins as truth. Preserve that.

LWW is allowed only as an admissibility or projection law for suitable property
facts.

LWW is forbidden as foundational truth.

The doctrine:

- Truth is the retained witness set.
- Lowered value is a projection under a law.
- Node and edge liveness must not be LWW.
- Structure and topology remain causal and witnessed.

One-liner:

```text
LWW is allowed as a lens, forbidden as reality.
```

## Traversal Model

Traversal is not client-owned walking over materialized state.

Traversal is progressive expansion of causal neighbor slices.

Rules:

- Traversal expands through lazy neighbor slices.
- Traversal does not own storage.
- `BraidOptic` uses a `WitnessNeighborProvider` or equivalent.
- Neighbor slices may build or update bitmap pages incrementally.
- Lazy materialization is index-producing.
- Reads leave useful cache and index breadcrumbs.

Full traversal algebra is future work unless the codex-think v17 acceptance
fixture proves a minimal neighbor optic is required.

## Materialization Doctrine

Full graph-like materialization is not the read substrate.

Full materialization is the universe optic or Plumber export/prewarm operation,
if it survives.

Implementation rules for later cycles:

- `_materializeGraph()` must leave public read paths.
- No hidden full-materialization fallback is allowed.
- No compatibility shim may call `_materializeGraph()` for blessed reads.
- v17 is major, so legacy read API compatibility is not required.
- Git history preserves legacy behavior.
- Upgrade scripts handle internal data representation changes if needed.

## Continuum Relationship

Continuum is a protocol family for witnessed causal history, not a graph
protocol.

Continuum core vocabulary should say:

- causal history
- lane
- worldline
- strand
- braid
- witnessed suffix
- admission outcome
- observer reading
- receipt
- shell
- obstruction

Graph-like language belongs only to observer-relative product readings or
runtime-local compatibility descriptions. It must not become Continuum core
truth.

Echo and `git-warp` are independent runtimes. They may interoperate through
Continuum because they exchange witnessed causal suffixes and shared observer
contract families, not because they share a runtime or copy materialized state.

The cross-runtime law is:

- one shared witnessed causal history
- compatible observer-relative readings
- engine-local freedom for storage and scheduling
- shared admission outcome families
- witnessed import/export shells
- no state replication folklore

## IPA And Proof Systems

WARP holograms are witness-bearing retained outputs.

They are not automatically cryptographic zero-knowledge proofs.

Future proof backends may lower retained holograms into IPA, SNARK, STARK, or
similar proof systems. IPA means Inner Product Argument.

The phrase to preserve:

```text
IPA is a future proof backend over retained holograms, not the v17 storage
substrate.
```

Proof-carrying execution is future work unless a proof layer already exists in
the repo. v17 must avoid destroying witness structure that future proof systems
would need.

## Roadmap

The architecture roadmap is:

- v17 Foundation
- v18 Optics
- v19 Holograms
- v20 Commitments
- v21 Continuum Protocol
- v22 Proof-Carrying Execution

v17 ships the foundation slice. Later phases ship more of the architecture.
v17 is not the Continuum release. v17 is the release that makes Continuum
possible.

## Open Questions

- How small can the v17 witness identity be while still avoiding fake
  `stateHash`?
- Does the codex-think fixture require neighbor reads in v17, or are exact node
  and property slices enough?
- Which existing checkpoint or receipt artifacts can honestly seed a minimal
  bounded read without turning stale state into truth?
- Where should public legacy read APIs be cut instead of shimmed?
- Which future hologram nouns need reserved names now, and which should wait
  until v19?
