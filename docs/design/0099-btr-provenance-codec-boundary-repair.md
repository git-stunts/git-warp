# 0099 BTR Provenance Codec Boundary Repair

- Status: `RED`
- Release lane: `v17.0.0`
- Source backlog: `PROV_btr-provenance-codec-boundary-sludge`
- Blocks: `0096-purge-cast-hacks`
- Sponsor human: James Ross
- Sponsor agent: Codex

## Hill

git-warp has a surgical repair plan for BTR/provenance boundary sludge:
pure domain nouns own BTR meaning, adapters own wire and canonical
encoding, application/use-case orchestration owns HMAC flow, and
`0096-purge-cast-hacks` remains blocked until those seams exist.

## Why This Exists

0097 classified the sludge families blocking cast purge. 0098 settled
the critical ownership question for BTR canonical signing bytes:

Domain owns meaning. Adapters own encoding. Ports define capabilities.
Crypto signs typed canonical bytes.

Ports define capabilities; they do not own the values they return.

BtrSigningBytes must not be constructible from arbitrary raw bytes outside the canonical BTR signing encoder path.

The remaining work is no longer "remove casts." The work is to repair
the BTR/provenance boundary so casts have real runtime facts to point at.
This PULL designs that repair before touching implementation.

## Current Evidence

### `src/domain/services/provenance/BTR.ts`

| Lines | Evidence | Classification |
|---:|---|---|
| 20-21 | Imports `CodecPort` and `defaultCodec` into domain-side BTR code | Boundary leakage |
| 31-39 | `BTRFields` is a structural field bag rather than a runtime-backed domain constructor input | Anonymous bag model |
| 41-42 | `PatchEntryJSON = Record<string, ...>` pretends to model provenance | Anonymous bag model / wire leakage |
| 46-64 | `BTR` stores public primitive fields, including `P: readonly PatchEntryJSON[]` | Domain/wire concept mixing |
| 72-82 | `BTR.serialize()` owns CBOR/wire encoding via `codec.encode(...)` | Boundary leakage |
| 89-97 | `BTR.deserialize()` owns wire decoding and casts decoded data to `BTRFields` | Boundary leakage / cast theater |
| 115-128 | `findMissingField()` and `validateBTRStructure()` inspect generic records and double-cast a BTR | Anonymous bag model / cast theater |

### `src/domain/services/provenance/btrOperations.ts`

| Lines | Evidence | Classification |
|---:|---|---|
| 11-14 | Imports `CryptoPort`, `CodecPort`, and `defaultCodec` into domain-side provenance operations | Boundary leakage / orchestration in domain |
| 28-31 | `CryptoDeps` carries `codec?: CodecPort` beside crypto | Boundary leakage |
| 35-49 | `computeHmac(fields: { ... })` accepts an anonymous object bag and signs `codec.encode(fields)` | Canonical byte violation |
| 73-82 | `createBTR()` receives crypto/codec options directly in domain-side service code | Orchestration in domain |
| 93-96 | State hash and full-state serialization are codec-dependent inside BTR creation | Boundary leakage |
| 97-101 | `payload.toJSON() as unknown as readonly PatchEntryJSON[]` bridges domain provenance to wire payload shape | Cast theater / wire leakage |
| 138-142 | HMAC verification recomputes expected tag from object fields | Canonical byte violation |
| 184-191 | `replayBTR()` accepts codec deps and calls `ProvenancePayload.fromJSON(btr.P as unknown as PatchEntry[])` | Boundary leakage / cast theater |

### `src/domain/services/provenance/ProvenancePayload.ts`

| Lines | Evidence | Classification |
|---:|---|---|
| 14-17 | `PatchEntry` is an interface, not a runtime-backed value | Model gap |
| 19-31 | `ProvenancePayload` freezes an array but validates only `Array.isArray` | Runtime-invariant gap |
| 53-58 | `replay()` depends on `reduceV5([...this.#patches])` and casts the result to `WarpState` | Existing model/cast debt adjacent to BTR |
| 73-78 | Domain API exposes `toJSON()` and `fromJSON(...)` names | Wire-language leakage |

### `src/ports/CryptoPort.ts`

| Lines | Evidence | Classification |
|---:|---|---|
| 9-21 | `CryptoPort` is a generic crypto capability over `string | Uint8Array` for hash/HMAC inputs | Reusable byte-oriented port |

This supports keeping `CryptoPort` generic. BTR-specific values should
not leak into the crypto port.

### `src/ports/CodecPort.ts`

| Lines | Evidence | Classification |
|---:|---|---|
| 27-32 | `CodecPort` is a generic structured-codec capability with generic `encode` and `decode` | Too broad for BTR signing canonicality |

