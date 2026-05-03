# 0111 v17 Optics Causal Slice Spec

- Status: `draft for human approval`
- Release lane: `v17.0.0`
- Source: `0111-v17-optics-causal-slice-spec`
- Design role: controlling v17 optics architecture spec after approval
- Review audience: maintainers and future agents
- Sponsor human: James Ross
- Sponsor agent: Codex

## Hill

Define the v17 mental model and API split before implementation: normal reads
must become witness-bearing optics over worldlines, strands, and braids, while
full graph materialization moves out of blessed read paths.

This cycle is design/spec only. It does not edit production code, write
implementation tests, delete `_materializeGraph()`, or create backlog cards.

## Playback Questions

Human questions:

- Does this spec preserve the Paper 7 model that a WARP optic is an observer in
  action?
- Does it make full materialization a low-level Plumber operation instead of the
  default read substrate?
- Does it give enough detail to approve or reject the v17 implementation model
  before code changes begin?

Agent questions:

- Can a future implementation replace public read paths that call
  `_materializeGraph()` with causal fact slices without changing the mental
  model midstream?
- Can the acceptance criteria be checked by code review and tests in later
  cycles?
- Are the current code seams and their risks anchored to existing files?

## Postures

Accessibility / assistive reading posture: this is a text-only architecture
spec. Diagrams are written as plain text pipelines and tables so they remain
legible in linear reading order.

Localization / directionality posture: this spec defines API and domain nouns,
not user-facing UI copy. Direction words such as incoming and outgoing are graph
semantics, not layout directions.

Agent inspectability / explainability posture: every runtime output named here
is witness-bearing. The pipeline keeps intent, witness set, reducer law,
projection law, cache identity, and retained hologram explicit so later agents
can audit why an answer exists.

## Sources Read

Background papers:

- `/Users/james/git/blog/aion-paper-07/dist/aion-paper-07.txt`
- `/Users/james/git/aion-og-1/dist/observer_geometry_1.txt`
- `/Users/james/git/aion-og-2/dist/observer_geometry_2.txt`

Repo design docs:

- `docs/METHOD.md`
- `docs/ANTI_SLUDGE_POLICY.md`
- `docs/ANTI_SLUDGE_DECISIONS.md`
- `docs/SYSTEMS_STYLE_TYPESCRIPT.md`
- `docs/design/0107-v17-reality-check.md`
- `docs/design/0109-large-graph-bounded-residency-validation.md`
- `docs/design/0110-graph-query-bounded-read-model-provider.md`
- `docs/design/holography-and-warp-optics.md`
- `docs/design/warp-optic-worked-example.md`
- `docs/design/observer-optics-and-effect-architecture.tex`

Current source anchors:

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

## Controlling Decision

v17 is a major architecture turn. There is no legacy public API compatibility
requirement for read APIs that make bounded residency impossible.

Git history preserves legacy behavior. Upgrade scripts handle internal data
representation changes if implementation changes require migration.

The v17 read center is:

```text
worldline/strand/braid entrypoint -> optic -> witness-bearing hologram
```

The v17 operational substrate is:

```text
worldline/strand/braid entrypoint -> plumber -> explicit expensive operation
```

Full graph materialization is not the default read substrate. If it survives, it
is a universe optic or a Plumber export, prewarm, repair, or inspection
operation.

## Milestone Hills

1. 100% TypeScript.
2. Bounded memory issues eliminated for massive graphs.
3. Main API is optics over braids, worldlines, and strands.
4. Clients should not materialize graphs or write custom traversals.
5. Full materialization is not the default read substrate.
6. WARP outputs are witness-bearing holograms.

## Core Execution Law

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

Every output is first-class and witness-bearing:

- tick receipt
- merge shell
- braid shell
- import shell
- property certificate
- slice result
- optic result

These outputs can later be:

- folded
- revealed
- compared
- transported
- verified
- cached
- used as input to another optic

## Conceptual Model

### Runtime Normal Form

Internally, everything presented to the v17 execution engine is a braid.

This is a runtime-normalizing statement, not a deletion of the Paper 7 noun map.
Paper 7 defines lanes, worldlines, strands, braids, weaves, optics, and
holograms. v17 keeps those nouns, but `BraidOptic` receives them through one
normal form:

