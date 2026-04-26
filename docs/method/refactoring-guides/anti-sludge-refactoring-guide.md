# Anti-Sludge Refactoring Guide

This guide is for agents and humans repairing TypeScript sludge in
git-warp. It is intentionally prescriptive. If a patch removes a visible
smell but keeps the same runtime lie, reject it.

Implementation should happen in dependency order, not grep order.

## Anti-pattern: Cast Theater

### Smell

`as unknown as`, `as any`, or a single cast near a decode, codec, port,
storage, or domain-constructor seam.

### Why It Is Wrong

A cast is not validation. It does not prove the runtime fact the code
needs. It only suppresses TypeScript where the design lacks a decoder,
constructor, port, or named value.

### Do Not Fix It By

Replacing a double cast with a single cast, introducing `any`, hiding the
cast in a helper, or creating a vague `Payload` type.

### Correct Fix

Identify the missing runtime proof. Establish that proof at the correct
place: adapter decoder, port boundary, application use-case, or domain
constructor.

### Example Transformation

Before:

```ts
const patch = raw as unknown as PatchEntry;
```

After:

```ts
const decoded = patchEntryDecoder.decode(raw);
if (decoded.kind === 'rejected') {
  return decoded;
}
const patch = decoded.patchEntry;
```

### Usually Blocks

Quarantine graduation, boundary cleanup, fake-model removal.

### Usually Blocked By

Runtime-backed nouns, boundary decoders, precise ports.

## Anti-pattern: Boundary Leakage

### Smell

Domain/application code calls `CodecPort.encode`, `CodecPort.decode`,
`JSON.parse`, `JSON.stringify`, HTTP APIs, database clients, or imports a
default codec.

### Why It Is Wrong

Core logic should operate on decoded domain values. Encoding and
decoding are external-world concerns. When core owns them, transport
format and business behavior become coupled.

### Do Not Fix It By

Passing a codec deeper, renaming decode functions as "normalize", or
wrapping codec calls in domain helpers.

### Correct Fix

Move encode/decode to an adapter or codec boundary. Core receives domain
values or named canonical byte products.

### Example Transformation

Before:

```ts
const record = codec.decode<BtrFields>(bytes);
return new BoundaryTransitionRecord(record);
```

After:

```ts
const decoded = btrCodec.decode(bytes);
return useCase.verify(decoded.record);
```

### Usually Blocks

Cast purge, canonical-byte work, import-law cleanup.

### Usually Blocked By

Boundary DTOs, codec ports, domain constructors.

## Anti-pattern: Anonymous Bag Models

### Smell

`Record<string, ...>`, inline primitive field bags, and names like
`Payload`, `Data`, `Info`, or `Like` standing in for domain concepts.

### Why It Is Wrong

Anonymous bags do not state invariants. They make illegal states easy to
construct and make security-sensitive code depend on field vibes.

### Do Not Fix It By

Moving the bag to a `types.ts` file, adding comments, or renaming it to
another vague noun.

### Correct Fix

Name the concept. Give it a constructor or decoder that establishes
invariants. Split domain names from transport names.

### Example Transformation

Before:

```ts
type Fields = { version: number; h_in: string; P: Record<string, string>[] };
```

After:

```ts
class BoundaryTransitionFields {
  constructor(input: BoundaryTransitionFieldInput) {
    // validate invariants here
  }
}
```

### Usually Blocks

BTR/provenance repair, hash/signature correctness, public API clarity.

### Usually Blocked By

Glossary/noun design, constructors, adapter DTOs.

## Anti-pattern: Canonical Byte Violations

### Smell

Hashing or HMAC over semantic objects, object bags passed to signing
helpers, or codec-selected bytes used as security-sensitive material.

### Why It Is Wrong

Signatures and hashes depend on exact bytes. If the signed bytes are
created implicitly from an object, codec behavior and field ordering
become part of the security contract without being named.

### Do Not Fix It By

Saying "the codec is canonical" at the call site, sorting object keys in
the domain, or accepting arbitrary objects in HMAC helpers.

### Correct Fix

Introduce a canonical byte noun such as `BtrSigningBytes`. A boundary
codec/adaptor produces it. Crypto signs bytes only.

### Example Transformation

Before:

```ts
const tag = await crypto.hmac('sha256', key, codec.encode(fields));
```

After:

```ts
const signingBytes = btrCodec.toSigningBytes(envelope);
const tag = await crypto.hmac('sha256', key, signingBytes.bytes);
```

### Usually Blocks

Provenance security, BTR cast removal, deterministic replay checks.

### Usually Blocked By