`CodecPort` can be an implementation dependency of a BTR codec adapter,
but BTR domain/application code must not select an arbitrary codec for
security-sensitive signing.

## Decisions Inherited From 0097 And 0098

- Repair happens in dependency order, not grep order.
- Casts are symptoms when the runtime fact has not been modeled.
- Generic `object` / `Record<...>` use is mostly not legitimate
  modeling; it is a pressure valve where the code lacks the right noun.
- `BtrSigningEnvelope` is domain-owned.
- `BtrSigningBytes` is domain-owned, not ports-owned.
- `BoundaryTransitionRecordCodecPort` is a port capability.
- The adapter implementing `BoundaryTransitionRecordCodecPort`
  constructs `BtrSigningBytes`.
- `BtrSigningBytes` construction must be guarded by the canonical BTR
  signing encoder path.
- HMAC consumes typed canonical bytes, not object bags.
- `0096-purge-cast-hacks` remains blocked until these nouns and
  boundaries exist.

## External Context Checkpoint

This checkpoint incorporates the Aion Paper VII, warp-ttd, and
Continuum schema context before continuing GREEN implementation.

Scope rules:

- BTR is one concrete tick-scale retained shell family.
- BTR is not the generic hologram abstraction.
- BTR is not Continuum `Receipt`.
- BTR is not Continuum `Witness`.
- BTR is not `SuffixShell`.
- BTR is not `ImportOutcome`.
- BTR is not `SettlementResult`.
- Continuum-owned shared contract families belong to authored
  GraphQL/Wesley schemas and generated artifacts, not hand-rolled
  git-warp DTOs.
- 0099 remains scoped to git-warp-local BTR/provenance boundary repair.
- Any future alignment between BTR shells and Continuum
  receipt/witness/suffix/settlement families must be a follow-up design
  cycle, not smuggled into this GREEN.

0099 must preserve BTR as a local shell repair. `BoundaryTransitionRecord`
must not become a proto-super-object for receipts, witnesses, suffix
shells, import outcomes, settlement results, or generic holograms.

### Current Dirty Implementation Review

Question: Does `BoundaryTransitionRecord` accidentally claim to be more
than a tick-scale retained shell?

Answer: The current implementation direction mostly names a BTR-specific
record, but it now needs an explicit scope guard. The type should remain
the runtime-backed value for a git-warp BTR shell at tick scale. It must
not absorb Continuum receipt, witness, suffix shell, import outcome,
settlement result, or generic hologram responsibilities.

Question: Does `BtrWireRecord` look like a git-warp-local BTR wire DTO,
or is it drifting toward a shared Continuum schema?

Answer: The name and intended placement are local enough, but the DTO
must stay git-warp-local. If it begins modeling receipt/witness/suffix or
settlement concepts, it is drifting into shared Continuum schema
ownership and should stop.

Question: Does `BtrCodecAdapter` manually own too much
patch/witness/schema decoding?

Answer: Yes, the current dirty implementation appears at risk of owning
too much patch-internal decoding, including context, ops, dots, schema,
reads, and writes. That is acceptable only as narrow git-warp-local BTR
wire repair if it is required to preserve existing data. It must not
become a permanent hand-rolled substitute for Continuum/Wesley generated
contract families.

Question: Is the canonical signing envelope stable across
encode/decode/verify?

Answer: Not yet. The current failing serialized-verifies test shows that
the rehydrated record does not currently reproduce the same signing
bytes. That means the implementation is still encoding object shape or
round-tripped representation rather than preserving a stable canonical
signing envelope.

Question: Does the failing serialized-verifies test indicate signing-byte
instability?

Answer: Yes. Treat the failure as a blocker, not a nuisance. If
decode-then-re-encode changes verification material, the BTR shell is not
canonical enough for HMAC verification.

Question: Should the current dirty implementation be revised, partially
reverted, or continued?

Answer: Do not continue it unchanged. Keep the domain/port/application
direction only where it still matches the narrowed BTR shell scope.
Revise the codec adapter and canonical envelope handling before
continuing GREEN. If a patch path requires broad Continuum-like schema
ownership, split that into a follow-up design cycle instead of burying it
inside 0099.

## Proposed Domain Nouns

### `BoundaryTransitionRecord`

Owner: domain.

Purpose: runtime-backed BTR value that binds the semantic record fields
and authentication tag.

Constructor rules:

- accepts already-decoded, already-validated domain values only;
- rejects unsupported BTR versions;
- rejects empty state hashes, empty initial-state bytes, empty
  provenance when the BTR rules require non-empty provenance, and invalid
  authentication tag values;