- A braid may contain one lane or many lanes.
- A worldline is a named, canonical braid entrypoint.
- A strand is a derived or scoped braid entrypoint.
- A multi-lane braid is the explicit comparison surface for plural lane claims.
- `BraidOptic` is the canonical execution engine.
- An `Optic` is an observer applying an admissible act over a braid.
- An observer can slice, lower, witness, retain, project, and evolve.
- `Plumber` is the explicit operational substrate API.
- `Optic` is the blessed user-facing API.

The practical rule is simple: the public read API never asks the client to
choose between graph materialization, index peeking, or hand traversal. The
client states an optic intent. The engine finds the causal slice, lowers it
under the relevant law, retains the witness-bearing result, and projects the
requested reading.

### Paper 7 Alignment

Paper 7's control law is:

```text
project / slice / normalise -> lawful lowering -> retain
```

v17 specializes that into an execution pipeline for Git-backed WARP data. The
terms map as follows:

| Paper 7 noun | v17 runtime noun |
| --- | --- |
| Observer plan | Observer aperture and projection plan |
| Optic slice | Causal fact slice |
| Set-side lowering | `SliceReducer` under an admissibility law |
| Witness | Witness set plus reducer decisions |
| Shell / hologram | Retained optic result in CAS/Git |
| Reveal | Projected API result |
| Fold | Cache, checkpoint, or shell-equivalent retention rewrite |

The core invariant is that witnessed causal history is primary. The graph is a
frontier-relative chart emitted by an observer. Full graph state is one possible
chart, not the runtime's privileged substrate.

## API Split

### Optic API

Normal users use optics.

Examples:

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

Optic calls are bounded by default. They return witness-bearing results, not
raw full graph state. Expansion is explicit.

Expected user-facing concepts:

- `worldline.optic()` opens the canonical braid entrypoint for a worldline.
- `strand.optic()` opens a scoped braid entrypoint.
- `braid.optic()` opens an explicit multi-lane comparison surface.
- `node(id).read()` reads the node liveness and selected default facts only.
- `node(id).prop(key).read()` reads a property-level fact slice.
- `node(id).neighbors().read()` reads a causal neighbor slice.
- `attachment(name).ref()` reads only the attachment reference.
- `attachment(name).stream()` streams attachment bytes explicitly.
- `attachment(name).warp()` opens a recursive WARP source as another
  braid/worldline/strand optic source.

### Plumber API

Operational users use Plumber.

Examples:

```ts
await worldline.plumber().prewarmIndexes().run();
await worldline.plumber().exportUniverse().run();
await worldline.plumber().inspectCheckpoint(ref).run();
await worldline.plumber().repairIndexes().run();
```

Plumber operations are explicit, low-level, and may be expensive. They are not
the blessed read API.

Plumber is allowed to:

- prewarm indexes
- export the universe
- inspect checkpoints
- repair indexes
- rebuild or verify retained shells
- run migration checks
- perform full graph materialization when named as such

Plumber is not allowed to become a hidden fallback for optic reads.

## Required Execution Pipeline

The v17 pipeline is:

```text
Worldline / Strand
  -> Braid
    -> BraidOptic
      -> Intent
        -> CausalSlicePlanner
          -> WitnessLocator
            -> SliceReducer
              -> Hologram
              -> IndexDelta
              -> SliceCache / CAS retention
```

`Intent` includes:

- `FactIntent`
- `ReadIntent`
- `TickIntent`
- `MergeIntent`
- `BraidIntent`
- `ImportIntent`
- `AttachmentIntent`
- `RecursiveWarpIntent`

Execution obligations:

- `CausalSlicePlanner` computes the smallest causal cone and index plan needed
  for the intent.
- `WitnessLocator` resolves witness identities and loads only required witness
  payloads.
- `SliceReducer` computes truth from witnesses under a named law.
- `Hologram` retains the witness-bearing answer.
- `IndexDelta` records navigation work learned during the read or lowering.
- `SliceCache / CAS retention` stores reusable results without making cache
  entries truth.

## Fact Model

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
- Attachment reads return references or streams explicitly.
- Neighbor reads return a witness-bearing neighbor slice, not full adjacency.
- A slice result includes the witnesses used and the projection law applied.

