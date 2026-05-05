# TypeScript Migration Policy

How we convert `src/domain/` from JavaScript to TypeScript without
producing or preserving sludge. Read this before starting any
conversion work.

## The Goal

Every `.js` file in `src/domain/` becomes `.ts`. Every god (>500 LOC)
is decomposed. No `unknown`, no `any`, no `as`, no sludge survives
the conversion. SSTS is the active standard.

## What "Conversion" Means

Converting a file is NOT renaming `.js` to `.ts` and adding type
annotations. It is a full architectural review:

1. **Type every parameter and return value.** No `Record<string, unknown>`.
   If you don't know the type, you haven't understood the code yet.
2. **Kill all casts.** Every `/** @type */` and `as` assertion is a
   lie. Replace with runtime validation or proper typing.
3. **Promote domain concepts to classes.** If it has invariants,
   identity, or behavior, it's a class with a constructor — not a
   typedef, not an interface, not a plain object.
4. **Split gods.** Files over 500 LOC get decomposed during conversion,
   not after. One runtime object per file.
5. **Fix architecture.** If encoding/decoding is in domain code, move
   it to an adapter. If a host bag is being passed around, inject
   typed ports. Don't preserve existing sludge.

## Banned Constructs

These are errors, not warnings. Zero tolerance.

- `any` — anywhere, for any reason
- `unknown` — outside parser/boundary functions (and even there, prefer
  concrete types)
- `as` — type assertions bypass the compiler. Use runtime guards.
- `Record<string, unknown>` — the trench coat for `any`
- `interface` for domain concepts — `interface` is for ports only
- `enum` — use `as const` objects or class hierarchies
- Zod on cryptographically-verified data — if git-cas verified the
  SHA-256 chunks and Ed25519 verified the signature, Zod is redundant

## The Conversion Pattern

### Small files (< 200 LOC, no architectural issues)

1. Read the file
2. Create the `.ts` version with proper types
3. Delete the `.js` file
4. Update all imports (source + tests)
5. Run tests
6. Commit

### Medium files (200-500 LOC, needs cleanup)

1. Read the file and identify sludge (casts, bags, `unknown`, encoding
   in domain)
2. Create the `.ts` version with sludge removed
3. Create new types/classes as needed (one per file)
4. Delete the `.js` file
5. Update all imports
6. Run tests
7. Commit

### God files (> 500 LOC)

1. Read the backlog plan (there should be one in
   `docs/method/backlog/v17.0.0/`)
2. Identify the split: what's domain logic, what's infrastructure,
   what's a separate concern
3. Create a port if the god mixes domain + infrastructure
4. Create an adapter implementing the port (infrastructure layer)
5. Create the slim domain service (< 500 LOC)
6. Create typed domain classes for concepts that were bags/typedefs
7. Delete the old `.js` god
8. Rewrite tests to test the new architecture
9. Commit

## Infrastructure Rules

### git-cas for content, plumbing for structure

- **Storing application data IN Git** (blobs holding CBOR, snapshots,
  indexes, trust records) → `@git-stunts/git-cas`
  - CDC chunking, dedup, streaming, content-addressed manifests
  - Backward compat: try git-cas manifest first, fall back to raw blob
- **Raw Git operations** (refs, commit walking, config) →
  `@git-stunts/plumbing`
- **Git trailer encoding/decoding** → `@git-stunts/trailer-codec`
- **Secrets** (signing keys, credentials) → `@git-stunts/vault`

### Encoding/decoding is a boundary concern

Domain code never touches wire format. CBOR encode/decode, Git tree
entry format strings, commit message construction — all belong in
adapters, not domain services.

The adapter boundary is where:
- Raw bytes become typed domain objects (decode + validate)
- Typed domain objects become raw bytes (encode)
- Content-addressed hashes are computed and verified
- Signature payloads are precomputed for domain use

### Streaming by default

`AsyncIterable<T>`, not `T[]`. The graph can be arbitrarily large.
Never assume the full dataset fits in memory.

- Port methods return `AsyncIterable<T>` for unbounded sequences
- Domain accumulators (`buildState`, materialization) accept both
  sync iterables (tests) and async iterables (production)
- Buffering into arrays is acceptable only when the domain logic
  requires random access or a count

## Domain Object Rules

### Classes, not typedefs

```text
// WRONG — phantom type, no runtime truth
type TrustRecord = {
  recordType: string;
  recordId: string;
  // ...
};

// RIGHT — runtime-backed, validated at construction
class TrustRecord {
  static fromDecoded(input: DecodedTrustRecord): TrustRecord { ... }
  private constructor(...) { Object.freeze(this); }
}
```

### Type guards for dispatch

```typescript
// WRONG — tag switching
switch (record.recordType) {
  case 'KEY_ADD': handleKeyAdd(record); break;
}

// RIGHT — type guards on the class
if (record.isKeyAdd()) {
  handleKeyAdd(record.subject); // subject is typed as KeyAddSubject
}
```

### Precompute at the boundary

If domain code needs derived data (signature payloads, canonical
hashes), the adapter precomputes it and attaches it to the domain
object. Domain code never recomputes from raw form.

```typescript
class TrustRecord {
  readonly signaturePayload: Uint8Array; // precomputed by adapter
}
```

## Test Rules

### Golden fixtures export typed instances

```typescript
// goldenRecords.ts exports TrustRecord instances directly
export const KEY_ADD_1 = toRecord(RAW_KEY_ADD_1);
// Tests use them with zero wrapping
const state = await buildState([KEY_ADD_1, KEY_ADD_2]);
```

### Ad-hoc records use a file-local helper

```typescript
// 3-line helper, local to the test file, NOT a shared export
function tr(fields) {
  return TrustRecord.fromDecoded({
    ...fields,
    signaturePayload: textEncode(signaturePayload(fields)),
  });
}
```

### Mock ports, not mock internals

```typescript
// WRONG — spy on private methods
vi.spyOn(service, '_buildAdjacency');

// RIGHT — mock the port
const trustChain = new MockTrustChainPort();
trustChain.seed(records);
const service = new TrustRecordService(trustChain);
```

## Per-Turn Discipline

At the end of every turn:

1. **Stage and commit** all changes
2. **Scorecard** — list all touched files with SSTS / LOC / SOLID /
   DRY / 1:1 / remarks
3. **Progress bar** — JS vs TS file count in `src/domain/`
4. **Most wanted** — update the god kill count if a god was slain

## Wave Plan

Files are grouped by directory coherence. Small clean wins first,
monsters last. Each wave's plan lives in
`docs/method/backlog/v17.0.0/TS_wave-NN-*.md`.

| Wave | Directory | Files | LOC | Status |
|------|-----------|-------|-----|--------|
| 1 | codec/ | 8 | 933 | COMPLETE |
| 2 | trust/ | 8 | 1441 | COMPLETE |
| 3 | dag/ + provenance/ | 10 | 2884 | NOT STARTED |
| 4 | state/ + query/ | 10 | 3767 | NOT STARTED |
| 5 | controllers/ + strand | 10 | 2823 | NOT STARTED |
| 6 | sync/ + medium services | 10 | 3596 | NOT STARTED |
| 7 | index/ small + services | 10 | 2803 | NOT STARTED |
| 8 | big strand + big index | 10 | 5756 | NOT STARTED |
| 9 | gods and monsters | 13 | 10987 | NOT STARTED |