- freezes/copies byte inputs so callers cannot mutate record state;
- does not accept wire DTOs, JSON records, CBOR bytes, or
  `Record<string, ...>` field bags.

Invariants:

- record version is supported;
- `h_in`, `h_out`, `U_0`, provenance, timestamp, and authentication tag
  are all present as domain values;
- record payload is `BoundaryTransitionProvenance`, not
  `PatchEntryJSON[]`;
- no encode/decode or HMAC behavior lives on the value.

Consumers:

- BTR create/verify/replay use-cases;
- BTR wire codec adapter for encoding complete records;
- replay verification logic.

### `BoundaryTransitionProvenance`

Owner: domain.

Purpose: ordered provenance sequence for the BTR, backed by real
`PatchEntry` values or a sharper runtime-backed patch provenance value.

Constructor rules:

- accepts a readonly sequence of validated provenance entries;
- defensively copies and freezes the sequence;
- validates every entry has a patch and commit SHA through runtime
  constructors or existing patch constructors;
- does not expose `toJSON()` / `fromJSON()` domain API names.

Invariants:

- every entry is replayable by provenance replay logic;
- ordering is stable and preserved;
- domain provenance is not a wire patch-entry DTO.

Consumers:

- `BtrSigningEnvelope`;
- `BoundaryTransitionRecord`;
- replay use-case;
- boundary codec adapter, which lowers/raises wire entries at the
  adapter boundary.

### `BtrSigningEnvelope`

Owner: domain.

Purpose: semantic pre-authentication envelope for the exact fields that
must be signed.

Constructor rules:

- built from validated state hashes, initial-state bytes,
  `BoundaryTransitionProvenance`, timestamp, and supported version;
- excludes the authentication tag;
- performs no encoding and imports no codec.

Invariants:

- HMAC input is named as semantic BTR signing data;
- signing fields are complete and in the intended semantic set;
- no anonymous object bag is assembled beside the HMAC call.

Consumers:

- `BoundaryTransitionRecordCodecPort.signingBytes(envelope)`;
- BTR create/verify application use-cases.

### `BtrSigningBytes`

Owner: domain.

Purpose: typed canonical byte value for HMAC material.

Constructor rules:

- not constructible from arbitrary raw bytes outside the canonical BTR
  signing encoder path;
- constructed only by the `BoundaryTransitionRecordCodecPort`
  adapter/implementation or an equivalent internal factory that is not
  public to application/domain callers;
- preserves byte immutability by copying or freezing representation;
- can expose bytes to HMAC at the last responsible moment without
  letting callers forge canonicality.

Invariants:

- bytes came from canonical BTR signing encoding of a
  `BtrSigningEnvelope`;
- HMAC never signs arbitrary semantic objects or caller-provided bytes
  pretending to be canonical.

Consumers:

- BTR create/verify application use-cases;
- `CryptoPort.hmac` receives its bytes after application/use-case
  unwrapping.

## Proposed Boundary And Adapter Nouns

### `BoundaryTransitionRecordCodecPort`

Owner: ports.

Purpose: capability for BTR wire and canonical signing byte conversion.
It defines the boundary. It does not own returned domain values.

Responsibilities:

- decode BTR wire bytes into `BoundaryTransitionRecord` or a decoded
  result type that carries explicit failures;
- encode `BoundaryTransitionRecord` into BTR wire bytes;
- convert `BtrSigningEnvelope` into `BtrSigningBytes`;
- expose BTR-specific canonical signing behavior instead of generic
  `CodecPort.encode(fields)`.

Non-responsibilities:

- no HMAC;
- no replay;
- no state hash computation;
- no arbitrary generic encode/decode API.

### `BtrWireRecord`

Owner: adapter/boundary.

Purpose: exact transport DTO for encoded BTR records.

Responsibilities:

- represent BTR wire field names and storage layout;
- be decoded into domain nouns before domain/application behavior;
- never leak into domain values or application use-case contracts unless
  named as boundary-only.

### `BtrWireProvenanceEntry`

Owner: adapter/boundary.

Purpose: exact transport DTO for provenance entries inside a BTR wire
record.

Responsibilities:

- represent the encoded form of a provenance entry;
- be decoded into `BoundaryTransitionProvenance` entries at the boundary;
- replace `PatchEntryJSON = Record<string, ...>`.

### `BtrCodecAdapter`

Owner: adapters.

Purpose: implementation of `BoundaryTransitionRecordCodecPort`.

Responsibilities:

