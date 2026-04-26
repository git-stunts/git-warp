# 0098 BTR Signing Bytes Layer Ownership

- Status: `GREEN`
- Release lane: `v17.0.0`
- Source backlog: `PROV_btr-signing-bytes-layer-ownership`
- Blocks: `PROV_btr-provenance-codec-boundary-sludge`,
  `0096-purge-cast-hacks`
- Sponsor human: James Ross
- Sponsor agent: Codex

## Hill

git-warp has a documented, testable ownership decision for BTR canonical
signing bytes: domain owns semantic signing values, adapters own
canonical encoding, ports define the capability boundary, and crypto
signs typed canonical bytes rather than objects or wire bags.

## Why This Exists

Cycle 0097 intentionally left one sharp ambiguity unresolved:
`policy/sludge/sludge-map.json` currently marks `BtrSigningBytes` as a
`ports` noun because a boundary codec/adapter produces it. That is
probably the wrong ownership story.

A value is not owned by the layer that happens to produce it. Ports
define capabilities. Adapters implement those capabilities. Domain owns
runtime-backed domain values and their invariants. Canonical BTR signing
bytes sit at the seam: they are produced by boundary encoding, but they
represent a semantic promise needed by provenance security.

Ports define capabilities; they do not own the values they return.

This cycle decides that seam before any BTR implementation changes.

## Current Evidence

The current BTR code has three coupled problems:

| File | Lines | Evidence |
|---|---:|---|
| `src/domain/services/provenance/BTR.ts` | 20-97 | Domain imports `CodecPort` and `defaultCodec`; `BTR` owns `serialize()` and `deserialize()` |
| `src/domain/services/provenance/BTR.ts` | 41-42 | `PatchEntryJSON = Record<string, ...>` stands in for a provenance model |
| `src/domain/services/provenance/BTR.ts` | 115-128 | Field-presence checks plus casts replace a real decoder/constructor |
| `src/domain/services/provenance/btrOperations.ts` | 35-48 | `computeHmac()` accepts an anonymous fields object and signs codec-selected bytes |
| `src/domain/services/provenance/btrOperations.ts` | 93-101 | `payload.toJSON()` is cast into BTR payload shape |
| `src/domain/services/provenance/btrOperations.ts` | 188-191 | `ProvenancePayload.fromJSON(btr.P as unknown as PatchEntry[])` rehydrates by cast |
| `src/domain/services/provenance/ProvenancePayload.ts` | 73-78 | Domain API names JSON even though domain should not own wire language |

The current 0097 sludge map has the right direction but the wrong layer
label for one noun:

- `BtrSigningEnvelope` is marked `domain`.
- `BoundaryTransitionRecordCodecPort` is marked `ports`.
- `BtrSigningBytes` is marked `ports`.

This cycle decides whether `BtrSigningBytes` is actually a domain value,
an application value, a port-layer branded value, or adapter-owned raw
bytes.

## Decision

### 1. Which Layer Owns `BtrSigningEnvelope`?

`BtrSigningEnvelope` is owned by `domain`.

It is the semantic, pre-authentication envelope for a BTR. It names the
meaningful fields that are covered by the authentication tag:

- BTR version
- input state hash
- output state hash
- initial state bytes
- ordered boundary transition provenance
- timestamp

It must not include the HMAC/authentication tag, because the tag is
computed from the envelope. It must not include wire-format names such
as JSON or CBOR. It must not know how canonical bytes are produced.

Who constructs it:

- The BTR creation use-case constructs it from already validated domain
  values and byte values.

Who consumes it:

- `BoundaryTransitionRecordCodecPort` consumes it to produce
  `BtrSigningBytes`.

Invariant it proves:

- The authentication input has a named semantic envelope and is not an
  anonymous object bag assembled beside the HMAC call.

### 2. Which Layer Owns `BtrSigningBytes`?

`BtrSigningBytes` is owned by `domain`.

It is not owned by `ports`. A port does not own the values that cross
it. A port names the capability that produces or consumes those values.

It is not owned by `adapters`. Adapters own the concrete encoding work,
but allowing an adapter-owned transport type to flow into provenance
security would make the domain depend on a boundary artifact.

