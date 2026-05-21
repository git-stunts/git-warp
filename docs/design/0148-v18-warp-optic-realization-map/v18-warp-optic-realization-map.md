---
cycle: 0148
task_id: V18_warp_optic_realization_map
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-21
completed_at: 2026-05-21
release_home: v18.0.0
---

# V18 WARP Optic Realization Map

## Pull

The contract matrix names the cross-repo families. This slice maps
`git-warp`'s current runtime facts onto the WARP optic tuple without claiming a
generic optic engine.

## Hill

For v18, `git-warp` interprets:

```text
Psi = (Omega, chi, rho, Pi, Lambda)
Lower_Psi(F*, P) = (R, W, theta)
```

as a compatibility map over existing repo facts.

## Component Map

| Optic component | WARP role | Current `git-warp` anchors | v18 compatibility gap |
| --- | --- | --- | --- |
| `Omega` | Observer discipline: projection, basis, observer state, update discipline, and emission | `WorldlineOptic`, `NodeOptic`, `NodePropertyOptic`, `ReadIdentity`, `Observer`, `QueryRunner`, `QueryReadModelProvider`, `ExternalizationPolicy` | Generated `ObserverPlan`, `ObservationRequest`, and `ReadingEnvelope` family shapes |
| `chi` | Bounded frontier-relative optic slice | `CheckpointTailWitnessLocator`, `CheckpointTailBasisLoader`, `CheckpointTailOpticSource`, `CheckpointTailReadIdentityBuilder`, `ProvenanceController.materializeSlice` | Shared vocabulary for slice support, tail budget, and graph-model attachment plane |
| `rho` | Set-side lowering surface that presents comparable claims over `chi` | `reduceV5`, `applyWithReceipt`, `JoinReducerSession`, op classes, `PatchDiff`, `syncDelta`, materialize-coordinate paths | Generated lowering inputs for receipt, settlement, and runtime-boundary families |
| `Pi` | Admission law for derived, plural, conflict, or obstruction outcomes | `OpStrategies`, `ReceiptBuilder`, `TickReceipt` outcomes, `ConflictAnalyzerService`, `SyncTrustGate`, `OpticReadFailureCause` | First-class outcome algebra aligned with Continuum `AdmissionOutcomeKind` and runtime-boundary admission nouns |
| `Lambda` | Retention contract for replay, audit, transport, revelation, and reliance obligations | append-only Git commits, writer refs, patch SHAs, checkpoints, `ReceiptShard`, `AuditReceiptService`, `ReadIdentity`, sync suffixes | Generated evidence-status wrappers, suffix shells, and explicit retention obligations for `warp-ttd` |

## Lowering Scales

| Scale | Weave `P` | Frontier `F*` | Result `R` | Witness `W` | Retained shell `theta` | Current posture |
| --- | --- | --- | --- | --- | --- | --- |
| Tick / patch | One patch or ordered patch sequence | Writer and graph frontier | State transition, `PatchDiff`, or op outcomes | `TickReceipt`, op outcome details | Patch commit, receipt, optional audit receipt | Real local runtime fact; not native Continuum receipt-family output yet |
| Read / optic | Observer/read target plus basis | Live, coordinate, or strand source | Node/property/traversal/materialized reading | `ReadIdentity`, checkpoint-tail witnesses, failure cause | Read identity plus checkpoint/tail anchors | Real local read fact; missing generated `ReadingEnvelope` |
| Provenance slice | Backward cone for a target | Patch graph reachable from target | Bounded reconstructed state and patch count | Causal patch list, optional receipts | Provenance payload and source SHAs | Real local source fact; missing Continuum evidence wrapper |
| Strand / braid | Strand overlay or braided strand set | Parent frontier plus overlay heads | Materialized strand state or conflict trace | conflict receipts, conflict anchors, participant traces | strand descriptor, overlay patches, conflict analysis | Candidate settlement-family source facts |
| Replica / sync | Remote suffix family or frontier delta | Local and remote writer frontiers | Needed patch ranges, trust posture, import/sync result | writer trust gate result, ancestry checks | transferred patch commits and refs | Candidate runtime-boundary suffix/import facts |

## Outcome Algebra Posture

The WARP paper's outcome space is:

```text
O(X) = Derived(X) + Plural(X) + Conflict + Obstruction
```

Current `git-warp` facts map into it conservatively:

| Outcome | Local anchors | Current limitation |
| --- | --- | --- |
| `Derived` | successful reducer outcomes, materialized readings, query results | Not wrapped as a generated Continuum outcome |
| `Plural` | strand/braid coexistence and multi-writer frontier facts | Plurality is represented structurally, not as a named outcome |
| `Conflict` | conflict traces, diagnostics, conflict receipt refs | Settlement-family projection is still missing |
| `Obstruction` | optic read failures, sync trust rejection, validation errors | Obstruction is not yet one shared runtime-boundary noun |

## Evidence Posture

The first v18 compatibility layer must mark `git-warp` outputs as translated
evidence unless a native Continuum runtime witness exists.

That means:

- a `TickReceipt` can be mapped toward `receipt-family`;
- a conflict trace can be mapped toward `settlement-family`;
- a read result can be mapped toward `runtime-boundary-family`;
- a sync suffix can be mapped toward `WitnessedSuffixShell`;
- none of those mappings may claim native Continuum witnesshood by shape alone.

## Next Engineering Cut

Slice 5 should create a generated-artifact ingestion seam that can load one
Continuum family artifact descriptor or fixture and reject hidden handwritten
authority. The first useful family is `receipt-family` because `git-warp`
already has strong local source facts: `TickReceipt`, op outcomes,
`DeliveryObservation`, receipt shards, and audit receipts.

The seam should not:

- parse arbitrary GraphQL in the domain;
- generate types at runtime;
- make `git-warp` the owner of Continuum family semantics;
- equate translated `git-warp` evidence with native Continuum witnesshood.

## SSJS Scorecard

- Runtime-backed forms: green for this documentation slice; no runtime forms
  introduced.
- Boundary validation: green; the map treats generated artifacts as later
  boundary inputs.
- Behavior ownership: green; optic components are mapped to owning local
  modules and their gaps are named.
- Message parsing: green; no behavior branches introduced.
- Ambient time or entropy: green; no runtime code introduced.
- Fake shape trust or cast-cosplay: green; translated evidence is explicit.

## Closeout

This closes BEARING task 4 and gives slice 5 a narrow implementation target:
ingest a generated-family artifact descriptor or fixture and guard against
shadow authority.