Fact slices give the implementation a replacement for the current
materialized-state read model. A node read no longer needs a `WarpState`. It
needs the liveness witness set for that node at the requested coordinate and
the reducer law that decides whether those witnesses lower to alive, dead,
plural, conflict, or obstruction.

## Hologram Levels

v17 distinguishes at least three hologram levels.

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

Tick holograms are closest to the current `TickReceipt` family, but v17 must
keep explanatory receipt data distinct from replay-sufficient witness data.

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

Merge holograms are not silent overwrite records. They retain the decision
surface and the witness explaining why a derived, plural, conflict, or
obstruction result was lawful.

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
- divergence/convergence surfaces

Core one-liner:

```text
Ticks give time.
Merges give decisions.
Braids give shape.
```

## Indexing And Data Model

### Truth

WARP witnessed log is the source of truth.

The witnessed log includes admitted transitions, frontiers, witness payloads,
retained shells, and append-only causal evidence. It is not replaced by a
checkpoint, an index, a bitmap page, or a cache entry.

### Navigation

Temporal inverted indexes are navigation.

Indexes answer questions such as "which witnesses mention this entity or
aspect?" and "which edge witnesses can affect this neighbor slice?" They find
candidate witnesses. They do not decide truth.

### Acceleration

Roaring bitmap posting lists are compressed set algebra, not truth.

Roaring bitmaps are appropriate for integer posting lists, set union,
intersection, and difference. They must never become the authority for whether
a fact is true.

### Storage

CAS/Git stores immutable artifacts:

- witnesses
- bitmap pages
- attachment chunks
- recursive WARP refs
- retained slice holograms
- retained index shard pages

### Required Indexes

v17 requires these logical indexes:

- Entity -> witnesses
- Witness -> entities
- Entity/property -> witnesses
- Node -> outgoing edge ids
- Node -> incoming edge ids
- Attachment -> witnesses
- Recursive WARP attachment -> child WARP coordinate
- Shard freshness / last-touch coordinate

Rules:

- Rich coordinates, entities, and witnesses use dictionaries to integer IDs.
- Roaring stores integer posting lists.
- Indexes are sharded, CAS-backed, lazy-loaded, and LRU-cached.
- Do not assume indexes fit in memory.
- Last-touch indexes are freshness and cache-validation hints, not truth.
- `SliceReducer` computes truth from witnesses.

### Current Index Code Implications

The repo already has useful pieces but not the full v17 model:

- `BitmapNeighborProvider` already implements a `NeighborProviderPort`
  compatible traversal seam.
- `LogicalIndexReader` reads logical bitmap indexes and exposes liveness and
  edge lookup surfaces.
- `StreamingBitmapIndexBuilder` writes chunked bitmap index pages through
  `StreamingIndexStoragePort`.
- `BitmapIndexReader` lazily loads bitmap shards but currently builds an
  ID-to-SHA cache for DAG lookup. v17 must avoid any equivalent unbounded global
  dictionary assumption in the main optic path.
- `QueryReads` can try indexed props and neighbors, but it still calls
  `_ensureFreshState()` first, so indexes are currently acceleration over a
  materialized-state path, not the source of bounded reads.

## Causal Cache Model

Semantic address names the question.

CAS hash names the answer.

Cache key must include:

- braid/worldline/strand coordinate
- observer aperture
- intent/fact intent
- `witnessSetHash`
- reducer/law version
- projection version

Cache value is a witness-bearing hologram.

Reuse rule:

For a requested slice, find the maximal cached causal frontier contained in the
requested causal cone, then reduce only the missing witnesses.

Linear example:

```text
D history: A -> B -> C -> D
F history: A -> B -> X -> F

After materializing C, cache has A/B/C.
Later materializing F reuses A/B and only reduces X/F.
```

Generalization:

- Frontiers are vector or antichain coordinates, not scalar ticks.
- Reuse is based on causal containment.
- Correctness must not key on "last modified tick" alone.
- A cache hit is valid only when the retained witness frontier is contained in
  the requested causal cone and the reducer/projection versions match.
- A cache hit may accelerate a slice, but the witness-bearing hologram remains
  the auditable answer.