It is not owned by `application`. Application orchestrates the use-case,
but the invariant belongs to the provenance/security domain: these bytes
are the canonical authentication input for a BTR signing envelope.

`BtrSigningBytes` is therefore a domain value object whose construction
path proves the bytes came from the canonical BTR signing encoder.

BtrSigningBytes must not be constructible from arbitrary raw bytes outside the canonical BTR signing encoder path.

### 3. Who Constructs `BtrSigningBytes`?

The adapter implementing `BoundaryTransitionRecordCodecPort` constructs
`BtrSigningBytes`.

That construction is allowed because adapters may depend inward on
domain values. The adapter owns the canonical encoding algorithm. The
domain owns the value class that names the result.

The implementation must not expose raw `Uint8Array` and then ask
application/domain code to wrap it later. Wrapping raw bytes outside the
codec boundary would lose the proof that those bytes were produced by
the canonical BTR signing encoder.

The construction rule is:

```text
BtrSigningEnvelope -> BoundaryTransitionRecordCodecPort implementation
  -> BtrSigningBytes
```

### 4. Who Consumes `BtrSigningBytes`?

The crypto/HMAC use-case consumes `BtrSigningBytes`.

The HMAC implementation may ultimately receive byte chunks or a
`Uint8Array`, but the public provenance flow must pass a
`BtrSigningBytes` value, not an anonymous object and not raw bytes.

The desired orchestration is:

```text
BtrSigningEnvelope
  -> BoundaryTransitionRecordCodecPort.signingBytes(envelope)
  -> BtrSigningBytes
  -> CryptoPort.hmac(...)
  -> authentication tag
  -> BoundaryTransitionRecord
```

The application/use-case layer should orchestrate this flow. Domain
types define the values and invariants. The adapter does encoding. The
crypto adapter performs HMAC. The domain model does not import
`CodecPort`, `defaultCodec`, or platform crypto.

### 5. Does A Port Return `BtrSigningBytes`?

Yes. `BoundaryTransitionRecordCodecPort` returns `BtrSigningBytes`.

It must not return raw `Uint8Array` for signing bytes. Returning raw
bytes would force the caller to trust that the adapter used the correct
canonical algorithm without carrying that proof in the type.

The port method should be conceptually shaped like:

```ts
signingBytes(envelope: BtrSigningEnvelope): BtrSigningBytes
```

This is a design sketch, not an implementation instruction for this
cycle.

### 6. Where Does Canonical Encoding Happen?

Canonical BTR signing encoding happens in the adapter implementing
`BoundaryTransitionRecordCodecPort`.

It does not happen in:

- `src/domain/services/provenance/BTR.ts`
- `src/domain/services/provenance/btrOperations.ts`
- generic `CodecPort.encode(fields)` calls from domain/application code
- `defaultCodec`

The canonical encoder must be specific to the BTR signing envelope. It
may use CBOR or another deterministic encoding internally, but callers
must not select an arbitrary codec for security-sensitive signing.

### 7. Where Does HMAC Happen?

HMAC is orchestrated by the application/use-case layer through
`CryptoPort`; the concrete HMAC operation happens in the crypto adapter.

Domain may define:

- `BtrSigningEnvelope`
- `BtrSigningBytes`
- `BoundaryTransitionRecord`
- authentication-tag value rules, if a later cycle introduces such a
  noun

Domain must not:

- import `CryptoPort`
- call `crypto.hmac(...)`
- encode arbitrary objects for HMAC
- select a codec for signing

This is stricter than the current code, where `btrOperations.ts` imports
both `CryptoPort` and `CodecPort` from domain-side provenance code. That
is existing debt, not the target architecture.

### 8. What Is Banned From Domain Code After This Decision?

After implementation of this decision, domain-side BTR/provenance code
must not contain:

- `CodecPort` imports
- `defaultCodec` imports
- `codec.encode(...)` or `codec.decode(...)`
- `serialize()` / `deserialize()` methods that own wire encoding
- `fromJSON()` / `toJSON()` methods as domain API names
- `PatchEntryJSON` as a domain type
- `Record<string, ...>` as a BTR/provenance model
- `as unknown as` bridges between BTR payloads and `PatchEntry`
- HMAC over anonymous object bags
- `CryptoPort` imports in pure domain values

