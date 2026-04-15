---
id: INFRA_extract-warp-orset-package
blocked_by:
  - INFRA_npm-workspaces-scaffold
blocks:
  - PROTO_orsetlike-contract
---

# Create packages/warp-orset and move reusable ORSet primitives

## Problem

The ORSet, Dot, and VersionVector implementations live in
`src/domain/crdt/`. The Shadow-Trie ORSet engine needs its own package
boundary so trie internals do not leak into the kernel or product
packages.

## Fix

Move `src/domain/crdt/{ORSet,Dot,VersionVector}.ts` and supporting
types into `packages/warp-orset/src/`. Update all import paths in
the main package to use the workspace dependency. Verify all tests
pass with the new package boundary.

## Scope

**In:** Mechanical move of CRDT primitives. Import rewrites. Test
verification.

**Out:** LWWRegister stays in kernel space for now. No behavior changes.
No new APIs.

## Notes

- Only warp-orset is extracted early. warp-kernel and warp-adapters
  extract later, after the ORSet line proves its seams.
- LWW is explicitly excluded from the first cut.
