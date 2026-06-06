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
| Status | `active` |
| Sponsor human | `James` |
| Sponsor agent | `Codex` |

## Outcome

Normal public reads, writes, content lookup, and sync operate under an explicit
git-warp memory budget against a graph larger than that budget.

## Current Truth

Issue [#549](https://github.com/git-stunts/git-warp/issues/549) is open in
`lane:v18.0.0` and blocks release. Its issue body states that v18 cannot rely
on full graph state, full indexes, full patch arrays, full snapshots, or full
result arrays fitting in process memory.

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
| 3 | inProgress | Add public-path full-residency trap tests. | `test/conformance/v18BoundedMemoryLargeGraphGate.test.ts` traps whole-graph residency; blessed public path traps remain open. |
| 4 | complete | Add bounded patch-stream substrate proof. | `test/unit/domain/services/optic/CheckpointPatchFactStream.test.ts` |
| 5 | inProgress | Add stream-built or shard-built read-basis evidence. | `BoundedQueryReadModel` proves one-result read-model leases; patch/shard basis evidence remains open. |
| 6 | complete | Add node liveness fact resolver evidence. | `test/unit/domain/services/optic/CheckpointFactResolver.test.ts` |
| 7 | complete | Add edge endpoint fact resolver evidence. | `test/unit/domain/services/optic/CheckpointFactResolver.test.ts` |
| 8 | complete | Add property fact resolver evidence. | `test/unit/domain/services/optic/CheckpointFactResolver.test.ts` |
| 9 | complete | Add content-reference lookup evidence. | `test/unit/domain/services/optic/CheckpointFactResolver.test.ts` |
| 10 | complete | Add existing-entity write resolver evidence. | `test/unit/domain/services/optic/CheckpointExistingEntityWriteResolver.test.ts` |
| 11 | complete | Add bounded read cursor or limit evidence. | `test/conformance/v18BoundedQueryNodePageReader.test.ts` |
| 12 | complete | Add sync cursor or batch evidence. | `test/unit/domain/services/sync/BoundedSyncPatchBatchReader.test.ts` |
| 13 | inProgress | Add capability report for bounded and legacy surfaces. | `test/unit/domain/WarpWorldline.capabilities.test.ts`; operator CLI report remains open. |
| 14 | open | Add operator memory-budget witness. | witness |
| 15 | open | Update non-release closeout evidence and close or disposition #549. | issueUpdate |

## Acceptance Criteria

- [x] A committed large-graph fixture exceeds the configured git-warp memory
      budget.
- [ ] Blessed public paths fail if they use full residency.
- [ ] Reads, writes, content lookup, and sync have bounded proof.
- [x] Capability reporting distinguishes safe, transitional, diagnostic, and
      legacy surfaces.
- [ ] Non-release closeout evidence names fixture, witness, replay command, and
      residual risk. Release evidence is skipped until explicit tag/release
      approval.

## Deterministic Evidence

| Claim | Canonical fixture or input | Witness | Replay command | Expected deterministic result |
| --- | --- | --- | --- | --- |
| Memory budgets reject over-residency. | `WarpMemoryPool` leases under an 8-byte budget. | Focused unit output. | `npx vitest run test/unit/domain/memory/WarpMemoryPool.test.ts` | Over-budget leases throw `E_MEMORY_BUDGET_EXCEEDED` with stable context. |
| Public paths obey memory budget. | Large-graph-over-small-pool fixture. | Focused conformance output. | `npx vitest run test/conformance/v18BoundedMemoryLargeGraphGate.test.ts` | Fixture size exceeds budget; streamed reads keep peak leased entries at `1`. |
| Bounded reads have cursor evidence. | Large-graph-over-small-pool fixture. | Focused page-reader conformance output. | `npx vitest run test/conformance/v18BoundedQueryNodePageReader.test.ts` | Node reads return deterministic two-node pages with offset cursors and peak result lease `1`. |
| Unsafe public paths are trapped. | Large-graph-over-small-pool fixture. | Full-residency trap output. | `npx vitest run test/conformance/v18BoundedMemoryLargeGraphGate.test.ts` | Whole-graph residency fails closed under the fixture pool; blessed public path traps remain open. |
| Patch facts stream under budget. | Checkpoint patch fact stream bounded path. | Focused patch fact stream output. | `npx vitest run test/unit/domain/services/optic/CheckpointPatchFactStream.test.ts` | `streamBounded()` keeps peak residency to one patch entry plus one emitted fact. |
| Fact resolvers are targeted and bounded. | Checkpoint fact stream value objects. | Focused resolver output. | `npx vitest run test/unit/domain/services/optic/CheckpointFactResolver.test.ts` | Node liveness, edge endpoints, node properties, and content OIDs resolve with peak fact lease `1`. |
| Existing-entity writes have targeted preconditions. | Checkpoint fact stream value objects. | Focused write resolver output. | `npx vitest run test/unit/domain/services/optic/CheckpointExistingEntityWriteResolver.test.ts` | Existing-node and existing-edge write decisions resolve with peak fact lease `1`. |
| Sync has cursorized batch evidence. | Async sync patch descriptor source. | Focused sync batch output. | `npx vitest run test/unit/domain/services/sync/BoundedSyncPatchBatchReader.test.ts` | Patch descriptors page with deterministic cursors and peak patch lease `1`; public `SyncResponse.patches` array integration remains legacy. |
| Capability posture is inspectable. | `WarpWorldline.capabilities()`. | Focused unit output. | `npx vitest run test/unit/domain/WarpWorldline.capabilities.test.ts` | Report distinguishes safe, transitional, diagnostic, and legacy surfaces. |

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

This goalpost proves the release's large-graph product promise. Until it lands,
public v18 docs must not claim arbitrary graph size, bounded content lookup, or
streaming/cursor safety beyond the evidence already committed.

## Residual Risks

| Risk | Rationale | Owner | Follow-up issue |
| --- | --- | --- | --- |
| Some global graph questions may remain diagnostic or offline only. | The gate requires explicit bounded posture, not cheap answers to every global query. | `@git-stunts` | [#549](https://github.com/git-stunts/git-warp/issues/549) |

## Closeout

- [ ] Slices complete or honestly dispositioned.
- [ ] Proof matrix replayed.
- [ ] Goalpost issue updated.
- [ ] Release evidence updated.