This replaces the current seek-cache shape, which keys serialized full
`WarpState` snapshots by ceiling and frontier. v17 can keep a Plumber universe
cache, but optic cache identity must be question-shaped and witness-shaped.

## Attachment Model

Every entity may have attachments.

Attachments may be large.

Attachments may descend into another recursive WARP.

Rules:

- Entity slice returns attachment refs, not attachment content.
- Attachment content is streamed explicitly.
- Recursive WARP attachment becomes a nested braid/optic source.
- Attachments must not be loaded as part of default entity reads.
- Attachment refs are fact aspects:
  `(entity, attachment:name, coordinate) -> attachmentRef`.
- Recursive WARP refs are fact aspects:
  `(entity, attachment:name, coordinate) -> recursiveWarpRef`.
- Attachment chunks live in CAS/Git and can be streamed through a port.

Current code already distinguishes content OID, metadata, bytes, and streams in
`QueryContent`, but those methods still begin by ensuring materialized state.
v17 must move attachment reference lookup into fact slices so `ref()` does not
materialize the graph, and `stream()` does not load bytes until explicitly
requested.

## Hash And Identity Model

Hash names must not lie.

- `stateHash` = full visible graph hash only.
- `sliceHash` = reduced slice result hash.
- `witnessSetHash` = witnesses used.
- `readIdentity` = coordinate + intent + `witnessSetHash` + reducer/law
  version.

Rules:

- Do not return checkpoint `stateHash` for stale live reads.
- Do not invent fake `stateHash`.
- If a result is not a full graph state, do not call its hash `stateHash`.
- A stale checkpoint may be a cache frontier, not a live result identity.
- A slice result should expose `sliceHash`, `witnessSetHash`, and
  `readIdentity`, not pretend to be a full graph state.

This is a direct response to 0110: the current `QueryReadModel` requires a
synchronous `stateHash: string`. That contract pressures the implementation to
return a checkpoint hash for live reads or invent a query hash. Both are public
API lies. v17 optics must change the result identity model instead.

## LWW And Admissibility Doctrine

Paper 7 and OG-II reject LWW as truth. v17 preserves that rejection.

Rules:

- LWW is allowed only as an admissibility or projection law for suitable
  property facts.
- LWW is forbidden as foundational truth.
- Truth is retained witness set.
- Lowered value is a projection under a law.
- Node and edge liveness must not be LWW.
- Structure and topology must remain causal and witnessed.

One-liner:

```text
LWW is allowed as a lens, forbidden as reality.
```

Existing code uses LWW registers for property values and receipt outcomes. That
can remain a property projection law where appropriate, but v17 must retain the
witnesses that let another lawful observer reveal conflict, provenance, or
alternative projection. A property read may lower to a single value under LWW;
the retained result still carries the witness set and law version.

## Traversal Model

Traversal is not client-owned graph walking over materialized state.

Traversal is:

```text
progressive expansion of causal neighbor slices
```

Rules:

- Traversal expands through lazy neighbor slices.
- Traversal should not own storage.
- `BraidOptic` uses a `WitnessNeighborProvider` or equivalent.
- Neighbor slices may build or update Roaring bitmap pages incrementally.
- Lazy materialization must be index-producing.
- Reads leave useful cache/index breadcrumbs.

Current code has a useful split:

- `GraphTraversal` accepts a `NeighborProviderPort`.
- `TraversalContext` already has a bounded LRU neighbor cache for async
  providers.
- `BitmapNeighborProvider` can back neighbor access from indexes.

Current code also has a forbidden public-read pattern:

- `LogicalTraversal` prepares traversal by calling `_materializeGraph()`.
- `Observer.traverse` and `Worldline.traverse` expose `LogicalTraversal`.

v17 implementation must preserve the provider-shaped traversal engine and
replace the materialize-first public traversal entrypoints with optic traversal
over witness-backed neighbor slices.

## Materialization Doctrine

Full graph materialization is not the read substrate.

Rules:

- Full graph materialization is the universe optic or Plumber export/prewarm
  operation, if it survives.
- `_materializeGraph()` must be removed from public read paths during
  implementation.
