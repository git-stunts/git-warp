---
id: DX_observer-first-guide
feature: observer-admission-runtime
blocked_by:
  - HYGIENE_warp-doctrine-runtime-alignment
  - PROTO_observer-plan-reading-envelopes
blocks: []
---

# Guide: Observer-First Client Pattern

**Effort:** M

## Problem

The GUIDE and ADVANCED_GUIDE don't strongly enough convey that the primary client interaction model is through Observer APIs. Clients should be reading state through Observers (projections over worldlines through apertures) and letting git-warp manage the underlying graph topology, materialization, and CRDT mechanics.

The current docs teach low-level graph manipulation (createPatch, addNode, etc.) with equal weight to the Observer read path, which gives the impression that clients should be directly managing graph state. In practice, most consumers should:

1. Write through `Writer` / `PatchBuilderV2` (thin, scoped mutations)
2. Read through `Observer` (projected, filtered, cached views)
3. Let git-warp handle materialization, conflict resolution, and indexing

## Notes

- Review `docs/GUIDE.md` and `docs/ADVANCED_GUIDE.md` for teaching order
- The Observer API (apertures, worldlines, seek, strand-scoped reads) should be the primary "how to read data" section
- Direct `getNodes()` / `getNodeProps()` / `query()` are escape hatches, not the default path
- This aligns with Paper IV's observer geometry: observers are the projection layer, not an optional feature

### Redaction and encryption guidance

The guide should clearly explain the security model for sensitive data:

- Aperture `redact` is **application-layer filtering** — useful for multi-tenant query isolation, but not a cryptographic boundary. Anyone with filesystem access to `.git/objects/` can read raw patch blobs.
- For actual data protection, enable **graph encryption at rest** via `patchBlobStorage` with an encryption key (B164). This encrypts patch CBOR with AES-256-GCM before writing to Git objects.
- The guide should teach: redact for convenience, encrypt for security. Show how to configure `CasBlobAdapter` with an encryption key and wire it through `WarpGraph.open({ patchBlobStorage })`.
- Also explain that `@git-stunts/vault` manages encryption keys via OS-native keychains — no `.env` files for secrets.