- own canonical BTR signing encoding;
- own BTR wire encode/decode;
- construct `BtrSigningBytes` through the guarded construction path;
- provide deterministic test vectors for signing bytes;
- use generic `CodecPort` or concrete CBOR internals only inside the
  adapter.

Non-responsibilities:

- no domain policy;
- no HMAC execution;
- no graph replay;
- no leaking `BtrWireRecord` into domain.

## Application Orchestration Plan

The BTR create/verify/replay flow should move out of domain-side
object-encoding functions and into application/use-case orchestration.

Target create flow:

1. Application receives decoded inputs and dependencies.
2. Application computes `h_in`, `U_0`, final state, and `h_out` using
   appropriate ports/services.
3. Application constructs `BoundaryTransitionProvenance`.
4. Application constructs `BtrSigningEnvelope`.
5. Application asks `BoundaryTransitionRecordCodecPort` for
   `BtrSigningBytes`.
6. Application unwraps `BtrSigningBytes` at the last responsible moment
   and calls `CryptoPort.hmac(...)`.
7. Application constructs `BoundaryTransitionRecord`.

Target verify flow:

1. Boundary adapter decodes wire bytes into `BoundaryTransitionRecord`.
2. Application asks the record for its signing envelope or constructs
   one from record fields.
3. Application obtains `BtrSigningBytes` from
   `BoundaryTransitionRecordCodecPort`.
4. Application unwraps at the last responsible moment for
   `CryptoPort.hmac(...)`.
5. Application compares expected and actual authentication tags through
   `CryptoPort.timingSafeEqual(...)`.
6. Optional replay verification runs on domain provenance values, not
   wire DTOs.

Current repo note: `src/application/` does not exist yet. The GREEN
phase should either introduce the necessary application/use-case home or
name a narrow transitional location while keeping pure domain values free
of codec and crypto effects. The long-term target is application
orchestration, not domain-side services importing ports and default
codecs.

## CryptoPort Decision

Decision: keep `CryptoPort.hmac` generic and byte-oriented for this
repair.

Current `CryptoPort.hmac` accepts:

```ts
hmac(_algorithm: string, _key: string | Uint8Array, _data: string | Uint8Array): Promise<Uint8Array>
```

That is reusable infrastructure. Making `CryptoPort` accept
`BtrSigningBytes` would make a generic crypto port depend on a
BTR-specific domain noun, which would invert architecture. The correct
default is:

- BTR application/use-case code carries `BtrSigningBytes`;
- application/use-case code unwraps its bytes at the last responsible
  moment;
- `CryptoPort.hmac` remains a byte-oriented capability;
- if typed crypto inputs become broadly useful, introduce a separate
  cross-domain typed crypto-input abstraction in a future design, not a
  BTR-specific dependency inside `CryptoPort`.

The next cycle should keep this decision unless RED/GREEN evidence shows
that BTR is not the only typed-crypto-input need.

## RED Plan

Add `test/conformance/btrProvenanceBoundary.test.ts`.

The RED test should fail against current source because the sludge still
exists. Candidate assertions:

- domain BTR/provenance files must not import `CodecPort`;
- domain BTR/provenance files must not import `defaultCodec`;
- domain BTR/provenance values must not expose `serialize()` /
  `deserialize()` wire methods;
- domain BTR/provenance code must not declare `PatchEntryJSON`;
- domain BTR/provenance code must not use `Record<string, ...>` as a
  BTR/provenance model;
- domain BTR/provenance code must not use `fromJSON` / `toJSON` as
  domain API names;
- HMAC code must not accept anonymous object bags as signing material;
- HMAC code must not call `codec.encode(fields)` on semantic objects;
- source must not contain `as unknown as PatchEntry[]`;
- source must not contain BTR/provenance `as unknown as` bridges;
- `test/conformance/btrSigningBytesOwnership.test.ts` remains green.

RED must not try to repair the source. It proves the wound still exists.

## RED Witness

Command:

```sh
npx vitest run test/conformance/btrProvenanceBoundary.test.ts
```

Result: failed as intended, 2 passed and 5 failed.

The failing categories prove the current offender files still contain
BTR/provenance boundary sludge:

- boundary leakage: `CodecPort`, `defaultCodec`, and codec calls still
  appear in domain-side BTR/provenance files;
- domain-owned wire API names: `serialize(...)`, `deserialize(...)`,
  `toJSON(...)`, and `fromJSON(...)` still appear in the offender set;
- anonymous bags and fake wire models: `PatchEntryJSON` and
  `Record<string, ...>` still stand in for provenance/BTR models;
- cast theater: `as unknown as` bridges still exist for BTR/provenance
  shapes;
