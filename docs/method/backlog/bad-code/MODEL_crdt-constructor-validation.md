---
id: MODEL_crdt-constructor-validation
blocked_by: []
blocks: []
---

# ORSet and LWW have no constructor validation

**Effort:** M

## What's Wrong

`ORSet` constructor accepts raw `Map`/`Set` arguments with no type or
structural checks. `LWW` constructor doesn't validate its `eventId`
parameter. Invalid state can propagate silently through CRDT merge.

`ORSet` also has `serialize()`/`deserialize()` methods living directly
on the domain type -- a P5 violation. Domain types should not know how
they are encoded.

## Suggested Fix

Add constructor validation to both `ORSet` and `LWW`: type checks,
non-null assertions, structural invariants. Move `serialize()`/
`deserialize()` to a `CrdtCodec` in `src/infrastructure/codecs/`.