If a later use-case temporarily keeps provenance orchestration under
`src/domain/services`, that cycle must name it as transitional debt and
keep domain value objects free of codec and crypto effects.

### 9. Which Sludge Map Entries Need Correction?

The next GREEN for this cycle should update
`policy/sludge/sludge-map.json` as follows:

| Entry | Required Correction |
|---|---|
| `canonical-byte-violations` / `BtrSigningBytes` | Change `layer` from `ports` to `domain` |
| `canonical-byte-violations` / `BtrSigningBytes.constructs` | State that the `BoundaryTransitionRecordCodecPort` adapter constructs the domain value |
| `canonical-byte-violations` / `BtrSigningBytes.consumes` | State that the application HMAC flow consumes it through `CryptoPort` |
| `boundary-leakage` / `BoundaryTransitionRecordCodecPort` | Clarify that the port returns domain values and does not own `BtrSigningBytes` |
| `anonymous-bag-models` / `BtrSigningEnvelope` | Clarify that the envelope is semantic and pre-authentication, not wire-shaped |

The next GREEN should update
`docs/method/refactoring-guides/anti-sludge-refactoring-guide.md` to
state the same ownership rule:

```text
Domain owns semantic canonical-byte value objects.
Adapters produce them through ports.
Ports do not own the values.
Crypto signs typed byte values, not object bags.
```

### 10. How Does This Unblock Downstream Work?

This cycle unblocks `PROV_btr-provenance-codec-boundary-sludge` by
settling the layer line before code moves:

- BTR domain nouns can be introduced without codec ownership.
- BTR codec/adapters can be introduced with a clear return value.
- HMAC code can stop accepting anonymous objects.
- The old `codec.encode(fields)` path has a named replacement.
- The old `ProvenancePayload.fromJSON(...)` shape bridge can be split
  into domain provenance and boundary patch-entry decoding.

This later unblocks `0096-purge-cast-hacks` because the BTR cast sites
will have real runtime facts to point at:

- decoded BTR records become `BoundaryTransitionRecord`
- signing fields become `BtrSigningEnvelope`
- HMAC input becomes `BtrSigningBytes`
- wire payload entries become boundary DTOs decoded before domain use

## Streaming Posture

`BtrSigningBytes` names a canonical byte sequence, not necessarily a
fully materialized byte array.

The repair should prefer an API shape that can be consumed in chunks by
future streaming HMAC work. If the first implementation uses
`Uint8Array`, it must be scoped as a local bridge and must not make the
domain concept mean "fits in memory."

The rule is:

```text
BtrSigningBytes represents canonical bytes.
It does not promise those bytes are already fully materialized.
```

## Dependency Order

Do the repair in this order:

1. Update the sludge map and refactoring guide with the ownership
   decision.
2. Add executable conformance around the ownership decision.
3. Implement BTR/provenance domain nouns.
4. Implement the BTR boundary codec port and adapter.
5. Move HMAC orchestration out of domain-side object encoding.
6. Resume `PROV_btr-provenance-codec-boundary-sludge`.
7. Resume `0096-purge-cast-hacks`.

Do not resume cast purge until the BTR/provenance repair has actual
nouns and boundary seams.

## Playback Questions

### Agent

- Can a future agent tell that `BtrSigningEnvelope` is a domain noun?
- Can a future agent tell that `BtrSigningBytes` is a domain value
  produced by an adapter through a port?
- Can a future agent tell that `BoundaryTransitionRecordCodecPort` is a
  port capability, not the owner of the values it returns?
- Can a future agent tell that canonical encoding belongs in an adapter?
- Can a future agent tell that HMAC must consume `BtrSigningBytes`
  rather than an object bag or raw codec output?
- Can a future agent identify which 0097 sludge-map entries must be
  corrected?
- Can a future agent explain why 0096 remains blocked?

### Human

- Can James see the ownership line between domain meaning, adapter
  encoding, port boundary, and crypto execution?
- Is it clear why `BtrSigningBytes` should not be labeled `ports`?
- Is it clear how this decision prevents BTR repair from becoming
  architecture cosplay?
