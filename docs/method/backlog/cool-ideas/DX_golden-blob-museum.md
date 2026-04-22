---
id: DX_golden-blob-museum
blocked_by: []
blocks: []
---

# Golden Blob Museum

Check in canonical patch/checkpoint/index fixtures extracted from real
repo data. Require exact round-trip compatibility: same bytes in, same
domain objects out. Proves refactors don't change wire format
accidentally.

Fixtures should cover:
- PatchV2 (schema:2) with all op types
- Checkpoint (V5 full state)
- Index shards (meta, fwd, rev, props)
- ProvenanceIndex
- BoundaryTransitionRecord

## Source

P5 codec dissolution planning (2026-04-04).
