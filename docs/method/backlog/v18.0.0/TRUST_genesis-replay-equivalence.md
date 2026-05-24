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

This is now a gate vocabulary, but not yet the complete ship gate. The
remaining trust work is to construct legacy and scratch readings from real
Git history and wire the gate into finalization.

## Starting points

- `test/`
- `src/domain/services/JoinReducer.ts`
- `docs/method/backlog/v18.0.0/INFRA_graph-model-migration-tool.md`
