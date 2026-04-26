# 0097 Sludge Atlas And Refactor Guide

- Status: `PULL`
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

