# 0097 Sludge Atlas And Refactor Guide

- Status: `hill met`
- Release lane: `v17.0.0`
- Source task: `ARCH_sludge-atlas-and-refactor-guide`
- Source cycle blocked: `0096-purge-cast-hacks`
- Sponsor human: James Ross
- Sponsor agent: Codex

## Hill

git-warp has a durable Sludge Atlas and anti-sludge refactoring guide
that classify the root-cause families blocking `0096-purge-cast-hacks`.
The artifacts make it clear which missing nouns and boundary contracts
must exist before production code changes resume.

This cycle does not fix production code. It makes the anatomy visible so
future cycles repair in dependency order instead of grep order.

## Why This Exists

`0096-purge-cast-hacks` reached RED successfully, then GREEN exposed the
real problem: several casts are smoke, not fire. They are pressure
valves where the code lacks a runtime-backed noun, a boundary decoder, a
canonical byte contract, or an honest capability port.

The failed implementation direction tried to remove visible casts while
the underlying design still relied on anonymous object bags, generic
object cloning, codec calls in domain code, and large-port
impersonation. That would have turned obvious sludge into cleaner-looking
sludge.

The important diagnosis:

> Generic `object` / `Record<...>` use is mostly not legitimate
> modeling. It is being used as a pressure valve where the code does not
> have the right noun yet.

This cycle captures that diagnosis as doctrine and data.

## Current Evidence

`0096-purge-cast-hacks` added an AST-based conformance test that finds
the remaining cast escape hatches. The RED witness found 13 real cast
sites in `src/**/*.ts`.

Representative root-cause evidence:

| File | Lines | Symptom |
|---|---:|---|
| `src/domain/services/provenance/BTR.ts` | 20-97 | BTR owns codec encode/decode and bridges decoded bags to BTR fields |
| `src/domain/services/provenance/BTR.ts` | 41-42 | `PatchEntryJSON = Record<string, ...>` stands in for a model |
| `src/domain/services/provenance/BTR.ts` | 115-128 | field-presence checks on generic records replace decoding |
| `src/domain/services/provenance/btrOperations.ts` | 35-48 | HMAC signs an anonymous semantic object through codec-selected bytes |
| `src/domain/services/provenance/btrOperations.ts` | 93-101 | provenance payload is cast into BTR payload shape |
| `src/domain/services/provenance/btrOperations.ts` | 188-191 | `fromJSON` rehydrates by double-casting BTR payload data |
| `src/domain/services/provenance/ProvenancePayload.ts` | 73-78 | domain API names JSON even though domain should not know wire format |
| `src/domain/services/ImmutableSnapshot.ts` | 107-125 | generic descriptor copy promises arbitrary `T` preservation |
| `src/domain/services/index/PropertyIndexReader.ts` | 17-18 | decoded property shard data is a nested `Record` bag |
| `src/domain/services/index/PropertyIndexReader.ts` | 100-128 | property shard decode and parse live inside the domain reader |
| `src/domain/services/MaterializedViewHelpers.ts` | 44-50 | a read-only object is cast to a larger storage port |
| `src/domain/services/MaterializedViewService.ts` | 157-160 | a `readBlob` surface is cast to `IndexStoragePort` |
| `src/domain/warp/RuntimeHostBoot.ts` | 76, 144-150 | snapshot policy is optional and only validated when supplied |
| `src/domain/RuntimeHost.ts` | 219, 810-813 | auto-checkpointing is off when no policy is supplied |
| `src/domain/services/Worldline.ts` | 251-258 | seek changes source only; it does not snapshot by default |

## Source Cycle Blocked

`0096-purge-cast-hacks` is:

- CYCLE START: done
- PULL: done
- RED: done
- GREEN: blocked

Blockers:

- `PROV_btr-provenance-codec-boundary-sludge`
- `CORE_canonical-byte-nouns`
- `IMM_snapshot-builder-domain-model`
- `IDX_property-reader-capability-port`
- `MAT_snapshotting-defaults-off`