- Is the next implementation order obvious enough to approve or
  challenge?
- Are the streaming constraints visible before code hardens around
  materialized arrays?

## RED Plan

Add a conformance test that fails until the doctrine artifacts reflect
this decision.

The test should assert:

- `policy/sludge/sludge-map.json` marks `BtrSigningBytes.layer` as
  `domain`.
- `BtrSigningBytes.constructs` names the
  `BoundaryTransitionRecordCodecPort` adapter/implementation as the
  producer.
- `BtrSigningBytes.consumes` names the HMAC/crypto flow as the consumer.
- No sludge-map noun proof claims `ports` owns `BtrSigningBytes`.
- The refactoring guide states that ports return canonical byte values
  but do not own them.
- This design doc states that canonical encoding happens in adapters.
- This design doc states that HMAC consumes `BtrSigningBytes`.

RED must not edit `src/**`.

## RED Witness

Command:

```sh
npx vitest run test/conformance/btrSigningBytesOwnership.test.ts
```

Result: failed as intended, 1 passed and 6 failed.

The failing assertions show that the current repo still contradicts the
0098 ownership decision:

- the design text needs an exact doctrine phrase for port capability
  ownership;
- `policy/sludge/sludge-map.json` still marks `BtrSigningBytes.layer`
  as `ports`;
- the `BtrSigningBytes.constructs` proof does not yet name an adapter;
- the `BtrSigningBytes.consumes` proof does not yet name `CryptoPort`;
- the refactoring guide does not yet state that ports define
  capabilities rather than owning returned values;
- the design does not yet include the raw-byte construction guardrail
  for `BtrSigningBytes`.

No production implementation under `src/**` was edited.

## GREEN Witness

Commands:

```sh
npx vitest run test/conformance/btrSigningBytesOwnership.test.ts
npx vitest run test/conformance/sludgeAtlas.test.ts
node -e "JSON.parse(require('node:fs').readFileSync('policy/sludge/sludge-map.json', 'utf8')); console.log('valid json')"
npx markdownlint docs/design/0098-btr-signing-bytes-layer-ownership.md docs/method/refactoring-guides/anti-sludge-refactoring-guide.md
git diff --check
git status --short | rg '^.. src/' || true
```

Result: all validation passed. The source-status guard returned no
`src/**` files.

Doctrine now records:

- `BtrSigningBytes.layer` is `domain`.
- `BoundaryTransitionRecordCodecPort` adapter/implementation constructs
  the domain value from `BtrSigningEnvelope`.
- the application HMAC flow consumes `BtrSigningBytes` through
  `CryptoPort`.
- ports define capabilities; they do not own the values they return.
- `BtrSigningBytes` must not be constructible from arbitrary raw bytes
  outside the canonical BTR signing encoder path.

## Playback Witness

Required ownership statement:

Domain owns meaning. Adapters own encoding. Ports define capabilities.
Crypto signs typed canonical bytes.

### Agent Playback

Can a future agent tell that `BtrSigningEnvelope` is domain-owned?

Yes. The decision section states that `BtrSigningEnvelope` is owned by
`domain`, that it is the semantic pre-authentication envelope for a BTR,
and that it must not know how canonical bytes are produced.

Can a future agent tell that `BtrSigningBytes` is domain-owned, not
ports-owned?

Yes. The design states that `BtrSigningBytes` is owned by `domain`, the
sludge map now records `"layer": "domain"`, and the ownership test fails
if a `BtrSigningBytes` proposed noun is labeled `ports`.

Can a future agent tell that `BoundaryTransitionRecordCodecPort` is a
port capability, not owner of the values it returns?

Yes. The design names `BoundaryTransitionRecordCodecPort` as the port
capability, and the guide now states: "Ports define capabilities; they
do not own the values they return."

Can a future agent tell that adapters perform canonical BTR signing
encoding?

Yes. The design says canonical BTR signing encoding happens in the
adapter implementing `BoundaryTransitionRecordCodecPort`; the sludge map
now says the `BoundaryTransitionRecordCodecPort` adapter/implementation
constructs `BtrSigningBytes`.

Can a future agent tell that the adapter/port construction path is what
proves `BtrSigningBytes` is canonical?

