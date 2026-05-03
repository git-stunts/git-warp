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
- A visible Plumber boundary.
- No public read path that calls `_materializeGraph()`.
- `readIdentity` for optic results instead of fake `stateHash`.
- Release notes that explain the breaking API changes.

This document controls v17 implementation scope after human approval.

## Non-Hill

v17 does not ship:

- full Roaring bitmap index system unless required for minimal bounded reads
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
- optic results contain `readIdentity`
- no result returns a fake `stateHash`

If codex-think requires write-side behavior, that write smoke must use a
disposable copy or a clearly approved mutable fixture. Do not mutate the
canonical fixture as part of a read acceptance test.

## Implementation Slice After Approval

The first implementation slice should be narrow:

1. Introduce the minimal public optic entrypoint on worldlines.
2. Add node exact-read and property exact-read slice plumbing.
3. Replace the public read provider path that currently enters
   `_ensureFreshState()` and `_materializeGraph()`.
4. Return honest `readIdentity` from the new read result.
5. Add the bounded fixture acceptance coverage.
6. Update release notes for the breaking read API change.

Do not start by building:

- the full Roaring index system
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

## Release Notes Obligations

Release notes must say:

- v17 is a major release.
- Legacy read API compatibility is not guaranteed.
- Public reads are moving to optics over worldlines and strands.
- Full materialization is explicit operational work, not the read substrate.
- Slice reads return `readIdentity`.
- `stateHash` is reserved for full visible materialized readings.
- Plumber operations may be expensive.
- Upgrade scripts exist if internal representation changes require migration.

## v17 Acceptance Criteria

v17 is acceptable only if:

- TypeScript migration is complete.
- Public API centers the minimal optic surface.
- `worldline.optic().node(id).read()` does not call `_materializeGraph()`.
- `worldline.optic().node(id).prop(key).read()` reads a property-level slice.
- `neighbors().read()` is bounded if it ships.
- `/Users/james/.think/codex` can be read through optics within the RSS bar.
- No public read path uses full materialization.
- Optic results expose `readIdentity`, not fake `stateHash`.
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

## Risks And Open Questions

- The stale checkpoint plus live writer tail may still require a deeper
  live-tail bounded source for honest reads.
- codex-think may need neighbor slices earlier than expected.
- The current public API may have more materialize-first read paths than the
  query/provider path already identified.
- The minimal `readIdentity` shape must be honest without pretending to be a
  future cryptographic commitment.
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

### 2. Sludge Fixed

- No production sludge fixed in this design cycle.
- The delivery scope is narrowed to the foundation slice.
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