- No hidden full-materialization fallback.
- No compatibility shim that calls `_materializeGraph()`.
- Exact node optics must not call `_materializeGraph()`.
- Property optics must not call `_materializeGraph()`.
- Attachment ref optics must not call `_materializeGraph()`.
- Neighbor optics and traversal optics must not call `_materializeGraph()`.

Current materialization anchors:

- `QueryController.defaultQueryReadModelProvider()` opens
  `LiveQueryReadModelProvider`.
- `LiveQueryReadModelProvider.openQueryReadModel()` calls
  `_ensureFreshState()`.
- `PatchController._ensureFreshState()` calls `_materializeGraph()` when
  auto-materialization is enabled and cached state is missing or dirty.
- `StateQueryReadModel` iterates full `WarpState` sets and maps.
- `Observer._materializeGraph()` materializes the backing graph when no
  snapshot exists.
- `Worldline._materializeGraph()` delegates to an observer materialization path.
- `LogicalTraversal` calls `_materializeGraph()` before walking.
- `MaterializeController` remains a legitimate full-state reducer for Plumber
  and universe operations.

Those files are not changed in this cycle. They name the future implementation
work.

## Relation To IPA And Proof Systems

WARP holograms are witness-bearing retained outputs.

They are not automatically cryptographic zero-knowledge proofs.

Future proof backends may lower holograms into IPA, SNARK, or STARK-style
proofs. IPA means Inner Product Argument.

Phrase:

```text
IPA is a future proof backend over retained holograms,
not the v17 storage substrate.
```

v17 scope is to preserve enough witness structure for future proof-carrying
execution. The proof layer is future work unless an implementation already
exists in the repo.

## Implementation Shape For Later Cycles

This spec does not implement the shape, but the later work should converge on
these runtime concepts:

- `Braid`: a runtime-backed presentation of one or more causal lanes.
- `BraidCoordinate`: antichain/vector coordinate plus aperture basis.
- `ObserverAperture`: explicit projection, rights, and expansion budget.
- `Intent`: runtime-backed classes for fact, read, tick, merge, braid, import,
  attachment, and recursive WARP intents.
- `CausalSlicePlanner`: computes candidate witness sets and index lookup plan.
- `WitnessLocator`: loads required witnesses through ports.
- `SliceReducer`: lowers witness sets under named admissibility laws.
- `Hologram`: retained output with `sliceHash`, `witnessSetHash`, law version,
  projection version, and referenced witness anchors.
- `IndexDelta`: incremental index page updates discovered during reads.
- `SliceCache`: question-shaped cache over retained holograms.
- `Plumber`: explicit universe/export/prewarm/repair surface.

These must be runtime-backed domain concepts where they carry invariants. Avoid
placeholder shapes, fake models, cast corridors, and boolean flag bags.

## Upgrade And Release Notes

v17 is major. Legacy compatibility does not control the API.

Required release work after implementation:

- Release notes explain breaking API changes.
- Existing materialize-first `graph.query()` behavior is either removed,
  redirected to optics without materialization, or explicitly moved to Plumber.
- Upgrade scripts exist if internal representation changes require migration.
- The migration path is explicit about index/hologram/cache rebuilds.
- Public docs explain that graph state hashes differ from slice hashes.

## Acceptance Criteria

v17 implementation is acceptable only when:

- TypeScript migration is complete.
- Public API centers optics over worldlines, strands, and braids.
- Exact node optic does not call `_materializeGraph()`.
- Property optic reads property-level slices.
- Attachment optic returns refs/streams without loading full attachments.
- Neighbor optic does not require full adjacency.
- Traversal optic expands lazily through cached neighbor slices.
- `/Users/james/.think/codex` can be read through optics with bounded RSS.
- No public read path uses full graph materialization.
- Release notes explain breaking API changes.
- Upgrade scripts exist if internal representation changes require migration.

Spec acceptance for this design-only cycle:

- The human can approve or reject the mental model before implementation.
- The spec names the API split, pipeline, fact model, hologram model,
  indexing/cache model, hash identity rules, materialization doctrine, and
  open questions.
- No production code is edited.
- No implementation tests are written.
- No backlog cards are created.

## Non-Goals