The RED test remains valid. The implementation path is blocked because
some casts cannot be honestly removed until their missing runtime facts
are modeled.

## Sludge Taxonomy

### Cast Theater

Symptoms:

- `as unknown as`
- `as any`
- single casts that merely silence the compiler
- casts near boundary decode, codec, port, or storage seams

Real fix:

- introduce an adapter-boundary decoder
- introduce a runtime-backed domain constructor
- introduce a precise port
- introduce a named value object
- defer if the needed noun does not exist yet

Never replace a double cast with a single cast.

### Boundary Leakage

Symptoms:

- `CodecPort.encode` or `CodecPort.decode` in domain/application code
- `defaultCodec` imported by domain/application behavior
- JSON, CBOR, wire, HTTP, DB, framework, request, or response concerns
  in core

Real fix:

- move encode/decode to adapter or codec boundaries
- core receives decoded domain values
- core emits domain values or named canonical byte nouns

### Anonymous Bag Models

Symptoms:

- `Record<string, ...>` pretending to be a domain type
- inline object types with many primitive fields
- `fields: { version; h_in; h_out; U_0; P; t }`
- vague `Payload`, `Data`, `Info`, or `Like` names

Real fix:

- name the concept
- create a runtime-backed value object or exact transport DTO
- define invariants at construction or decode time
- avoid generic bags as HMAC, hash, or signing material

### Canonical Byte Violations

Symptoms:

- hashing or HMAC over semantic objects
- codec-selected bytes used for security-sensitive signing
- object field ordering or codec implementation affects signatures
- HMAC helpers accept object bags

Real fix:

- introduce `CanonicalBytes` or a specific noun such as
  `BtrSigningBytes`
- have codecs/adapters produce canonical bytes
- crypto signs bytes only
- domain never signs arbitrary object bags

Rule: if a hash or HMAC is over an object, the design is suspect. If it
is over a named canonical byte value, inspect the boundary that produced
it.

### Port Impersonation

Symptoms:

- small object cast to a large port
- "only readBlob is used" comments
- implementation pretends to satisfy full storage/index/transport
  capability

Real fix:

- split the capability port only after naming the real seam
- name the exact dependency, such as `PropertyShardReaderPort`
- use the narrow port only if it represents a durable architectural
  capability

### Generic Preservation Lies

Symptoms:

- `clone<T>()` or `freeze<T>()` returning `T` by cast
- generic deep clone preserving type identity without constructor
  involvement
- `Object.create` and descriptor copying followed by `as T`

Real fix:

- stop promising arbitrary `T`
- make snapshot construction an explicit class or builder
- return a named immutable snapshot value
- preserve domain objects only through constructors or explicit snapshot
  protocols

### Default Behavior Bugs

Symptoms:

- materialization snapshots are off by default
- seek does not snapshot by default
- behavior relies on absence of options rather than explicit policy

Real fix:

- introduce an explicit policy noun
- default snapshotting on
- provide explicit opt-out
- test default writes and opt-out suppression
- define retention so default-on does not mean unbounded growth

### Optional-Property Lifecycle Soup

Symptoms:

- state modeled with many optional fields
- boolean flag bags
- result objects with `ok`, `error?`, and `retryable?`

Real fix:

- discriminated unions
- exact lifecycle states
- explicit result variants

### Junk-Drawer Modules

Symptoms:

- `utils.ts`
- `helpers.ts`
- `common.ts`
- files mixing codec, persistence, domain rules, crypto, and transport

Real fix:

- split by concept
- one file, one reason to exist
- name modules after owned concepts

## Required Nouns

### Provenance / BTR

Domain nouns:

- `PatchEntry`
- `BoundaryTransitionRecord`
- `BoundaryTransitionFields`
- `BoundaryTransitionProvenance`
- `BtrSigningEnvelope`

Boundary/codec nouns:

- `EncodedBtr`
- `DecodedBtrWireRecord`
- `BtrWirePatchEntry`
- `BoundaryTransitionRecordCodecPort`

Canonical byte nouns:

- `BtrSigningBytes`
- `CanonicalBytes`

Do not put `JSON`, `wire`, or `encoded` into domain nouns unless the
type is explicitly adapter/transport-only.

### Immutable Snapshot

Candidate nouns:

- `ImmutableSnapshot`
- `SnapshotBuilder`
- `SnapshotMaterializer`
- `SnapshotValue`

The final names should come from the owning materialization context, not
from generic clone mechanics.

### Property Index

Candidate nouns:

- `PropertyShard`
- `PropertyShardReaderPort`
- `DecodedPropertyShard`
- `PropertyIndexShard`

The port split should describe a real architectural capability, not just
a minimal TypeScript workaround.

### Snapshot Defaults

Candidate nouns:

- `MaterializationSnapshotPolicy`
- `SeekSnapshotPolicy`
- `SnapshotRetentionPolicy`

## Dependency Ordering

Implementation must happen in dependency order, not grep order:

1. Canonical byte nouns.
2. BTR/provenance domain nouns.
3. BTR boundary codec/adapters.
4. Property shard/index capability split.
5. Immutable snapshot builder/value model.
6. Materialization snapshot policy defaults.
7. Resume `0096-purge-cast-hacks`.
8. Resume `0025B` boundary leaks.
9. Resume fake-model purge.
10. Resume import-law purge.

This order prevents whac-a-cast patches from hiding root-cause work.

## Refactoring Recipes

When encountering a cast or generic object bag, ask:

1. What runtime fact is the cast pretending has been proven?
2. Where should that fact actually be established?
3. Is that place an adapter, port, application use-case, or domain
   constructor?
4. What named concept is missing?
5. Should this cycle fix it, or should this cycle block on a more
   fundamental task?

Recipe mapping:

| Sludge family | Preferred first move |
|---|---|
| Cast theater | Identify the missing runtime proof |
| Boundary leakage | Move decode/encode to boundary ownership |
| Anonymous bag models | Name the concept and constructor/decode boundary |
| Canonical byte violations | Introduce named canonical byte product |
| Port impersonation | Split capability by real dependency |
| Generic preservation lies | Replace fake `T` with snapshot noun |
| Default behavior bugs | Introduce explicit policy noun |
| Optional soup | Model lifecycle as variants |
| Junk drawers | Split by owned concept |

## Non-Goals

- Do not edit production code under `src/**`.
- Do not remove casts.
- Do not green `0096`.
- Do not fix BTR yet.
- Do not create fake models.
- Do not introduce new `unknown`, `any`, `Record<string, unknown>`,
  `as unknown as`, or `*Like`.
- Do not move codec logic yet.
- Do not fix as you go.
- Do not make source changes just because a fix seems obvious.

## Playback Questions

### Agent

- Can every remaining 0096 cast be classified into a sludge family?
- Does `policy/sludge/sludge-map.json` name the family, root cause, and
  recommended fix for each concrete finding?
- Does the refactoring guide say what not to do, not just what to do?
- Is implementation order dependency-based rather than grep-based?
- Are domain nouns separated from wire/transport nouns?
- Does the map make BTR canonical-byte work a blocker before BTR cast
  removal?

### Human

- Is the "pressure valve where the code lacks a noun" diagnosis visible
  without chat context?
- Is it clear why 0096 should stay blocked?
- Is the repair order credible?
- Are any proposed nouns too vague, too transport-flavored, or too fake?

## RED Plan

RED should add read-only checks over the atlas artifacts, not production
code changes.

Suggested RED tests:

```sh
npx vitest run test/conformance/sludgeAtlas.test.ts
```

Expected failures before GREEN:

- `policy/sludge/sludge-map.json` is missing required family coverage or
  required findings.
