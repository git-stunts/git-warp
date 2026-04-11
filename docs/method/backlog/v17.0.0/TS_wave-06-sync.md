---
id: TS_wave-06-sync
blocks: []
blocked_by:
  - TS_wave-01-codec
---

# Wave 6: sync/ + medium services (10 files, 3596 LOC)

Sync protocol, HTTP server, auth, and medium-sized services.

| # | File | LOC | Notes |
|---|------|-----|-------|
| 1 | SyncTrustGate.js | 178 | Trust gate for sync |
| 2 | EffectPipeline.js | 183 | Effect routing |
| 3 | ImmutableSnapshot.js | 220 | Deep freeze + clone |
| 4 | KeyCodec.js | 207 | Prop/edge key encoding |
| 5 | SyncPayloadSchema.js | 259 | Zod schemas for sync wire format |
| 6 | TranslationCost.js | 339 | MDL translation cost |
| 7 | TemporalQuery.js | 358 | Time-travel queries |
| 8 | SyncAuthService.js | 463 | HMAC auth for sync |
| 9 | HttpSyncServer.js | 533 | HTTP server (over ceiling!) |
| 10 | SyncProtocol.js | 683 | Core sync protocol (over ceiling!) |

**SSTS focus:** P4 (SyncPayloadSchema stays at boundary), P5 (KeyCodec is encoding — port territory). SyncController.js (684 LOC) is a separate god kill (wave 7). HttpSyncServer and SyncProtocol need splitting.
