# V18-GP2 Bounded-Memory Large-Graph Product Gate

## Identity

| Field | Value |
| --- | --- |
| Goalpost id | `v18.0.0-gp2-bounded-memory-large-graph-gate` |
| Release home | `v18.0.0` |
| Umbrella issue | `https://github.com/git-stunts/git-warp/issues/549` |
| Goalpost doc | `docs/method/roadmap/v18.0.0/v18-gp2-bounded-memory-large-graph-gate.md` |
| Design cycle | `docs/design/0267-v18-bounded-memory-large-graph-product-gate/v18-bounded-memory-large-graph-product-gate.md` |
| Slice budget | `15` |
| Status | `landed` |
| Sponsor human | `James` |
| Sponsor agent | `Codex` |

## Outcome

Normal public reads, writes, content lookup, and sync operate under an explicit
git-warp memory budget against a graph larger than that budget.

## Current Truth

Issue [#549](https://github.com/git-stunts/git-warp/issues/549) is closed as
the non-release bounded-memory product gate. The landed evidence proves the
memory budget contract, large-graph-over-small-pool fixture, bounded read
cursor, patch-stream, basis-builder, fact-resolver, sync batch, capability
report, and operator witness shapes listed below.

Release/tag evidence is explicitly out of scope for this goalpost. Issue
[#552](https://github.com/git-stunts/git-warp/issues/552) remains the v18
release-operation blocker until explicit tag approval and publish evidence
exist.

## Scope

- Memory budget contract and observable budget errors.
- Large-graph-over-small-pool conformance fixture.
- Bounded patch stream and sharded fact index posture.
- Bounded public reads, writes, content lookup, and sync evidence.
- Capability reporting for bounded, transitional, diagnostic, and legacy
  surfaces.

## Out Of Scope

- Making every global graph question cheap.
- Native Continuum scheduler or witness parity.
- Distributed braid semantics.

## Proof Stories

| Story issue | Actor | Need | Reason | Slice budget |
| --- | --- | --- | --- | ---: |
| [#549](https://github.com/git-stunts/git-warp/issues/549) | application user | public graph operations that obey a memory budget | large production graphs cannot require full in-process residency | 15 |

## Slice Budget

| Slice | Status | Description | Expected proof |
| ---: | --- | --- | --- |
| 1 | complete | Define memory budget contract and budget error shape. | `test/unit/domain/memory/WarpMemoryPool.test.ts` |
| 2 | complete | Add large-graph-over-small-pool canonical fixture. | `test/conformance/fixtures/V18LargeGraphOverSmallPoolFixture.ts` |
| 3 | complete | Add public-path full-residency trap tests. | `test/conformance/v18BoundedMemoryLargeGraphGate.test.ts` traps whole-graph residency and blessed worldline public paths. |
| 4 | complete | Add bounded patch-stream substrate proof. | `test/unit/domain/services/optic/CheckpointPatchFactStream.test.ts` |
| 5 | complete | Add stream-built or shard-built read-basis evidence. | `test/unit/domain/services/optic/StreamingCheckpointBasisBuilder.test.ts` |
| 6 | complete | Add node liveness fact resolver evidence. | `test/unit/domain/services/optic/CheckpointFactResolver.test.ts` |
| 7 | complete | Add edge endpoint fact resolver evidence. | `test/unit/domain/services/optic/CheckpointFactResolver.test.ts` |
| 8 | complete | Add property fact resolver evidence. | `test/unit/domain/services/optic/CheckpointFactResolver.test.ts` |
| 9 | complete | Add content-reference lookup evidence. | `test/unit/domain/services/optic/CheckpointFactResolver.test.ts` |
| 10 | complete | Add existing-entity write resolver evidence. | `test/unit/domain/services/optic/CheckpointExistingEntityWriteResolver.test.ts` |
| 11 | complete | Add bounded read cursor or limit evidence. | `test/conformance/v18BoundedQueryNodePageReader.test.ts` |
| 12 | complete | Add sync cursor or batch evidence. | `test/unit/domain/services/sync/BoundedSyncPatchBatchReader.test.ts` |
| 13 | complete | Add capability report for bounded and legacy surfaces. | `test/unit/domain/WarpWorldline.capabilities.test.ts`; `test/unit/cli/doctor.test.ts` |
| 14 | complete | Add operator memory-budget witness. | `git warp doctor --memory-budget 64mb --large-graph` payload test |
| 15 | complete | Update non-release closeout evidence and close or disposition #549. | `npm run test:local`; issue update; release evidence skipped by explicit scope |

## Acceptance Criteria

- [x] A committed large-graph fixture exceeds the configured git-warp memory
      budget.
- [x] Blessed public paths fail if they use full residency.
- [x] Reads, writes, content lookup, and sync have bounded proof.
- [x] Capability reporting distinguishes safe, transitional, diagnostic, and
      legacy surfaces.
- [x] Non-release closeout evidence names fixture, witness, replay command, and
      residual risk. Release evidence is skipped until explicit tag/release
      approval.

## Deterministic Evidence

| Claim | Canonical fixture or input | Witness | Replay command | Expected deterministic result |
| --- | --- | --- | --- | --- |
| Memory budgets reject over-residency. | `WarpMemoryPool` leases under an 8-byte budget. | Focused unit output. | `npx vitest run test/unit/domain/memory/WarpMemoryPool.test.ts` | Over-budget leases throw `E_MEMORY_BUDGET_EXCEEDED` with stable context. |
| Public paths obey memory budget. | Large-graph-over-small-pool fixture. | Focused conformance output. | `npx vitest run test/conformance/v18BoundedMemoryLargeGraphGate.test.ts` | Fixture size exceeds budget; streamed reads keep peak leased entries at `1`. |
| Bounded reads have cursor evidence. | Large-graph-over-small-pool fixture. | Focused page-reader conformance output. | `npx vitest run test/conformance/v18BoundedQueryNodePageReader.test.ts` | Node reads return deterministic two-node pages with offset cursors, peak retained-page lease `2`, and rejection for a three-node page under a two-entry pool. |
| Unsafe public paths are trapped. | Large-graph-over-small-pool fixture. | Full-residency trap output. | `npx vitest run test/conformance/v18BoundedMemoryLargeGraphGate.test.ts` | Whole-graph residency fails closed under the fixture pool; blessed worldline public paths do not expose `materialize`, `getStateSnapshot`, `getNodes`, or `getEdges`. |
| Streaming read-basis construction is bounded. | Checkpoint basis fact stream. | Focused basis-builder output. | `npx vitest run test/unit/domain/services/optic/StreamingCheckpointBasisBuilder.test.ts` | Builder writes three deterministic shard chunks, keeps peak pending-fact lease `2`, releases all leases, and rejects a third pending fact under a two-fact pool. |
| Patch facts stream under budget. | Checkpoint patch fact stream bounded path. | Focused patch fact stream output. | `npx vitest run test/unit/domain/services/optic/CheckpointPatchFactStream.test.ts` | `streamBounded()` keeps peak residency to one patch entry plus one emitted fact. |
| Fact resolvers are targeted and bounded. | Checkpoint fact stream value objects. | Focused resolver output. | `npx vitest run test/unit/domain/services/optic/CheckpointFactResolver.test.ts` | Node liveness, edge endpoints, node properties, and content OIDs resolve with peak fact lease `1`. |
| Existing-entity writes have targeted preconditions. | Checkpoint fact stream value objects. | Focused write resolver output. | `npx vitest run test/unit/domain/services/optic/CheckpointExistingEntityWriteResolver.test.ts` | Existing-node and existing-edge write decisions resolve with peak fact lease `1`. |
| Sync has cursorized batch evidence. | Async sync patch descriptor source. | Focused sync batch output. | `npx vitest run test/unit/domain/services/sync/BoundedSyncPatchBatchReader.test.ts` | Patch descriptors page with deterministic cursors, peak retained-batch lease `2`, and rejection for a two-patch batch under a one-patch pool; public `SyncResponse.patches` array integration remains legacy. |
| Capability posture is inspectable. | `WarpWorldline.capabilities()`. | Focused unit output. | `npx vitest run test/unit/domain/WarpWorldline.capabilities.test.ts` | Report distinguishes safe, transitional, diagnostic, and legacy surfaces. |
| Operator memory-budget posture is inspectable. | `git warp doctor` memory-budget flags. | Focused CLI output. | `npx vitest run test/unit/cli/doctor.test.ts test/unit/cli/schemas.test.ts` | Doctor payload includes requested budget, large-graph flag, and safe/transitional/diagnostic/legacy capability lists. |

## Observer Geometry

| Reading claim | Basis | Aperture | Law/projection | Support obligations | Witness posture |
| --- | --- | --- | --- | --- | --- |
| Large-graph public operation. | Memory-budgeted worldline or coordinate basis. | Explicit read, write, content, or sync request. | Operation-specific law. | Budget lease, shard window, cursor or batch limit, and obstruction posture. | Conformance fixture and operator witness. |

## Validation Plan

```bash
npm run test:local
npm run typecheck
# Release commands are skipped until explicit user approval.
```

## Release Gate Impact

This goalpost proves the release's large-graph product promise at the
non-release evidence layer. Public v18 docs may cite the committed
bounded-memory fixture and witness paths, but release operation evidence remains
separate under V18-GP5 and must not be inferred from this closeout.

## Residual Risks

| Risk | Rationale | Owner | Follow-up issue |
| --- | --- | --- | --- |
| Release evidence and tag-time proof remain intentionally skipped. | The current scope is non-release roadmap closeout. `v18.0.0` must not be tagged without explicit approval. | `@git-stunts` | [#552](https://github.com/git-stunts/git-warp/issues/552) |
| Some global graph questions may remain diagnostic or offline only. | The gate requires explicit bounded posture, not cheap answers to every global query. Capability reporting must keep those paths labeled. | `@git-stunts` | [#613](https://github.com/git-stunts/git-warp/issues/613) |

## Closeout

- [x] Slices complete or honestly dispositioned.
- [x] Proof matrix replayed.
- [x] Goalpost issue updated.
- [x] Release evidence intentionally skipped; #552 remains the release-only
      blocker.