- No implementation in this cycle.
- No test implementation in this cycle.
- No legacy `graph.query()` compatibility requirement.
- No materialize-first public API.
- No fake `stateHash`.
- No Roaring-as-truth.
- No assumption indexes fit in memory.
- No full `RuntimeHost` rewrite in this spec.
- No bolted-on bounded query fast path.
- No hidden `_materializeGraph()` read fallback.
- No proof-system implementation.
- No full Plumber design beyond the required API boundary.

## Risks And Open Questions

- Current `QueryReadModel` and `QueryRunner` expose `stateHash` as if every
  read were a full graph read. v17 optics likely need a breaking result model
  instead of adapting that contract.
- Current `QueryReads` and `QueryContent` begin with `_ensureFreshState()` even
  when indexed data exists. Later implementation must invert that dependency.
- Current observer and worldline paths materialize snapshots for many reads.
  The optic API should replace those paths rather than wrapping them.
- Current traversal has a good provider engine and a bad materialize-first
  facade. Implementation should keep the engine seam and retire the facade from
  public reads.
- Current bitmap readers need audit for global dictionary and ID-cache memory
  behavior. v17 requires dictionary pages to be sharded and lazy-loaded.
- Property-level witness selection must be precise enough to avoid loading all
  properties for an entity.
- Edge liveness and endpoint visibility need a causal/witness law that does not
  collapse to property LWW.
- Recursive WARP attachments need a coordinate model that prevents accidental
  full child materialization.
- Cache reuse over antichain frontiers needs exact containment semantics.
- A future proof backend needs stable witness structure, but proof machinery is
  not v17 scope.

## Validation Plan For This Cycle

Run after doc edits:

```sh
npx markdownlint docs/design/0111-v17-optics-causal-slice-spec.md
git diff --check
npm run lint:sludge
```

If `docs/design/0107-v17-reality-check.md` is touched, include it in the
markdownlint command.

## SLUDGE STRIKER SUMMARY

### 1. Sludge Encountered

- Pattern: materialize-first public reads.
  Files: `QueryController`, `LiveQueryReadModelProvider`,
  `PatchController`, `Observer`, `Worldline`, `LogicalTraversal`.
  Why it is sludge: bounded read-shaped APIs still rely on full
  materialized state.
  Status: named for future implementation, not changed in this cycle.
- Pattern: fake identity pressure.
  Files: `QueryReadModelProvider`, `QueryRunner`.
  Why it is sludge: `stateHash` is required even for reads that should be
  slices, which invites stale checkpoint hashes or invented hashes.
  Status: rejected by the v17 hash model.
- Pattern: Roaring-as-truth temptation.
  Files: bitmap index and neighbor-provider family.
  Why it is sludge: bitmap pages are excellent navigation structures but cannot
  decide fact truth.
  Status: rejected by the indexing doctrine.

### 2. Sludge Fixed

- No production sludge fixed in this cycle.
- The spec replaces "bounded query fast path" thinking with a complete causal
  slice architecture.
- The spec separates Optic API, Plumber API, fact slices, holograms, cache
  identity, and materialization doctrine before implementation begins.

### 3. Sludge Rejected

- Rejected hidden `_materializeGraph()` fallbacks.
- Rejected fake `stateHash`.
- Rejected client-owned traversal over materialized state.
- Rejected LWW as foundational truth.
- Rejected Roaring bitmap pages as truth.
- Rejected assuming indexes or dictionaries fit in memory.
- Rejected a full RuntimeHost rewrite as part of this spec.

### 4. Sludge Deferred / Tracked

- Exact implementation of `BraidOptic`.
- Runtime-backed intent and hologram classes.
- Causal slice planner and witness locator.
- Property-level and liveness-level reducers.
- Sharded dictionary and bitmap page model.
- Recursive WARP attachment coordinate model.
- Public API migration and release notes.
- Upgrade scripts if representation changes require migration.

### 5. Anti-Sludge Checks To Run

- `npx markdownlint docs/design/0111-v17-optics-causal-slice-spec.md`
- `git diff --check`
- `npm run lint:sludge`

### 6. Remaining Risk

The remaining risk is architectural overreach during implementation. The next
cycle should not bolt a narrow bounded query fast path onto the old
materialize-first model. It should implement the smallest real optic slice that
proves the model: exact node read or property read over witnesses, no
`_materializeGraph()` call, honest slice identity, and retained hologram output.
