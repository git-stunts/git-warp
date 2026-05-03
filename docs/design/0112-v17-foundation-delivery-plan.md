# 0112 v17 Foundation Delivery Plan

- Status: `draft for human approval`
- Release lane: `v17.0.0`
- Source: `0111-v17-optics-architecture-and-foundation-plan`
- Design role: narrow v17 delivery scope
- Review audience: maintainers and future agents
- Architecture doctrine: `0111-v17-optics-causal-slice-architecture.md`

## Hill

Ship the v17 foundation slice without trying to implement the full Continuum
vision.

v17 delivers:

- 100% TypeScript.
- Bounded reads for `/Users/james/.think/codex`.
- A minimal Optic API.
- A minimal `CheckpointTailWitnessLocator` read basis.
- A visible Plumber boundary.
- No public read path that calls `_materializeGraph()`.
- `readIdentity` for optic results instead of fake `stateHash`.
- Release notes that explain the breaking API changes.

This document controls v17 implementation scope after human approval.

## Non-Hill

v17 does not ship:

- full Roaring bitmap index system unless required for minimal bounded reads
- full temporal inverted index architecture
- CAS slice cache
- braid holograms as first-class product APIs
- merge holograms as first-class product APIs
- IPA or cryptographic commitments
- Continuum wire protocol
- Echo interop
- full recursive WARP optic
- full traversal algebra unless codex-think requires it
- legacy `graph.query()` compatibility as a requirement
- materialize-first public API

Those belong to later phases.

## Design-Only Boundary

This cycle does not:

- edit production code
- add implementation tests
- delete `_materializeGraph()`
- generate backlog cards
- rewrite `RuntimeHost`
- add a bolted-on bounded query fast path

Backlog fodder comes only after the human approves the mental model and
delivery cut.

## Current Evidence

The concrete fixture is:

```text
/Users/james/.think/codex
```

Known fixture facts from 0109:

- Repository size: `317M`.
- Loose object count: `41,432`.
- WARP graph name: `think`.
- The fixture has a schema `4` checkpoint with index shards.
- The checkpoint is stale relative to the live writer ref.

Known materialization path:

```text
graph.query()
  -> QueryController.defaultQueryReadModelProvider()
  -> LiveQueryReadModelProvider.openQueryReadModel()
  -> PatchController._ensureFreshState()
  -> RuntimeHost._materializeGraph()
  -> cached full WarpState
  -> StateQueryReadModel
```

Observed 0109 resource evidence:

- Read-only `info` probe max RSS: `131579904` bytes.
- Exact-miss query max RSS: `366657536` bytes.
- Disposable API `materialize()` max RSS: `412991488` bytes.

0109 and 0110 prove that successful query execution is not enough. v17 needs
the public read path to avoid the materialization chain.

## Minimal Optic API

The v17 Optic API minimum is:

```ts
await worldline.optic().node(id).read();
await worldline.optic().node(id).prop(key).read();
```

Add this only if codex-think needs it:

```ts
await worldline.optic().node(id).neighbors().read();
```

Rules:

- `node(id).read()` returns an exact node slice.
- `node(id).read()` does not imply all props, edges, or attachments.
- `prop(key).read()` returns a property-level slice.
- `neighbors().read()` returns a bounded neighbor slice if included.
- Reads return `readIdentity`, not fake `stateHash`.
- Reads must not call `_materializeGraph()`.

This is the whole v17 user-facing minimum. The larger optic examples in 0111
are architecture targets, not v17 obligations.

## Minimal Plumber Boundary

The v17 Plumber boundary is explicit operational surface, not blessed read
surface.

Include these names only if implementation needs them to move full
materialization out of public reads:

```ts
await worldline.plumber().exportUniverse().run();
await worldline.plumber().prewarmIndexes().run();
```

Rules:

- Plumber operations may be expensive.
- Plumber operations may materialize or prewarm deliberately.
- Plumber operations must be named as operational work.
- Optic reads must not silently fall through to Plumber behavior.

## Read Identity Requirement

v17 optic results use `readIdentity`.

The minimal honest identity includes:

- worldline or strand coordinate
- observer aperture
- intent
- witness basis actually used
- reducer or law version
- projection version

For the v17 `CheckpointTailWitnessLocator`, the honest basis is:

- checkpoint/index shard identity
- checkpoint frontier
- tail witness set
- entity/aspect key
- reducer version
- projection version

