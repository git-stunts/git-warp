---
id: MODEL_wormhole-edge-typedef
blocked_by: []
blocks: []
feature: merge-strands-worldlines
release_home: v20.0.0+
---

# WormholeEdge is a typedef with external serialize behavior

**Effort:** S

## What's wrong

`WormholeEdge` in `WormholeService.js` is a typedef-only type with 5 fields. Behavior is attached externally via `serializeWormhole`, `deserializeWormhole`, and `replayWormhole` functions (P3 violation -- behavior belongs on the type that owns it). Also imports `defaultCodec` (P5 violation).

## Suggested fix

- Promote `WormholeEdge` to a class with behavior methods (P3).
- Move serialization/deserialization to an infrastructure codec adapter (P5).
- Inject codec dependency rather than importing `defaultCodec`.