Yes. The design says `BtrSigningBytes` must not be constructible from
arbitrary raw bytes outside the canonical BTR signing encoder path. The
map's noun proof now ties construction to the adapter/implementation and
canonical BTR signing encoder.

Can a future agent tell that HMAC consumes `BtrSigningBytes` through
`CryptoPort`?

Yes. The sludge map says the application HMAC flow consumes
`BtrSigningBytes` through `CryptoPort`, and the design's orchestration
path shows `BtrSigningBytes -> CryptoPort.hmac(...)`.

Can a future agent tell that raw `Uint8Array` is not an acceptable public
substitute for `BtrSigningBytes`?

Yes. The design says `BoundaryTransitionRecordCodecPort` must not return
raw `Uint8Array` for signing bytes, and the construction guardrail bans
arbitrary raw-byte construction.

Can a future agent tell that domain must not call `codec.encode`,
`defaultCodec`, or own wire encode/decode?

Yes. The banned-from-domain section explicitly lists `CodecPort`
imports, `defaultCodec` imports, `codec.encode(...)`,
`codec.decode(...)`, and domain-owned `serialize()` / `deserialize()`
wire methods.

Can a future agent tell which sludge-map and guide entries were
corrected?

Yes. GREEN corrected the `BtrSigningBytes` proposed noun in
`policy/sludge/sludge-map.json` and the canonical byte section in
`docs/method/refactoring-guides/anti-sludge-refactoring-guide.md`.

Can a future agent tell why `0096-purge-cast-hacks` remains blocked?

Yes. The dependency order says cast purge must not resume until
BTR/provenance repair has real nouns and boundary seams. Existing BTR
casts are still symptoms of missing implementation, not local syntax.

### Human Playback

Can James review the artifacts and see the ownership line clearly?

Yes. The line is stated directly: domain owns meaning, adapters own
encoding, ports define capabilities, and crypto signs typed canonical
bytes.

Is it clear why `BtrSigningBytes` is domain-owned even though an adapter
constructs it?

Yes. The design states that a value is not owned by the layer that
produces it. The adapter constructs `BtrSigningBytes` because it owns the
canonical encoding operation; the domain owns the value because the value
proves a provenance/security invariant.

Is it clear why the port returns `BtrSigningBytes` instead of raw bytes?

Yes. Returning raw bytes would force callers to trust an untyped claim
that the bytes are canonical. Returning `BtrSigningBytes` carries the
construction-path proof across the port boundary.

Is it clear how this prevents canonical-byte cosplay?

Yes. The guardrail blocks the obvious fake fix: a public constructor that
wraps any `Uint8Array`. Canonical bytes must come from the canonical BTR
signing encoder path, not from arbitrary caller-provided bytes.

Is the next implementation order obvious?

Yes. The next implementation-adjacent cycle should be
`PROV_btr-provenance-codec-boundary-sludge`, still design-first. That
cycle should introduce BTR/provenance nouns and boundary seams before
resuming `0096-purge-cast-hacks`.

Are any parts still suspicious or underspecified?

Yes. The exact implementation mechanism that prevents arbitrary
construction is not designed yet, the deterministic canonical encoding
tests do not exist yet, and streaming HMAC remains posture rather than
implemented capability.

## Playback Weak Spots

- The eventual `BtrSigningBytes` implementation must prevent arbitrary
  raw-byte construction.
- The adapter that constructs `BtrSigningBytes` will need tests proving
  deterministic canonical encoding.
- Streaming posture is not implemented yet.
- `CryptoPort.hmac` may need a typed input shape or overload later.
- Existing `btrOperations.ts` still violates the doctrine; this cycle
  only settled ownership.
- Domain/application separation may require moving provenance
  orchestration out of `src/domain/services`.

## Drift Check

Did the cycle stay within its non-goal of no production implementation
changes under `src/**`?

Yes. No `src/**` files changed during 0098. The cycle changed only the
design doc, refactoring guide, sludge map, conformance test, and pulled
backlog card.

Did the cycle preserve the goal of deciding ownership rather than
implementing BTR repair?

Yes. The cycle decided ownership for `BtrSigningEnvelope`,
`BtrSigningBytes`, `BoundaryTransitionRecordCodecPort`, and HMAC
consumption. It did not implement BTR repair, create production nouns,
move HMAC, or edit provenance source.