- `docs/method/refactoring-guides/anti-sludge-refactoring-guide.md` is
  missing required anti-pattern sections.
- `docs/design/0097-sludge-atlas-and-refactor-guide.md` is missing
  source-cycle blockage and dependency ordering.

## RED Witness

Command:

```sh
npx vitest run test/conformance/sludgeAtlas.test.ts
```

Result: failed for the intended reason.

The executable atlas contract found the current PULL artifacts but
rejected the map because no findings have machine-checkable
`proposed_nouns` entries yet. That proves the atlas is not allowed to be
ceremonial doctrine: proposed nouns must say who constructs them, who
consumes them, what invariant they prove, what layer owns them, and what
cast or boundary leak they eliminate.

## GREEN Plan

GREEN for this cycle is documentation and map completion only:

```sh
npx vitest run test/conformance/sludgeAtlas.test.ts
npx markdownlint docs/design/0097-sludge-atlas-and-refactor-guide.md \
  docs/method/refactoring-guides/anti-sludge-refactoring-guide.md
node -e "JSON.parse(require('node:fs').readFileSync('policy/sludge/sludge-map.json', 'utf8'))"
git diff --check
```

No `src/**` changes are allowed in GREEN.

## GREEN Witness

Commands:

```sh
npx vitest run test/conformance/sludgeAtlas.test.ts
node -e "JSON.parse(require('node:fs').readFileSync('policy/sludge/sludge-map.json', 'utf8')); console.log('valid json')"
npx markdownlint docs/design/0097-sludge-atlas-and-refactor-guide.md \
  docs/method/refactoring-guides/anti-sludge-refactoring-guide.md
git diff --check
```

Result: passed.

The sludge map now includes machine-checkable `proposed_nouns` entries
for the minimal blocker set. Each entry states who constructs the noun,
who consumes it, what invariant it proves, what layer owns it, and what
cast, boundary leak, object bag, or default behavior bug it eliminates.

## Playback Witness

### Agent Perspective

Can a future agent inspect `policy/sludge/sludge-map.json` and identify
which casts are blocked by missing nouns rather than local syntax?

Yes. Findings that block `0096-purge-cast-hacks` explicitly list the
source file, symptom, root cause, recommended fix, and
`blocks: ["0096-purge-cast-hacks"]`. The proposed noun entries then say
which missing concept must exist before the cast can be removed honestly.

Can a future agent tell which layer owns each proposed noun?

Yes, mechanically. Every `proposed_nouns` entry has a non-empty `layer`.
The current map uses `domain`, `ports`, and `policy`. The `policy` value
needs later architecture review, but it is explicit rather than hidden.

Can a future agent tell who constructs and consumes each proposed noun?

Yes. The test requires `constructs` and `consumes` for every proposed
noun. That prevents decorative noun entries that do not state ownership.

Can a future agent tell what invariant each noun proves?

Yes. The test requires `proves_invariant`. For example,
`BoundaryTransitionRecord` proves the presence and validity of the BTR
semantic fields, while `BtrSigningBytes` proves the HMAC input is
canonical bytes rather than an arbitrary object.

Can a future agent tell what cast, boundary leak, object bag, or default
behavior bug each noun eliminates?

Yes. The test requires `eliminates`, and entries point back to concrete
files and symptoms such as BTR double-casts, `codec.encode(fields)`,
nested property-shard `Record` bags, and default-off snapshot behavior.

Can a future agent avoid implementation in grep order and instead follow
dependency order?

Yes. The design doc and sludge map both state dependency order. The
explicit order starts with canonical byte nouns, then BTR/provenance
domain nouns, then boundary codec/adapters, before returning to
`0096-purge-cast-hacks`.

Can a future agent tell why `0096-purge-cast-hacks` must remain blocked?

Yes. `0096` is blocked because several remaining casts are symptoms of
missing runtime facts: canonical signing bytes, BTR/provenance nouns,
property-shard capability modeling, and snapshot construction/default
policy. Removing the casts first would hide those missing facts.