Rules:

- Do not return checkpoint `stateHash` for stale live reads.
- Do not invent query-scope hashes and call them `stateHash`.
- Do not use `stateHash` unless the result is a full visible materialized
  reading.
- If a result is a node slice, property slice, or neighbor slice, identify it
  as a read or slice result.

This is the direct fix for the 0110 fake-hash pressure.

## Public Read Materialization Ban

v17 implementation must remove `_materializeGraph()` from public read paths.

The ban applies to:

- `worldline.optic().node(id).read()`
- `worldline.optic().node(id).prop(key).read()`
- `worldline.optic().node(id).neighbors().read()` if shipped
- any blessed replacement for `graph.query()` reads

The ban also rejects:

- hidden full-materialization fallback
- compatibility shims that call `_materializeGraph()`
- catching `_materializeGraph()` failures and pretending the read was bounded
- materializing the whole universe under a new helper name

`_materializeGraph()` may survive temporarily for explicit Plumber,
checkpoint, export, prewarm, or legacy internal operations while v17 cuts the
public read path away from it.

## Minimal Witness Locator

v17 does not ship the full temporal inverted index, Roaring/CAS slice cache, or
Continuum witness exchange.

v17 does require one minimal bounded locator:

```text
CheckpointTailWitnessLocator
```

It answers exact entity/aspect reads by combining:

1. a retained checkpoint/index shard reading at the latest usable checkpoint
   frontier; and
2. a live tail scan after that checkpoint frontier, filtered to the requested
   entity/aspect.

The checkpoint side is a retained read basis, not necessarily raw historical
witnesses. The live tail side is actual tail witness evidence. The result
identity must name both.

The v17 locator pipeline is:

```text
optic intent
  -> entity/aspect key
  -> entity shard key
  -> load checkpoint index shard for that key
  -> scan writer tail after checkpoint frontier
  -> collect only tail patches touching entity/aspect
  -> reduce checkpoint reading + tail witnesses
  -> return value + readIdentity
```

Rules:

- Load only the checkpoint shard or shards needed for the requested
  entity/aspect.
- Scan only patches after the checkpoint frontier.
- Collect only tail patches touching the requested entity/aspect.
- Do not full-materialize the graph-like reading.
- Do not use checkpoint `stateHash` as live result identity.
- If no usable checkpoint/index basis exists, fail closed with
  `E_OPTIC_NO_BOUNDED_BASIS`.
- If tail scan exceeds budget, fail closed with
  `E_OPTIC_TAIL_BUDGET_EXCEEDED`.
- Recovery is an explicit Plumber operation, never hidden materialization.

Tail scan budgets are named release parameters:

```text
maxTailPatches
maxTailBytes
maxTailMs
```

If a budget is exceeded, the recovery is explicit operational work such as:

```ts
await worldline.plumber().prewarmIndexes().run();
await worldline.plumber().createCheckpoint().run();
```

If `createCheckpoint()` is not part of the v17 Plumber surface, the
implementation must name the existing checkpoint creation operation in the
error recovery text. It must not silently call `_materializeGraph()`.

## Bounded RSS Acceptance Bar

The local v17 release bar for the known fixture is:

```text
max RSS <= 268435456 bytes
```

That is `256 MiB` under `/usr/bin/time -l` on the same fixture class. It is
below the 0109 exact-miss materialized query max RSS of `366657536` bytes and
the disposable materialize max RSS of `412991488` bytes.

The bar applies to the minimum optic reads against:

```text
/Users/james/.think/codex
```

Rules:

- The fixture must not be mutated by read probes.
- RSS evidence must be captured with the release validation notes.
- Passing the RSS bar is not enough if `_materializeGraph()` was called.
- A higher RSS on a different machine requires a new evidence note; do not
  silently loosen this local release bar.

## Codex-Think Acceptance Scenario

No implementation test is written in this design cycle.

The implementation acceptance scenario to add later is:

1. Open the real fixture read-only:

   ```text
   /Users/james/.think/codex
   ```

2. Open the `think` worldline.

3. Execute:

   ```ts
   await worldline.optic().node("__definitely_missing_large_fixture_probe__")
     .read();

   await worldline.optic().node("__definitely_missing_large_fixture_probe__")
     .prop("title")
     .read();
   ```

4. If codex-think needs neighbor expansion, also execute:

   ```ts
   await worldline.optic().node("__definitely_missing_large_fixture_probe__")
     .neighbors()
     .read();
   ```

