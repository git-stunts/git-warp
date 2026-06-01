---
id: HEX_domain-message-codec-wrapper-imports-infrastructure
blocked_by: []
blocks: []
feature: runtime-boundaries
release_home: v17.0.0
---

# Domain message codec wrappers re-export infrastructure adapter code

**Effort:** M

## Problem

The domain codec wrapper files:

- `src/domain/services/codec/AnchorMessageCodec.ts`
- `src/domain/services/codec/CheckpointMessageCodec.ts`
- `src/domain/services/codec/PatchMessageCodec.ts`
- `src/domain/services/codec/WarpMessageCodec.ts`

statically re-export functions from
`src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts`.

That is a direct core-to-infrastructure import-law leak. The wrappers
look like domain API surface, but their implementation owner is still
an adapter module.

## Suggested Fix

- Move commit-message codec ownership behind a truthful port or domain
  service boundary.
- Stop static re-export of adapter functions from `src/domain/**`.
- Let runtime wiring provide the default codec implementation instead of
  hardwiring the adapter at the domain surface.
