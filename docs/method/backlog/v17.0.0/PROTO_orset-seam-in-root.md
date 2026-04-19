---
id: PROTO_orset-seam-in-root
blocked_by: []
blocks:
  - PROTO_orsetlike-contract
  - INFRA_extract-warp-orset-package-post-publish
---

# Build the ORSet seam inside root

## Problem

The ORSet seam work must happen before interface extraction or trie
backing, but code cannot move out of root yet. `warp-orset` is not at a
point where shipped root code can depend on a published package
boundary.

## Fix

Build the seam inside root:

- organize `src/domain/crdt/` and nearby root paths to mirror the
  future `warp-orset` package layout
- keep the code in root for now
- make the eventual extraction a mechanical move rather than a second
  design pass

## Scope

**In:** root-local directory/layout ownership boundaries and explicit
documentation of the future `warp-orset` surface.

**Out:** actual extraction into `packages/warp-orset/` and interface
retyping.

## Why it is a prerequisite

This item owns layout. `PROTO_orsetlike-contract` owns the abstract
contract. Real extraction stays deferred until the publish path is
ready.