5. Run the product smoke:

   ```sh
   /usr/bin/time -l codex-think --remember --json
   ```

Pass criteria:

- exits successfully
- fixture refs remain unchanged for read-only probes
- max RSS is at or below `268435456` bytes
- no public read path calls `_materializeGraph()`
- no optic read falls back to full materialization when the bounded basis is
  missing
- optic results contain `readIdentity`
- no result returns a fake `stateHash`
- missing basis and exceeded tail budget failures are explicit, typed failures

If codex-think requires write-side behavior, that write smoke must use a
disposable copy or a clearly approved mutable fixture. Do not mutate the
canonical fixture as part of a read acceptance test.

## Implementation Slice After Approval

The first implementation hill should be:

```text
0113-v17-checkpoint-tail-optic-read-basis
```

The hill:

```text
worldline.optic().node(id).read()
uses CheckpointTailWitnessLocator
does not call _materializeGraph()
returns honest readIdentity
fails closed if no bounded basis exists
```

That first implementation slice should be narrow:

1. Introduce the minimal public optic entrypoint on worldlines.
2. Implement `CheckpointTailWitnessLocator` for exact entity/aspect reads.
3. Add node exact-read and property exact-read slice plumbing.
4. Replace the public read provider path that currently enters
   `_ensureFreshState()` and `_materializeGraph()`.
5. Return honest `readIdentity` from the new read result.
6. Fail closed when no bounded checkpoint/tail basis exists.
7. Add the bounded fixture acceptance coverage.
8. Update release notes for the breaking read API change.

Do not start by building:

- the full Roaring index system
- the full temporal inverted index system
- the CAS slice cache
- recursive WARP optics
- merge or braid hologram product APIs
- Continuum protocol packets
- proof backends

## Code Anchor Decisions

`QueryController.defaultQueryReadModelProvider()` is the known first
full-residency public read path.

`LiveQueryReadModelProvider.openQueryReadModel()` currently calls
`_ensureFreshState()` before exposing a read model.

`StateQueryReadModel` is full-state backed and cannot be the default substrate
for bounded optic reads.

`QueryReadModelProvider` currently pressures bounded reads to return
`stateHash`. v17 should replace that pressure for optic results with
`readIdentity`.

`GraphTraversal`, `TraversalContext`, and existing neighbor-provider ports are
useful references if v17 needs a minimal neighbor optic. They are not a mandate
to implement full traversal algebra.

`BitmapNeighborProvider` and index readers are useful references if v17 needs a
minimal indexed source. They are not a mandate to ship the full Roaring
architecture.

The checkpoint/index side of `CheckpointTailWitnessLocator` may use a retained
checkpoint reading rather than raw historical witnesses. That is acceptable only
if `readIdentity` names the checkpoint/index shard identity and checkpoint
frontier separately from tail witnesses.

## Doctrine Compliance Audit

After every major v17 cycle, run a doctrine audit.

Materialization audit:

- no new Optic or public read path calls `_materializeGraph()`
- no hidden full-materialization fallback

Identity audit:

- optic results do not expose fake `stateHash`
- slice and read results use `readIdentity`, `sliceHash`, or `witnessSetHash`

Ontology audit:

- no Continuum-core docs introduce graph, node, or edge ontology
- graph-like language is confined to observer-relative readings or `git-warp`
  compatibility docs

Fixture audit:

- read-only probe against `/Users/james/.think/codex`
- refs unchanged after read-only probes
- RSS measured with `/usr/bin/time -l`

Scope audit:

- no IPA, Continuum wire protocol, Echo interop, full Roaring/CAS cache, or
  hologram product API enters v17 foundation unless explicitly approved

This can be manual for the first implementation slice. It should become a
scripted release check once the new optic paths exist.

## Release Notes Obligations

Release notes must say:

- v17 is a major release.
- Legacy read API compatibility is not guaranteed.
- Public reads are moving to optics over worldlines and strands.
- Full materialization is explicit operational work, not the read substrate.
- Slice reads return `readIdentity`.
- `stateHash` is reserved for full visible materialized readings.
- Plumber operations may be expensive.
- Bounded read basis failures are explicit and recover through Plumber, not
  hidden materialization.
- Upgrade scripts exist if internal representation changes require migration.

## v17 Acceptance Criteria

v17 is acceptable only if:

