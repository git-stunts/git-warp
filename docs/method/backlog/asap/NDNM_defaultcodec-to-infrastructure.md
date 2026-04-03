# Move defaultCodec.js to infrastructure

**Effort:** S

## Problem

`src/domain/utils/defaultCodec.js` imports `cbor-x` directly — a
concrete codec dependency inside `src/domain/`. This is a P5 violation:
"Serialization Is the Codec's Problem." The domain layer should speak
only through the CodecPort.

## Fix

Move `defaultCodec.js` to `src/infrastructure/codecs/DefaultCodecAdapter.js`.
Update all domain imports. The domain's fallback becomes a lazy import
of the infrastructure adapter (same pattern as `CasBlobAdapter`).

Flagged in the Systems-Style audit (PR #75 session).