### Human Perspective

Can James review the atlas and see the actual architecture blockers?

Yes. The map groups blockers by sludge family and identifies source
files, symptoms, root causes, and proposed repair concepts. The design
also keeps representative evidence in a reviewable table.

Is the distinction clear between domain nouns, transport/wire nouns,
canonical byte nouns, ports, and policy/default nouns?

Mostly. The BTR/provenance split is explicit: domain nouns do not carry
JSON/wire names, while boundary/codec nouns do. Canonical byte nouns are
named separately. Ports are separated by layer. Policy/default nouns are
called out, but the `policy` layer label needs later decision.

Is the next implementation sequence obvious?

Yes. The sequence is:

1. canonical byte nouns
2. BTR/provenance domain nouns
3. BTR boundary codec/adapters
4. property shard/index capability split
5. immutable snapshot builder/value model
6. materialization snapshot policy defaults
7. resume `0096-purge-cast-hacks`

Does the atlas reduce the chance of whac-a-cast refactoring?

Yes. Future work must satisfy the atlas test and noun-proof shape. That
means a future agent cannot claim a noun is real unless it states
construction, consumption, invariant, layer ownership, and eliminated
sludge.

Are any proposed nouns suspicious, over-broad, fake, or likely to become
sludge?

`CanonicalBytes` is intentionally broad and should be used carefully; a
specific noun such as `BtrSigningBytes` is safer for BTR work.
`SnapshotBuilder` could become generic clone sludge if it does not limit
itself to explicit snapshot protocols and known domain sources.
`PropertyShardReaderPort` is acceptable only if it represents a durable
architectural capability, not a one-method port created to satisfy
TypeScript.

Are any layer labels questionable?

Yes. `policy` is conceptually useful in the map, but the formal
architecture layers are normally `domain`, `application`, `ports`, and
`adapters`. Later cycles should decide whether snapshot policy nouns
belong to domain/application configuration while retaining `policy` only
as a feature category.

### BTR Signing Ownership Story

Current intended story:

- Domain creates the semantic signing envelope.
- Boundary codec/adapter produces canonical signing bytes.
- Crypto/HMAC consumes canonical bytes.
- Domain does not own wire encode/decode.

The current map supports this story, with one nuance. `BtrSigningEnvelope`
is marked `domain`, `BoundaryTransitionRecordCodecPort` is marked
`ports`, and `BtrSigningBytes` is marked `ports`. That is enough to
prevent domain-side `codec.encode(fields)` and object-bag signing.

The nuance is ownership of `BtrSigningBytes`: it may be better modeled
as a domain/application value produced by a port adapter rather than as a
port-layer noun. That should be reviewed before implementation. The
invariant is still correct: HMAC signs named canonical bytes only.

## Playback Weak Spots

- `layer: "policy"` is not a standard architecture layer. It may need to
  become `domain` or `application` with `policy` retained as a feature
  category.
- `BoundaryTransitionRecordCodecPort` is clearly a port, but
  `BtrSigningBytes` may belong in domain/application as a value returned
  by that port rather than in `ports`.
- `SnapshotBuilder` is at risk of becoming a new generic-clone dumping
  ground unless its construction scope is explicitly limited.
- `PropertyShardReaderPort` is acceptable only if tied to a durable
  materialized-index capability; otherwise it becomes one-method port
  theater.
- Line numbers are useful evidence but not stable enough to be the only
  contract. Future tests should key primarily on paths, family ids, and
  required findings.
- The sludge map is JSON-valid and conformance-tested, but it does not
  yet have a formal JSON schema. A later cycle should add schema
  validation when the format stabilizes.

## Drift Check

Did the cycle stay within its non-goal of no production code changes
under `src/**`?

Yes. The completed 0097 work did not edit `src/**`. The changed files
are design/process documents, the sludge map, and a conformance test.

