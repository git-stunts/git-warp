# Extract codec/ from domain/services/

Move the 8 message codec files into `src/domain/services/codec/`.

## Files

- WarpMessageCodec.js (34, facade)
- PatchMessageCodec.js (137)
- CheckpointMessageCodec.js (140)
- AnchorMessageCodec.js (84)
- AuditMessageCodec.js (112)
- MessageCodecInternal.js (148)
- MessageSchemaDetector.js (180)
- TrailerValidation.js (74)

## Why

Tight internal cluster — only outbound dependency is one import from
KeyCodec. Clear single responsibility: wire format encoding/decoding.
WarpMessageCodec is the facade that selects the right sub-codec.

## Scope

Move files, update imports across services/ and controllers/. No
behavioral changes.

## Source

Cycle 0004 analysis.
