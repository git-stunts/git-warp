---
id: PROV_btr-provenance-codec-boundary-sludge
blocked_by: []
blocks:
  - 0096-purge-cast-hacks
feature: provenance-security
release_home: v17.0.0
---

# BTR provenance code mixes domain records, codec bytes, and HMAC material

**Effort:** M

## What's Wrong

`src/domain/services/provenance/btrOperations.ts` currently has a
shape like:

```ts
fields: {
  version: number;
  h_in: string;
  h_out: string;
  U_0: Uint8Array;
  P: readonly Record<string, ...>[];
  t: string;
}
```

That is not a domain concept. It is an anonymous transport-ish bag
used as HMAC input.

The same file also does:

```ts
ProvenancePayload.fromJSON(btr.P as unknown as PatchEntry[]);
```

That is compile-time theater. The code has not proven that `btr.P`
contains real patch entries; it has only instructed TypeScript to stop
asking.

`BTR.serialize()`, `BTR.deserialize()`, and `computeHmac()` also call
`CodecPort.encode/decode` from domain-side provenance code. That means
the core BTR model owns wire encoding and canonical byte production.
Per the anti-sludge policy, encoding and decoding belong at boundaries,
not in domain/application behavior.

## Why This Matters

BTR security depends on everyone signing and verifying exactly the same
bytes. A generic `CodecPort` plus object-shaped HMAC input does not make
canonical byte production explicit enough. The type system should make
it impossible to accidentally sign a non-canonical object encoding.

This debt currently blocks `0096-purge-cast-hacks`: the BTR casts are
symptoms of missing nouns and misplaced boundary work, not isolated
casts that should be locally patched.

## Suggested Fix

Introduce exact nouns before removing the casts:

- `BoundaryTransitionRecord` as a runtime-backed domain value with
  validated fields.
- `BoundaryTransitionPayload` or a sharper provenance-payload noun that
  stores real patch entries, not `Record<string, ...>[]`.
- A canonical byte boundary, owned outside domain, that turns a BTR
  signing envelope into `Uint8Array`.
- HMAC operations should sign bytes, not object bags.
- BTR wire decode/encode should live in an adapter/codec boundary and
  return explicit decoded domain values.

The domain should be able to say "this is the BTR signing envelope" and
"these are the bytes to sign" without doing CBOR/JSON/wire decoding
itself.

## Acceptance

- No `CodecPort.encode` or `CodecPort.decode` calls remain in
  `src/domain/services/provenance/BTR.ts` or
  `src/domain/services/provenance/btrOperations.ts`.
- No `Record<string, ...>` model stands in for BTR payload fields in
  provenance domain code.
- No `as unknown as PatchEntry[]` bridge remains.
- BTR HMAC code signs a named canonical byte value, not an anonymous
  object literal.
- `0096-purge-cast-hacks` can remove the BTR cast sites by using the
  new nouns instead of suppressing the type system.
