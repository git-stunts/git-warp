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
| 1 | open | Define memory budget contract and budget error shape. | test |
| 2 | open | Add large-graph-over-small-pool canonical fixture. | fixture |
| 3 | open | Add public-path full-residency trap tests. | test |
| 4 | open | Add bounded patch-stream substrate proof. | test |
| 5 | open | Add stream-built or shard-built read-basis evidence. | test |
| 6 | open | Add node liveness fact resolver evidence. | test |
| 7 | open | Add edge endpoint fact resolver evidence. | test |
| 8 | open | Add property fact resolver evidence. | test |
| 9 | open | Add content-reference lookup evidence. | test |
| 10 | open | Add existing-entity write resolver evidence. | test |
| 11 | open | Add bounded read cursor or limit evidence. | test |
| 12 | open | Add sync cursor or batch evidence. | test |
| 13 | open | Add capability report for bounded and legacy surfaces. | test |
| 14 | open | Add operator memory-budget witness. | witness |
| 15 | open | Update release evidence and close or disposition #549. | issueUpdate |

## Acceptance Criteria

- [ ] A committed large-graph fixture exceeds the configured git-warp memory
      budget.
- [ ] Blessed public paths fail if they use full residency.
- [ ] Reads, writes, content lookup, and sync have bounded proof.
- [ ] Capability reporting distinguishes safe, transitional, diagnostic, and
      legacy surfaces.
- [ ] Release evidence names fixture, witness, replay command, and residual
      risk.

## Deterministic Evidence

| Claim | Canonical fixture or input | Witness | Replay command | Expected deterministic result |
| --- | --- | --- | --- | --- |
| Public paths obey memory budget. | Large-graph-over-small-pool fixture. | Focused conformance output. | `npm test -- --run <bounded-memory-conformance>` | Public operations complete or fail closed without full residency. |
| Unsafe public paths are trapped. | Tag commit source tree. | Full-residency trap output. | `npm test -- --run <full-residency-trap>` | Test fails on materialization, unbounded arrays, or full snapshot construction. |
| Capability posture is inspectable. | Capability report fixture. | Operator report witness. | `npm test -- --run <capability-report-test>` | Report distinguishes bounded, transitional, diagnostic, offline, and legacy surfaces. |

## Observer Geometry

| Reading claim | Basis | Aperture | Law/projection | Support obligations | Witness posture |
| --- | --- | --- | --- | --- | --- |
| Large-graph public operation. | Memory-budgeted worldline or coordinate basis. | Explicit read, write, content, or sync request. | Operation-specific law. | Budget lease, shard window, cursor or batch limit, and obstruction posture. | Conformance fixture and operator witness. |

## Validation Plan

```bash
npm run test:local
npm run typecheck
npm run release:prep
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
