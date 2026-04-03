# Extract sync/ from domain/services/

Move the 5 sync protocol files into `src/domain/services/sync/`.

## Files

- SyncProtocol.js (694)
- SyncAuthService.js (455)
- SyncPayloadSchema.js (265)
- SyncTrustGate.js (178)
- HttpSyncServer.js (533)

Note: SyncController.js (680) stays in controllers/.

## Why

Clear network-boundary cluster. Self-contained protocol with auth,
schema validation, and trust gating. Only outbound deps are shared
kernel (JoinReducer, WarpMessageCodec, Frontier).

## Scope

Move files, update imports. No behavioral changes.

## Source

Cycle 0004 analysis.
