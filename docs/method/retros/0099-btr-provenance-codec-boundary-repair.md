# 0099 BTR Provenance Codec Boundary Repair Retrospective

- Outcome: `hill met`
- Cycle doc: [docs/design/0099-btr-provenance-codec-boundary-repair.md](../../design/0099-btr-provenance-codec-boundary-repair.md)
- Release lane: `v17.0.0`

## Outcome

0099 succeeded as a BTR/provenance boundary repair. It moved BTR
encoding to the adapter boundary, moved create/verify/replay
orchestration out of domain-side object-bag signing, made canonical
signing bytes stable across encode/decode/verify, and preserved BTR as
a git-warp-local tick-scale retained shell.

The implementation repaired the BTR-specific blockers that 0097 and
0098 classified:

- domain BTR/provenance values no longer import `CodecPort`;
- domain BTR/provenance values no longer import `defaultCodec`;
- BTR record values no longer own `serialize` or `deserialize`;
- provenance domain APIs no longer expose `toJSON` or `fromJSON`;
- HMAC signs typed canonical bytes instead of anonymous field bags;
- BTR-specific `as unknown as` bridges were removed;
- legacy domain-side `btrOperations.ts` was deleted.

## What Went Well

The cycle stayed in dependency order. 0097 named the sludge families,
0098 settled canonical signing-byte ownership, and 0099 then repaired
the implementation seam.

The most important implementation correction was canonicality. The
failing serialized-verifies test showed that the original record and the
decoded record were signing different runtime shapes. GREEN fixed that
by lowering both through one deterministic adapter-local BTR canonical
projection before producing `BtrSigningBytes`.

The scope checkpoint also worked. Reading Aion Paper VII, warp-ttd, and
the Continuum schemas before continuing GREEN prevented BTR repair from
turning into private Continuum schema work.

## What Went Wrong

The first dirty GREEN direction let `BtrCodecAdapter` drift too close to
owning broad patch and shared-schema semantics. That was caught before
commit, but it proved that the implementation path was dangerous without
an explicit external-context checkpoint.

The BTR repair also required collateral test and call-site updates for
the removal of domain `toJSON`/`fromJSON` names. Those changes were
small and justified, but they are a reminder that boundary cleanup
often exposes naming debt in adjacent code.

## What Changed From Original Plan

The original PULL already planned a BTR boundary repair, but the cycle
added a stronger external-context checkpoint before committing GREEN
implementation.

That checkpoint added these scope constraints:

- BTR is one concrete tick-scale retained shell family.
- BTR is not Continuum `Receipt`.
- BTR is not Continuum `Witness`.
- BTR is not `SuffixShell`.
- BTR is not `ImportOutcome`.
- BTR is not `SettlementResult`.
- BTR is not the generic hologram abstraction.
- shared Continuum contract families belong in authored schemas and
  generated artifacts, not hand-rolled git-warp DTOs.

This was beneficial drift. It narrowed the repair and kept 0099 from
becoming protocol-alignment work.

## What This Cycle Proved

The cycle proved that BTR/provenance codec ownership can be repaired
without broadening BTR into Continuum contract families.

It also proved:

- `BoundaryTransitionRecord` can stay a domain value;
- `BoundaryTransitionProvenance` can own BTR provenance meaning;
- `BtrSigningEnvelope` can represent semantic signing input;
- `BtrSigningBytes` can be guarded against arbitrary raw-byte wrapping;
- `BoundaryTransitionRecordCodecPort` can define the boundary
  capability without owning returned values;
- `BtrCodecAdapter` can own local canonical BTR projection and wire
  conversion;
- `CryptoPort` can remain generic and byte-oriented;
- serialized BTR records can verify after decode because signing bytes
  are stable across round trip.

## What This Cycle Did Not Prove

0099 did not prove that all 0096 cast blockers are fixed. It repaired
the BTR/provenance family only.

It also did not prove:

- BTR wire DTOs can never grow shared Continuum semantics;
- the current canonical projection has enough long-term fixture
  coverage;
- existing `Patch` is the final stable element for BTR provenance;
- git-warp BTR shells are aligned with future Continuum
  receipt/witness/suffix/settlement schemas;
- the broader cast quarantine can graduate.

Those are follow-up concerns, not failures of this cycle.

## Why 0096 Remains Blocked

`0096-purge-cast-hacks` remains blocked because the BTR-specific cast
blockers are repaired, but non-BTR blockers remain.

The known remaining cast-quarantine blocker families are:

- `ImmutableSnapshot`;
- `MaterializedViewHelpers`;
- `MaterializedViewService`;
- `checkpointLoad`;
- `HttpSyncServer`;
- `TemporalQuery`;
- `VisibleStateScope`;
- `WarpStream`.

Resuming 0096 as one large blob would recreate the whac-a-cast failure
mode. The next repair should pick the next root-cause family in
dependency order.

## Follow-Up Handling

The Drift check listed these candidates:

- `PROTO_continuum-contract-alignment-for-btr-and-receipts`;
- `PROV_btr-canonical-projection-test-vectors`;
- `PROV_btr-wire-dto-locality-guard`;
- `PROV_patch-stability-for-btr-provenance`.

Created cool-idea card:

- `PROTO_continuum-contract-alignment-for-btr-and-receipts`

Created bad-code/testing card:

- `PROV_btr-wire-dto-locality-guard`

Folded into future BTR hardening, no separate card yet:

- `PROV_btr-canonical-projection-test-vectors`;
- `PROV_patch-stability-for-btr-provenance`.

Reason: stronger deterministic canonical projection fixture vectors and
an explicit check that `Patch` remains stable enough as the BTR
provenance element are acceptance criteria for future BTR hardening.
They are not separate strategic work yet.

## Recommendation For Next Cycle

Do not resume the whole `0096-purge-cast-hacks` cycle as one blob.

BTR-specific blockers are repaired, but 0096 still has non-BTR blockers.
The next engineering slice should choose the next remaining cast family
in dependency order.

Recommended next cycle:

- `IMM_snapshot-builder-domain-model`

Reason: `ImmutableSnapshot` is still a root runtime lie if it promises
arbitrary `clone<T>() as T`. That should become an explicit snapshot
builder/value model before broader materialized-view or storage seam
cleanup resumes.
