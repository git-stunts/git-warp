---
id: TS_wave-01-codec
blocks: []
blocked_by: []
---

# Wave 1: codec/ (8 files, 933 LOC)

Boundary serialization — SSTS P4/P5 ground zero. These files own
the byte ↔ domain boundary. Converting them types the codec surface
that everything downstream depends on.

| # | File | LOC | Notes |
|---|------|-----|-------|
| 1 | WarpMessageCodec.js | 34 | Tiny barrel — quick win |
| 2 | TrailerValidation.js | 74 | Validation helpers |
| 3 | AnchorMessageCodec.js | 84 | Anchor encode/decode |
| 4 | AuditMessageCodec.js | 120 | Audit encode/decode |
| 5 | PatchMessageCodec.js | 137 | Patch encode/decode |
| 6 | CheckpointMessageCodec.js | 140 | Checkpoint encode/decode |
| 7 | MessageCodecInternal.js | 164 | Internal codec helpers |
| 8 | MessageSchemaDetector.js | 180 | Schema version detection |

**SSTS focus:** P4 (schemas at boundaries), P5 (serialization is the codec's problem). These files ARE the boundary — type them and the domain-side types tighten automatically.