- HMAC object-bag signing: `computeHmac(fields...)` still signs
  semantic object fields through codec-selected bytes.

No production implementation repair was attempted, and no `src/**`
files were edited during RED.

## GREEN Plan

GREEN is implementation work for the next phase, but the target shape is:

1. Introduce pure runtime-backed domain nouns:
   `BoundaryTransitionRecord`, `BoundaryTransitionProvenance`,
   `BtrSigningEnvelope`, and `BtrSigningBytes`.
2. Move BTR wire encode/decode into an adapter/boundary implementation.
3. Introduce `BoundaryTransitionRecordCodecPort`.
4. Add deterministic canonical encoding tests/test vectors for
   `BtrSigningBytes`.
5. Ensure `BtrSigningBytes` construction is guarded and cannot wrap
   arbitrary bytes.
6. Move HMAC orchestration out of domain-side object encoding.
7. Keep `CryptoPort` generic unless implementation evidence justifies a
   broader typed crypto-input abstraction.
8. Update callers without hiding debt behind casts.
9. Remove or replace domain `toJSON` / `fromJSON` API names for
   provenance values.
10. Keep `0096-purge-cast-hacks` blocked until the BTR cast sites are
    removed through these nouns and boundaries.

## Playback Questions

### Agent

- Can a future agent identify every current BTR/provenance boundary
  violation from source evidence?
- Can a future agent tell which values are domain-owned and which
  values are boundary-only?
- Can a future agent tell where canonical signing encoding happens?
- Can a future agent tell that `CryptoPort` stays generic and
  byte-oriented for this repair?
- Can a future agent tell why `BtrSigningBytes` cannot be a public raw
  bytes wrapper?
- Can a future agent derive RED tests directly from this design?
- Can a future agent avoid resuming `0096-purge-cast-hacks` too early?

### Human

- Can James see the implementation sequence before source edits begin?
- Is the line between domain nouns, wire DTOs, ports, adapters, and
  application orchestration clear?
- Is the `CryptoPort` decision explicit enough to approve or challenge?
- Are the folded 0098 acceptance criteria preserved?
- Are the known source violations named concretely enough?
- Is anything still too vague to implement without sludge risk?

## Drift Risks

- The implementation starts by deleting casts instead of introducing
  nouns and boundaries.
- `BtrSigningBytes` becomes a public `Uint8Array` wrapper.
- `BoundaryTransitionRecordCodecPort` becomes a generic `CodecPort`
  alias.
- Wire DTOs leak into domain names or constructors.
- `CryptoPort` grows a BTR-specific dependency.
- Domain-side provenance code keeps calling `CodecPort`, `defaultCodec`,
  or `codec.encode(...)` under new names.
- The conformance tests only check strings and miss semantic
  replacement sludge.

## Edge Cases

- BTR signing bytes and BTR wire bytes may use the same low-level codec
  internally but remain different concepts.
- Empty provenance may or may not be valid; the domain constructor must
  encode the actual BTR rule instead of assuming from current arrays.
- Replay verification needs decoded domain provenance, not wire DTOs.
- Existing state serialization/hash code may remain adjacent debt; this
  cycle owns only the BTR/provenance boundary repair needed to unblock
  casts.
- Streaming HMAC is not required in the first GREEN, but the byte noun
  should not semantically mean "entire payload fits in memory."
- Existing consumers may depend on `BTR.serialize()` / `deserialize()`;
  migration must replace them with boundary adapter calls, not preserve
  compatibility seams in domain.

## Known Failure Modes

- Creating fancier `Record<string, ...>` replacement bags.
- Moving `toJSON()` / `fromJSON()` names to another domain file.
- Signing `codec.encode(envelope)` directly from application code
  instead of using `BoundaryTransitionRecordCodecPort`.
- Adding `CanonicalBytes` as a vague generic noun when BTR needs
  `BtrSigningBytes`.
- Letting `BtrWireRecord` cross inward past the adapter boundary.
- Treating deterministic CBOR as sufficient proof without test vectors.
- Keeping provenance orchestration in `src/domain/services` and calling
  it "application" in comments only.

## Non-Goals

- Do not resume `0096-purge-cast-hacks`.
- Do not remove casts directly unless the target nouns and boundaries
  exist.
- Do not introduce generic `CanonicalBytes` unless a later design proves
  it is needed.
- Do not make `CryptoPort` depend on BTR-specific domain types without
  explicit design approval.
- Do not let wire DTOs leak into domain.
- Do not create `Record<string, ...>` replacement bags with fancier
  names.
- Do not preserve domain `serialize()` / `deserialize()` as compatibility
  seams.
- Do not edit production implementation during PULL.