- TypeScript migration is complete.
- Public API centers the minimal optic surface.
- `worldline.optic().node(id).read()` does not call `_materializeGraph()`.
- `worldline.optic().node(id).read()` uses `CheckpointTailWitnessLocator` or an
  approved equivalent bounded basis.
- `worldline.optic().node(id).prop(key).read()` reads a property-level slice.
- `neighbors().read()` is bounded if it ships.
- `/Users/james/.think/codex` can be read through optics within the RSS bar.
- No public read path uses full materialization.
- Optic results expose `readIdentity`, not fake `stateHash`.
- Missing bounded basis returns `E_OPTIC_NO_BOUNDED_BASIS` or an approved
  equivalent typed failure.
- Tail budget exhaustion returns `E_OPTIC_TAIL_BUDGET_EXCEEDED` or an approved
  equivalent typed failure.
- The doctrine compliance audit is run after major v17 implementation cycles.
- Release notes explain breaking API changes.
- Upgrade scripts exist if internal data representation changes require
  migration.

## Roadmap After v17

The post-v17 roadmap is:

- v18 Optics
- v19 Holograms
- v20 Commitments
- v21 Continuum Protocol
- v22 Proof-Carrying Execution

v17 ships the foundation. Later phases ship the larger architecture.
v17 is not the Continuum release. v17 is the release that makes Continuum
possible.

If v17 ships and codex-think works against the fixture, the doctrine is no
longer only philosophical. It is executable enough for the rest of the roadmap
to be credible.

## Risks And Open Questions

- The stale checkpoint plus live writer tail requires careful budget design for
  `CheckpointTailWitnessLocator`.
- codex-think may need neighbor slices earlier than expected.
- The current public API may have more materialize-first read paths than the
  query/provider path already identified.
- The minimal `readIdentity` shape must be honest without pretending to be a
  future cryptographic commitment.
- Current checkpoint indexes may be retained readings rather than raw witness
  sets; the identity model must not call them full historical witness sets.
- Moving materialization behind Plumber may expose product assumptions that
  currently depend on full `WarpState`.
- Release notes must be blunt about breaking changes so compatibility pressure
  does not smuggle `_materializeGraph()` back into reads.

## SLUDGE STRIKER SUMMARY

### 1. Sludge Encountered

- Pattern: public read materializes the universe first.
  Files: `QueryController`, `LiveQueryReadModelProvider`,
  `PatchController`, `StateQueryReadModel`.
  Status: v17 foundation blocker.
- Pattern: fake `stateHash` pressure.
  Files: `QueryReadModelProvider`.
  Status: replace with honest `readIdentity` for optic results.
- Pattern: architecture over-scope.
  Files: design planning.
  Status: split into 0111 architecture and 0112 delivery.
- Pattern: bounded basis handwave.
  Files: future optic read implementation.
  Status: name `CheckpointTailWitnessLocator` as the v17 implementation hinge.

### 2. Sludge Fixed

- No production sludge fixed in this design cycle.
- The delivery scope is narrowed to the foundation slice.
- The v17 read basis is named as checkpoint/index shard plus live tail scan.
- Roaring, CAS cache, holograms, IPA, Continuum protocol, Echo interop, and
  full traversal algebra are explicitly moved out of v17.

### 3. Sludge Rejected

- Rejected materialize-first public reads.
- Rejected hidden `_materializeGraph()` fallback.
- Rejected fake `stateHash`.
- Rejected Roaring-as-truth.
- Rejected assuming indexes fit in memory.
- Rejected a full `RuntimeHost` rewrite in this spec.
- Rejected a bolted-on bounded query fast path.
- Rejected treating a checkpoint `stateHash` as live read identity.
- Rejected falling back to materialization when no bounded basis exists.
- Rejected legacy read API compatibility as a v17 requirement.

### 4. Sludge Deferred

- Full Optic API expansion moves to v18.
- Hologram product APIs move to v19.
- Cryptographic commitments move to v20.
- Continuum wire protocol moves to v21.
- Proof-carrying execution moves to v22.

### 5. Checks Required For This Cycle

Run:

```sh
npx markdownlint docs/design/0111-v17-optics-causal-slice-architecture.md docs/design/0112-v17-foundation-delivery-plan.md
git diff --check
npm run lint:sludge
```

Also run the manual doctrine compliance audit above for any implementation
cycle that touches public read paths.
