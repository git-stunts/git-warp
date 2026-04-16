---
id: PROTO_orset-seam-in-root
blocked_by: []
blocks:
  - PROTO_orsetlike-contract
---

# Build the ORSet seam inside root (no code moves out of root)

## Problem

The ORSet seam work — file layout, ownership boundary, directory
organization — must happen before interface extraction or any trie
work. But the code cannot move out of root yet: warp-orset is
`private: true` (per cycle 0019), so imports from
`@git-stunts/warp-orset` in shipped root code would break consumers.

Cycle 0020 attempted to move the code into warp-orset and was closed
as `not-met` when the publish-surface problem surfaced.

## Fix

Build the seam inside root. Organize `src/domain/crdt/` (and related
soon-to-be-orset code) so the directory layout mimics the future
warp-orset structure, but keep everything inside root.

**Explicit constraints:**

- Code remains under root `src/domain/crdt/` and nearby root domain
  paths.
- Directory layout should mimic future warp-orset (the eventual
  extraction should be a mechanical move).
- NO bare `@git-stunts/warp-orset` imports from root code.
- NO relative imports into `packages/warp-orset/` from shipped root
  code.
- NO code moves out of root yet.

## Scope

**In:**
- Directory layout inside `src/domain/crdt/` (or a new root subdir)
  that mirrors the intended warp-orset package structure.
- Any reorganization of file ownership boundaries that clarifies
  which code will eventually live in warp-orset.
- Documentation of the intended warp-orset surface.

**Out:**
- Interface extraction (`PROTO_orsetlike-contract`).
- Any actual code move into `packages/warp-orset/`.
- Any import path changes that use workspace package names.

## Notes

- This is the clean prerequisite for `PROTO_orsetlike-contract`
  (interface extraction + consumer retyping). Sharp separation:
  this item owns *layout*; the contract item owns *interface*.
- The actual extraction is deferred to
  `INFRA_extract-warp-orset-package-post-publish`, which is blocked
  by the multi-package publish pipeline.
