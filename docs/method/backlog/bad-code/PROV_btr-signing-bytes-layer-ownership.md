---
id: PROV_btr-signing-bytes-layer-ownership
blocked_by: []
blocks:
  - PROV_btr-provenance-codec-boundary-sludge
  - 0096-purge-cast-hacks
feature: provenance-security
release_home: v17.0.0
---

# Decide BtrSigningBytes ownership before BTR repair

**Effort:** S

## What's Wrong

The sludge map currently marks `BtrSigningBytes` as `ports` because it
is produced by a boundary codec/adapter. That may be wrong.

Canonical byte values might be domain/application values returned by a
port, port-layer branded values, or adapter-owned transport values. The
project should decide this before implementing BTR/provenance repair.

## Why This Matters

BTR security depends on signing exact bytes. If canonical byte ownership
is placed in the wrong layer, the BTR repair could move sludge around
instead of removing it.

## Suggested Fix

Clarify the ownership story:

- Domain creates semantic signing envelope.
- Boundary codec/adapter produces canonical signing bytes.
- Crypto/HMAC consumes canonical bytes.
- Domain does not own wire encode/decode.

Then decide which layer owns `BtrSigningBytes`.

## Acceptance

- Decide ownership of canonical byte nouns.
- Clarify whether `BtrSigningBytes` is a domain/application value,
  port-returned value, or adapter-owned transport value.
- Update sludge map and refactoring guide accordingly.
- This must happen before implementing BTR/provenance repair.