Did RED match the PULL test plan?

Yes. RED added `test/conformance/btrSigningBytesOwnership.test.ts`,
which asserted that the design, sludge map, and refactoring guide must
encode the ownership decision. It failed because the repo still labeled
`BtrSigningBytes` as `ports` and lacked the guide/guardrail doctrine.

Did GREEN satisfy RED without weakening the test?

Yes. GREEN left the RED test intact and updated the doctrine artifacts
until the test passed. The test still requires domain ownership, adapter
construction proof, `CryptoPort` consumption proof, returned-value
ownership doctrine, and the raw-byte construction guardrail.

Did Playback reveal any new follow-up items?

Yes. Playback identified future implementation requirements around
construction guardrails, deterministic canonical encoding tests,
streaming posture, possible typed HMAC input, and provenance
orchestration relocation.

Did any implementation drift occur?

No. There was no production implementation work.

Did any doctrine drift occur?

Yes, beneficially. The doctrine became sharper than the original PULL by
adding exact reusable language about port ownership and canonical-byte
construction paths.

Was any drift beneficial and worth keeping?

Yes.

- The exact guardrail was added: `BtrSigningBytes must not be
  constructible from arbitrary raw bytes outside the canonical BTR
  signing encoder path.`
- The refactoring guide gained reusable doctrine: "Ports define
  capabilities; they do not own the values they return."
- Playback identified future implementation requirements:
  construction guard, deterministic canonical encoding tests, possible
  `CryptoPort.hmac` typed input, and provenance orchestration
  relocation.

Was any drift harmful and requiring correction?

No harmful drift is known. The cycle remained doctrine-only and kept
0096 blocked.

### Follow-Up Candidates For Retrospective

- `PROV_btr-signing-bytes-construction-guard`
- `PROV_btr-canonical-encoding-determinism-tests`
- `PROV_crypto-port-typed-hmac-input`
- `ARCH_move-provenance-orchestration-out-of-domain-services`

These should be considered during Retrospective. Most may be folded into
`PROV_btr-provenance-codec-boundary-sludge` if that cycle is pulled
next. `PROV_crypto-port-typed-hmac-input` may need its own card if it
turns out broader than BTR.

## GREEN Plan

Update only doctrine/process artifacts:

- `policy/sludge/sludge-map.json`
- `docs/method/refactoring-guides/anti-sludge-refactoring-guide.md`
- this design doc, if witness/status updates are needed

GREEN must not implement BTR repair and must not resume cast purge.

## Edge Cases

- A domain value can be constructed by an adapter. That does not make
  the value adapter-owned.
- A port can return a domain value. That does not make the value
  port-owned.
- Canonical bytes cannot be proven canonical by inspecting arbitrary
  bytes alone. The proof comes from construction path, port contract,
  and adapter tests.
- Signing bytes and wire bytes are different concepts even if they use
  the same low-level codec internally.
- `Uint8Array` is an implementation detail of byte storage, not the
  architectural noun.

## Known Failure Modes

- Moving `BtrSigningBytes` from `ports` to `domain` in the map without
  changing the construction/consumption text.
- Returning raw `Uint8Array` from the codec port and wrapping it later.
- Letting `BoundaryTransitionRecordCodecPort` become a generic
  `CodecPort` alias.
- Letting domain code call `defaultCodec` or arbitrary `codec.encode()`
  for security-sensitive signing.
- Treating canonical byte production as JSON serialization.
- Creating a `BtrSigningBytes` class whose constructor accepts any bytes
  from any caller with no construction-path guardrails.
- Forgetting that future BTR signing may need streaming byte
  consumption.

## Non-Goals

- Do not edit production implementation under `src/**`.
- Do not implement `BtrSigningEnvelope`.
- Do not implement `BtrSigningBytes`.
- Do not implement `BoundaryTransitionRecordCodecPort`.
- Do not move HMAC code yet.
- Do not repair BTR serialization yet.
- Do not resume `0096-purge-cast-hacks`.
- Do not add a sludge-map JSON schema; that is
  `SLUDGE_map-json-schema`.
