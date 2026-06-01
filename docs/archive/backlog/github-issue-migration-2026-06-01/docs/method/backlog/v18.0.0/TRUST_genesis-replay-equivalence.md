---
id: TRUST_genesis-replay-equivalence
blocked_by:
  - PROTO_graph-op-algebra-convergence
  - PROTO_content-attachment-plane-cutover
  - PROTO_legacy-props-as-projection
  - INFRA_graph-model-migration-tool
blocks: []
feature: graph-model-substrate
---

# Genesis replay equivalence

## Why

The migration is only honest if replaying the migrated history from
genesis yields the same observer-visible graph reading as replaying
the legacy history up to the migration cut.

## Done looks like

- equivalence is checked from genesis, not just at the final snapshot
- node, edge, and payload readings all participate in the proof
- failures tell the operator which patch boundary diverged
- the ship gate for the migration command includes this proof

## Progress

V18 slices 42 through 44 added fixture-level proof infrastructure:

- `GenesisEquivalenceProof` compares legacy and migrated readings as
  structured values;
- mismatches distinguish missing, extra, and changed graph facts;
- first fixtures cover node lifecycle, edge lifecycle, content metadata,
  removed-node visibility, multi-writer order, and an intentional divergent
  property;
- `GenesisDivergenceReporter` selects the first deterministic mismatch and
  reports field and patch-boundary evidence.

Slice 50 added the first promotion gate over that proof vocabulary:

- `GenesisEquivalenceGate` runs proof comparison over legacy and scratch
  reading nouns;
- failed proofs carry a first divergence report;
- otherwise-equivalent readings still block promotion when visible facts lack
  patch-boundary evidence.

This became the gate vocabulary for the migration command. Later slices built
legacy and scratch readings from real fixture history, added runtime
conformance evidence, and used the proof result as a finalization precondition.

Slice 56 added a pure reading builder for the v17 golden fixture manifest. It
is a bridge from persisted fixture metadata to equivalence facts, but it is
not yet a full replay-derived read model.

Slice 57 added a scratch reading builder over migration-operation commits. It
constructs equivalence facts from scratch Git history, but remains
operation-derived rather than normal runtime replay.

Slices 59 through 61 added operation-history readback conformance and command
coverage proving that readable scratch output still cannot finalize when the
legacy and scratch readings diverge.

Slices 66 through 95 closed the release-candidate trust loop:

- production-runtime scratch replay participates in the wet-run gate;
- restored legacy and scratch public-read readings reach zero canonical
  mismatches;
- finalization requires equivalence, runtime replay, live-ref expectation,
  archive target, and matching confirmation evidence;
- generated Continuum contract fixtures and the first `warp-ttd`
  generated-family smoke are recorded as translated-substrate evidence.

Remaining public-release trust work is to rerun the full gate set on the final
release branch and decide how to describe residual raw content/property
compatibility risk.

## Starting points

- `test/`
- `src/domain/services/JoinReducer.ts`
- `docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md`
