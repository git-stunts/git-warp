# CBOR codec skips key sorting for class instances

**Effort:** M

## Problem

Both `CborCodec.js` and `defaultCodec.js` only sort keys for plain
objects (`constructor === Object`). Class instances pass through
unsorted, meaning their CBOR output depends on field declaration
order. This forces all domain classes to declare fields in
alphabetical order — coupling class design to serialization.

Echo's canonical CBOR encoder (Rust) sorts ALL map keys by encoded
byte representation at encode time, making source property order
irrelevant. git-warp's codec should do the same.

## Fix

Update `isPlainObject`/`sortObjectKeys` in both codecs to sort keys
for all object types except built-in CBOR-native types (Uint8Array,
Date, Set, Map, RegExp). This is a wire format change — existing
CBOR data was encoded with unsorted class instance keys. Requires
schema version bump or migration path for persisted data.

## Why not now

Changing the codec changes the wire format for all CBOR-encoded data
(patches, checkpoints, BTRs). Existing HMAC-verified data and
content-addressed SHAs depend on byte-identical encoding. A codec
change requires a schema migration (version 4 → 5 or similar).
