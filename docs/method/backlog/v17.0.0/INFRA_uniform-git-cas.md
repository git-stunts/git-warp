---
id: INFRA_uniform-git-cas
blocked_by: []
blocks: []
feature: runtime-boundaries
---

# Uniform git-cas for all CAS operations

## Decision

All blob-backed storage goes through `@git-stunts/git-cas`. Not just
large objects. Patches, checkpoints, indexes, trust records, seek
cache, and related content all use one storage path.

## Why

- One path instead of hybrid logic and threshold drift
- Uniform encryption and integrity semantics
- Structural deduplication everywhere
- No split-brain between "legacy blob path" and "real CAS path" for
  new writes

## Scope

### Cache-only data

- migrate checkpoints to CAS
- migrate indexes and seek cache to CAS
- let rebuilt refs repopulate through CAS-only paths

### Durable data

- trailer versioning routes old patch blobs vs new CAS-backed patches
- new patch writes store manifests/trees in CAS
- old immutable commits still read through legacy raw-blob fallback

### Adapter law

- raw blob plumbing remains only as a legacy fallback surface
- new code should not route directly through blob writes when a CAS
  route exists

## Why it is in v17

This is not a speculative cleanup anymore. Uniform CAS routing is part
of the ship boundary for v17's substrate story and blocks large-repo
capture/read paths from teaching older storage assumptions.