Canonical byte nouns, BTR signing-envelope model, codec boundary.

## Anti-pattern: Port Impersonation

### Smell

A small object is cast to a large port, often with a comment like "only
`readBlob` is used."

### Why It Is Wrong

The dependency is dishonest. Tests and production code appear to provide
more capability than the consumer actually needs.

### Do Not Fix It By

Adding a one-method port solely to satisfy TypeScript or keeping the cast
with a better comment.

### Correct Fix

Name the real capability and split the port only if that capability is
architecturally durable.

### Example Transformation

Before:

```ts
const storage = { readBlob } as unknown as IndexStoragePort;
```

After:

```ts
class PropertyShardReader {
  constructor(private readonly blobs: PropertyShardReaderPort) {}
}
```

### Usually Blocks

Cast purge, index storage cleanup, adapter/package extraction.

### Usually Blocked By

Capability analysis, port naming, adapter ownership.

## Anti-pattern: Generic Preservation Lies

### Smell

`clone<T>()`, `freeze<T>()`, `Object.create`, descriptor copying, or
deep-clone logic returning `T` by cast.

### Why It Is Wrong

Generic cloning cannot prove constructor invariants, private fields, or
behavioral identity. It returns an object that may look like `T` without
being a valid `T`.

### Do Not Fix It By

Changing the cast shape, expanding clone special cases forever, or
declaring the clone helper "trusted."

### Correct Fix

Create a named snapshot builder/value. Preserve domain objects through
constructors or explicit snapshot protocols.

### Example Transformation

Before:

```ts
function cloneImmutableValue<T>(value: T): T {
  return cloneByDescriptor(value) as T;
}
```

After:

```ts
const snapshot = SnapshotMaterializer.fromWarpState(state);
return snapshot.value;
```

### Usually Blocks

Immutable snapshot hardening, public read API honesty, cast purge.

### Usually Blocked By

Snapshot noun design, explicit snapshot protocol.

## Anti-pattern: Default Behavior Bugs

### Smell

Important behavior is disabled unless an optional config object exists.
Materialization snapshots and seek snapshots are examples.

### Why It Is Wrong

Absence of configuration should not silently disable core graph-database
durability behavior. Defaults are architecture.

### Do Not Fix It By

Sprinkling implicit booleans through call sites or writing snapshots
without retention rules.

### Correct Fix

Introduce explicit policy nouns with default-on behavior, opt-out, and
retention.

### Example Transformation

Before:

```ts
if (!checkpointPolicy) {
  return;
}
```

After:

```ts
if (snapshotPolicy.shouldWriteAfter(materialization)) {
  await snapshots.write(materialization);
}
```

### Usually Blocks

Streaming/resume guarantees, release defaults, seek UX.

### Usually Blocked By

Policy nouns, retention design, tests for default and opt-out behavior.

## Anti-pattern: Optional-Property Lifecycle Soup

### Smell

Objects with many optional fields, boolean flag bags, or result objects
like `{ ok, error?, retryable? }`.

### Why It Is Wrong

Optional soup lets impossible lifecycle states compile. Callers must
guess which fields exist for which state.

### Do Not Fix It By

Adding more optional fields, using comments as state machines, or
checking fields ad hoc at call sites.

### Correct Fix

Use discriminated unions or runtime-backed lifecycle classes with exact
variants.

### Example Transformation

Before:

```ts
type Result = { ok: boolean; error?: string; retryable?: boolean };
```

After:

```ts
type SaveResult =
  | { kind: 'saved'; receipt: SaveReceipt }
  | { kind: 'retryable_failure'; reason: TransientFailure }
  | { kind: 'rejected'; reason: ValidationFailure };
```

### Usually Blocks

Error handling clarity, retry logic, test completeness.

### Usually Blocked By

Named failure modes, lifecycle analysis.

## Anti-pattern: Junk-Drawer Modules

### Smell

`utils.ts`, `helpers.ts`, `common.ts`, or files mixing codec,
persistence, crypto, transport, and domain rules.

### Why It Is Wrong

Junk drawers hide ownership. They make dependency direction hard to see
and invite unrelated changes into one file.

### Do Not Fix It By

Moving the junk drawer or creating a larger barrel export.

### Correct Fix

Split by concept. One file should have one reason to exist.

### Example Transformation

Before:

```txt
services/helpers.ts
```

After:

```txt
services/btr-signing-envelope.ts
services/property-shard-reader.ts
services/snapshot-materializer.ts
```

### Usually Blocks

Hexagonal enforcement, import-law cleanup, package extraction.

### Usually Blocked By

Concept ownership decisions, dependency graph inspection.

