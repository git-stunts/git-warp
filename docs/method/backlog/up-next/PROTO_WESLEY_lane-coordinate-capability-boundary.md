---
id: PROTO_WESLEY_lane-coordinate-capability-boundary
blocked_by: []
blocks: []
---

# WESLEY lane / coordinate / capability boundary

`PROTO_WESLEY_receipt-envelope-boundary` covers receipts and nearby provenance
anchors, but the shared debugger/runtime stack also depends on a second noun
family that is not yet frozen clearly enough:

- lane refs (`WORLDLINE`, `STRAND`, later `BRAID`)
- coordinates and playback positions
- capability declarations for read/control operations
- host-neutral playback and seek surfaces

Right now these nouns are visible in `warp-ttd` protocol schema and local
adapter code, but `git-warp` has not named which parts are substrate-owned
facts versus debugger policy or adapter presentation.

Work:

- freeze the minimal substrate-owned lane and coordinate anchors external
  consumers may depend on
- define which capability names belong to substrate truth and which belong to
  debugger/session policy
- align `git-warp`, `warp-ttd`, Echo, and Wesley around one stable family for
  worldline/strand coordinates before each repo invents a local variant
- keep mirrors and convenience DTOs from becoming accidental peer authorities

This is the companion hill to the receipt-envelope boundary. Receipts without
stable lane/coordinate nouns still leave the protocol stack drifting.

## Source

- `warp-ttd` protocol schema review, 2026-04-09
- Continuum contract-surface discussion
