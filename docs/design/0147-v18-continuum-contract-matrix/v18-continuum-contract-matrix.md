---
cycle: 0147
task_id: V18_continuum_contract_matrix
status: Complete
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-21
completed_at: 2026-05-21
release_home: v18.0.0
---

# V18 Continuum Contract Matrix

## Pull

The v18 charter names the compatibility target. This slice names the actual
contract families and the current proof gap for each one.

## Hill

`git-warp` can now point at a concrete matrix:

- Continuum owns the shared family semantics.
- Wesley compiles and witnesses generated family artifacts.
- Echo and `git-warp` are sibling runtimes that may emit or consume conforming
  values.
- `warp-ttd` is the structured debugger/read-model consumer.
- Existing `git-warp` facts are translated evidence until native Continuum
  witnesshood is proven.

## Evidence Snapshot

The matrix below is based on these inspected local sources:

| Repo | Head | Evidence |
| --- | --- | --- |
| Continuum | `01e0735` | `docs/contract-family-registry.md`, `schemas/*.graphql`, `wesley/profile/scopes.mjs` |
| Wesley | `19b2c1c9` | `README.md`, `docs/architecture/continuum-minimum-shared-contract-surface.md` |
| Echo | `b1d979d` | `docs/BEARING.md` |
| `warp-ttd` | `0491be6` | `docs/BEARING.md`, `schemas/warp-ttd-protocol.graphql` |
| `git-warp` | this branch | `docs/BEARING.md`, `src/domain/types/TickReceipt.ts`, `src/domain/types/DeliveryObservation.ts`, read/materialize capabilities |

## Family Matrix

| Family | Authored home | Wesley status | `git-warp` source facts | Primary `warp-ttd` need | Missing witness |
| --- | --- | --- | --- | --- | --- |
| `receipt-family` | `~/git/continuum/schemas/continuum-receipt-family.graphql` | `profiled`, `fixture-witnessed`; scope `receipt-family` checks cross-leg schema hash, TTD fixture shape, Echo fixture shape, boundary fixture, roundtrip vectors, and receipt/witness separation | `TickReceipt`, op outcomes, `DeliveryObservation`, audit receipt chains, materialize/provenance receipt collection | Receipt and delivery facts as generated-family nouns, not adapter-local summaries | Live `git-warp` receipt publication mapped through generated artifacts with translated evidence posture, then witnessed as native only after a Continuum runtime witness exists |
| `settlement-family` | `~/git/continuum/schemas/continuum-settlement-family.graphql` | `profiled`, `fixture-witnessed`; scope `settlement-family` checks cross-leg coherence and settlement boundary fixtures | Patch diffs, conflict traces, merge/conflict analysis, strand/braid conflict artifacts, writer frontier state | Import/settlement explanation for cross-runtime history and merge inspection | Live settlement values from `git-warp` suffix/import or merge flows, plus generated-artifact conformance |
| `neighborhood-core-family` | `~/git/continuum/schemas/continuum-neighborhood-core-family.graphql` | `authored`; not yet profiled in the current Continuum Wesley scope list | Graph name, writer refs, worldline/frontier facts, local site-like participation facts still unnamed as a stable family | Neighborhood focus, participant catalog, and site navigation across Echo and `git-warp` targets | Wesley profile and fixture witness first; then `git-warp` participant values with explicit translated/native evidence status |
| `runtime-boundary-family` | `~/git/continuum/schemas/continuum-runtime-boundary-family.graphql` | `authored`; not yet profiled in the current Continuum Wesley scope list | Materialize/read requests, observer/read basis, patch suffixes, frontiers, provenance refs, receipt collections, import outcomes still split across local APIs | Admission-chain read model: observer plans, reading envelopes, evidence posture, suffix shells, causal suffix bundles, import outcomes | Wesley profile, generated fixtures, and a live witnessed suffix exchange/admission proof between sibling runtimes |

## Source-Fact Map

| Continuum noun | Current `git-warp` anchor | Current posture |
| --- | --- | --- |
| `Receipt` | `TickReceipt`, audit receipts, receipt shards | Translated evidence; shape is not yet generated-family native |
| `DeliveryObservation` | `DeliveryObservation` and effect sink observations | Local fact with strong name overlap; not yet Continuum family output |
| `Witness` | checkpoint-tail witnesses, conflict witnesses, audit chain proofs | Local witness forms; no shared generated family surface yet |
| `SettlementDelta` / `ConflictArtifact` | `PatchDiff`, conflict traces, merge/conflict services | Candidate source facts; missing shared generated settlement adapter |
| `NeighborhoodCore` / `NeighborhoodParticipant` | graph name, writers, frontiers, worldline metadata | Candidate source facts; missing stable local site/participant object |
| `ObserverPlan` / `ObservationRequest` | query/read basis, materialize options, traversal context | Candidate source facts; missing generated runtime-boundary profile |
| `ReadingEnvelope` | materialize/query/read results plus provenance/receipt options | Candidate source facts; missing explicit evidence status wrapper |
| `TranslatedSubstrateEvidence` | append-only Git-backed causal history, patch SHAs, writer refs, receipts | Correct initial evidence posture for compatibility outputs |
| `WitnessedSuffixShell` / `CausalSuffixBundle` | writer patch chains, frontier maps, transport/sync suffixes | Candidate source facts; missing compact generated shell and admission witness |
| `ImportOutcome` | sync/import/materialization outcomes and conflict posture | Candidate source facts; missing runtime-boundary family emission |

## `warp-ttd` Consumer Matrix

`warp-ttd`'s active bearing pressures these generated-family facts first:

| `warp-ttd` target | Needed from `git-warp` | Contract-family lane |
| --- | --- | --- |
| Dual live app debugging | Read-only posture for a live `git-warp` target without host mutation | runtime-boundary-family |
| Admission-chain read model | Artifact registration, evidence posture, receipts, witnesses, and reading envelopes as distinct facts | runtime-boundary-family, receipt-family |
| Neighborhood and site catalog | Participant/site summaries that can compare Echo and `git-warp` targets | neighborhood-core-family |
| Receipt shell summary | Generated-family receipt facts and delivery observations | receipt-family |
| Merge and import inspection | Conflict artifacts, import candidates, settlement plans, and outcomes | settlement-family |

## First Implementation Pressure

The first implementation slice should not try to ingest every family. It should
build a generated-artifact ingestion seam around one generated fixture family,
then guard against hidden handwritten mirrors.

Recommended order:

1. Ingest or locally fixture the `receipt-family` generated artifact manifest.
2. Reject local `git-warp` files that claim to be authoritative mirrors of
   Continuum-owned families.
3. Map `TickReceipt` and `DeliveryObservation` into a translated
   `receipt-family` projection without claiming native Continuum witnesshood.
4. Let `warp-ttd` consume that projection as generated-family-shaped input.

## SSJS Scorecard

- Runtime-backed forms: green for this documentation slice; no runtime forms
  introduced.
- Boundary validation: green; the matrix keeps authored schemas and Wesley
  generated artifacts as authority.
- Behavior ownership: green; each row separates authored home, compiler,
  runtime source fact, consumer, and missing witness.
- Message parsing: green; no behavior branches introduced.
- Ambient time or entropy: green; no runtime code introduced.
- Fake shape trust or cast-cosplay: green; every current `git-warp` mapping is
  marked as translated evidence until a stronger witness exists.

## Closeout

This closes BEARING task 3 and supplies the evidence table for slices 4 and 5.
