---
id: BND_trailer-codec-type-poison
blocked_by: []
blocks: []
feature: tooling-release
release_home: v17.0.0
---

# @git-stunts/trailer-codec type poison at the boundary

**Effort:** M

## Problem

`MessageCodecInternal.js` `getCodec()` returns an untyped
`TrailerCodec` from `@git-stunts/trailer-codec` (no `.d.ts`). Every
consumer must cast through `unknown` intermediary. Six files carry
this workaround: `AnchorMessageCodec`, `AuditMessageCodec`,
`CheckpointMessageCodec`, `PatchMessageCodec`, `SyncPayloadSchema`,
and any future codec consumer.

## Fix

Add `trailer-codec/index.d.ts` upstream so the return type flows
naturally. This is the same root cause as
`DX_trailer-codec-dts.md` in asap/ — fixing that fixes this.
