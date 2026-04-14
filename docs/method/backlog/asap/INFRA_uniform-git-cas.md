# Uniform git-cas for ALL CAS operations

Supersedes: INFRA_git-cas-migration-completion.md

## Decision

ALL blob storage goes through @git-stunts/git-cas. Not just large
objects. Patches, checkpoints, indexes, trust records, content —
everything. No hybrid paths. One code path.

## Why

1. **One path** — no hybrid logic, no "which API?" friction, halved
   test surface
2. **No threshold drift** — 500KB today, 15MB tomorrow. No migration
   cliff.
3. **Uniform encryption** — AES-256-GCM everywhere. No plaintext gaps.
4. **Deterministic integrity** — refs/cas/vault protects from git gc.
5. **Structural deduplication** — CDC finds shared chunks even across
   small objects.

"We aren't using git-cas because the files are big; we are using it
because we want a verifiable, encrypted, and deduplicated data layer
that behaves the same way every time, regardless of file size."

## Versioned commit trailers

Commit trailers MUST carry a version field so the reader knows which
storage path to use:

- **v17+ trailers**: `patchOid` is a CAS tree OID, version field present
- **Pre-v17 trailers**: `patchOid` is a raw blob OID (no version or
  old version). Reader falls back to raw `blobPort.readBlob()`.

This avoids migrating immutable commits. Old data reads through old
path. New data reads through CAS. The trailer version is the router.

## Scope

### Cache-only data (checkpoints, indexes, seek cache)

1. Nuke old refs (migration script in scripts/migrations/v17.0.0/)
2. Rewrite CborCheckpointStoreAdapter + CborIndexStoreAdapter to use CAS
3. Next open() rebuilds through CAS automatically

### Durable data (patches)

1. Add trailer version field to patch commit messages
2. CborPatchJournalAdapter.writePatch() → cas.store() + cas.createTree()
3. CborPatchJournalAdapter.readPatch() → check trailer version:
   - v17+: cas.readManifest() + cas.restore()
   - pre-v17: blobPort.readBlob() (legacy fallback)

### GitGraphAdapter

4. readBlob() stays as raw plumbing — it's the legacy fallback
5. writeBlob() stays as raw plumbing — only used by legacy path
6. New code never calls blobPort directly — always goes through CAS

## Priority

ASAP — blocks Think capture on 317MB repo (checkpoint loading exceeds
plumbing's 10MB buffer limit).
