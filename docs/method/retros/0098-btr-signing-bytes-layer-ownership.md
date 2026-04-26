# 0098 BTR Signing Bytes Layer Ownership Retrospective

- Outcome: `hill met`
- Cycle doc: [docs/design/0098-btr-signing-bytes-layer-ownership.md](../../design/0098-btr-signing-bytes-layer-ownership.md)
- Release lane: `v17.0.0`

## Outcome

0098 succeeded as an ownership-decision cycle. It did not repair BTR
implementation. It made canonical signing-byte ownership executable and
corrected the 0097 sludge map doctrine.

The cycle decided:

- `BtrSigningEnvelope` is domain-owned.
- `BtrSigningBytes` is domain-owned, not ports-owned.
- `BoundaryTransitionRecordCodecPort` is a port capability, not owner
  of the values it returns.
- The adapter implementing that port constructs `BtrSigningBytes`.
- HMAC consumes `BtrSigningBytes` through `CryptoPort`.

## What Went Well

The cycle separated value ownership from construction responsibility.
That distinction matters: a value can be constructed by an adapter
without becoming adapter-owned, and a port can return a value without
owning it.

The RED test made the decision executable. It failed while the sludge
map still labeled `BtrSigningBytes` as `ports`, then GREEN corrected the
map and guide without touching production implementation.

The reusable doctrine is now explicit:

> Ports define capabilities; they do not own the values they return.

## What Went Wrong

The 0097 atlas had the right instinct but the wrong layer label for
`BtrSigningBytes`. That was useful to discover before implementation.
If the project had moved straight into BTR repair, the wrong layer label
could have made canonical bytes look like a port-layer artifact instead
of a domain value with a boundary-proven construction path.

The cycle also exposed an unresolved implementation hazard:
`BtrSigningBytes` must not become a public wrapper around arbitrary
`Uint8Array`.

## What Changed From Original Plan

RED added one stronger requirement than the original PULL: the
construction-path guardrail.

The final doctrine says:

> BtrSigningBytes must not be constructible from arbitrary raw bytes
> outside the canonical BTR signing encoder path.

That drift is beneficial. Without it, the cycle could have only changed
the label from `ports` to `domain` while leaving canonical-byte cosplay
possible.

## What This Cycle Proved

The cycle proved that the ownership line is clear enough to drive the
next BTR/provenance boundary repair:

- Domain owns meaning.
- Adapters own encoding.
- Ports define capabilities.
- Crypto signs typed canonical bytes.
- A value is not owned by the layer that happens to produce it.
- Canonical bytes require a proven construction path, not just a class
  name.

## What This Cycle Did Not Prove

The cycle did not prove that BTR implementation is repaired. It did not
introduce `BtrSigningEnvelope`, `BtrSigningBytes`, or
`BoundaryTransitionRecordCodecPort`. It did not move HMAC orchestration
or codec ownership. It did not prove deterministic canonical encoding.
It did not implement streaming HMAC support.

Those remain next-cycle work.

## Why 0096 Remains Blocked

`0096-purge-cast-hacks` remains blocked because the BTR cast sites still
lack implementation nouns and boundary seams. The ownership decision is
now settled, but the code still needs:

- runtime-backed BTR/provenance domain nouns;
- adapter-owned canonical BTR signing encoding;
- a `BtrSigningBytes` construction guard;
- deterministic canonical encoding tests;
- HMAC over typed canonical bytes instead of object bags;
- removal of domain-side codec/defaultCodec ownership.

Removing casts before those exist would still be whac-a-cast.

## Follow-Up Handling

The Drift check listed these candidates:

- `PROV_btr-signing-bytes-construction-guard`
- `PROV_btr-canonical-encoding-determinism-tests`
- `PROV_crypto-port-typed-hmac-input`
- `ARCH_move-provenance-orchestration-out-of-domain-services`

No new backlog cards were created in this retrospective.

Folded into `PROV_btr-provenance-codec-boundary-sludge`:

- `PROV_btr-signing-bytes-construction-guard`
- `PROV_btr-canonical-encoding-determinism-tests`
- `ARCH_move-provenance-orchestration-out-of-domain-services`

Reason: these are core acceptance criteria for BTR/provenance boundary
repair, not standalone strategy.

`PROV_crypto-port-typed-hmac-input` was also folded into the next BTR
boundary repair PULL as a design check, not a separate card yet. The
next cycle should decide whether a typed `CryptoPort.hmac` input shape is
BTR-local or broad enough to deserve its own backlog card. Creating that
card now would be premature backlog confetti.

The existing
`docs/method/backlog/bad-code/PROV_btr-provenance-codec-boundary-sludge.md`
card was updated with the folded acceptance criteria.

## Recommendation For Next Cycle

Pull `PROV_btr-provenance-codec-boundary-sludge` next, design-first.

The PULL should include these acceptance criteria from 0098:

- `BtrSigningBytes` has a construction guard.
- Deterministic canonical BTR signing encoding is tested.
- Provenance orchestration moves out of `src/domain/services` if needed
  to preserve domain/application separation.
- No domain `CodecPort` or `defaultCodec` usage remains in BTR
  provenance code.
- HMAC signs typed canonical bytes, not object bags.
- The cycle decides whether `CryptoPort.hmac` needs a typed input shape
  or whether BTR should unwrap `BtrSigningBytes` at the application
  boundary while keeping `CryptoPort` generic.

Do not resume `0096-purge-cast-hacks` until that boundary repair exists.