Did the cycle preserve `0096-purge-cast-hacks` as blocked instead of
trying to fix casts?

Yes. `0096` remains blocked. This cycle did not remove casts or attempt
to green the cast-purge test.

Did the cycle produce the required artifacts?

Yes.

- `docs/design/0097-sludge-atlas-and-refactor-guide.md`
- `docs/method/refactoring-guides/anti-sludge-refactoring-guide.md`
- `policy/sludge/sludge-map.json`
- `test/conformance/sludgeAtlas.test.ts`

Did RED match the design intent?

Yes. RED added a read-only executable contract for the atlas and guide.
It failed because the PULL sludge map did not yet include
machine-checkable noun proofs.

Did GREEN satisfy RED without weakening the test?

Yes. GREEN updated the map with minimal `proposed_nouns` entries. The
test remained intact and passed after the map recorded construction,
consumption, invariants, layer ownership, and eliminated sludge for each
proposed noun.

Did Playback reveal any new follow-up items?

Yes. Playback identified layer-label ambiguity, possible ownership drift
for `BtrSigningBytes`, the need to prevent `SnapshotBuilder` and
`PropertyShardReaderPort` from becoming theater, and future schema
validation for the sludge map.

Did any implementation drift occur?

No harmful implementation drift occurred. No production source was
changed.

Is any drift beneficial and worth keeping?

Yes.

- RED added an executable noun-proof contract that is stronger than the
  original PULL artifact.
- Playback identified layer-label ambiguity around `policy`.
- Playback identified possible ownership correction for
  `BtrSigningBytes`.
- Playback identified future JSON schema validation for the sludge map.

Is any drift harmful and requiring correction?

No harmful drift is known at this phase.

### Follow-Up Candidates For Retrospective

- `SLUDGE_map-json-schema`
- `ARCH_policy-layer-label-decision`
- `PROV_btr-signing-bytes-layer-ownership`
- `ARCH_agent-source-change-guard-for-doc-only-cycles`

The last candidate is optional, but it is likely worth making executable
later: doc-only cycles should be able to prove they did not modify
production source.

## Edge Cases

- A file can belong to multiple sludge families.
- Exact line numbers may drift; map entries can be file-level when line
  numbers are unstable.
- Some codecs are already named ports, but boundary ownership can still
  be wrong.
- `Zod` is useful at boundaries; using Zod inside domain behavior to
  compensate for missing nouns is still sludge.
- `Record<string, string>` may be acceptable for small wire maps at a
  boundary, but not as a domain entity or signing envelope.

## Known Failure Modes

- The atlas becomes a dumping ground instead of a repair guide.
- A cycle later treats proposed nouns as permission to create fake
  models without invariants.
- Agents resume 0096 and remove casts in blocked files by creating
  narrower-looking object bags.
- A boundary DTO name leaks into domain code.
- HMAC/hash paths keep accepting objects while claiming the codec is
  canonical.
- Snapshot defaults are changed without retention policy.
- Port splitting creates one-method ports with no architectural meaning.

## Cycle End

0097 is closed with the hill met. The completed retrospective is:

- [docs/method/retros/0097-sludge-atlas-and-refactor-guide.md](../method/retros/0097-sludge-atlas-and-refactor-guide.md)

Follow-up backlog cards created by the retrospective:

- `docs/method/backlog/bad-code/SLUDGE_map-json-schema.md`
- `docs/method/backlog/bad-code/ARCH_policy-layer-label-decision.md`
- `docs/method/backlog/bad-code/PROV_btr-signing-bytes-layer-ownership.md`
- `docs/method/backlog/cool-ideas/ARCH_agent-source-change-guard-for-doc-only-cycles.md`

Closeout confirmations:

- `0096-purge-cast-hacks` remains blocked.
- No production source under `src/**` changed during 0097.
- The atlas conformance test remains green.
- The next recommended cycle is
  `PROV_btr-signing-bytes-layer-ownership`, not cast purge.
