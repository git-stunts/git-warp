---
id: INFRA_git-cas-vault-encryption
blocked_by: []
blocks: []
feature: runtime-boundaries
---

# Vault-backed git-cas encryption for graph content

## Problem

`git-warp` has narrow encryption hooks around CAS-backed blob and seek-cache
storage, but they pass raw encryption keys directly. With git-cas v6,
encryption should be treated as a vault-backed operator workflow, not as loose
key plumbing scattered through adapters.

## Direction

If git-warp exposes encrypted CAS content, use git-cas vault facilities for key
lookup, rotation, privacy-mode vault metadata, and operator diagnostics. Keep
raw keys as an internal adapter detail only where a caller has already resolved
them from an approved vault/key source.

## Scope

- Decide which surfaces may be encrypted: content attachments, seek cache,
  trust records, checkpoint payloads, or all CAS-backed payloads.
- Define an operator-facing configuration shape for vault-backed encryption.
- Use git-cas v6 current schemes only: `whole`, `framed`, or `convergent`.
- Surface `LEGACY_SCHEME` with migration guidance when old encrypted CAS
  manifests are encountered.
- Stand on the current git-cas adapter surface; the old v17
  `INFRA_git-cas-adapter-parity` successor is complete and archived.
- Update `GUIDE.md` or `ADVANCED_GUIDE.md` in the same slice that introduces
  the feature. The docs must explain vault setup, recovery, rotation, and the
  confidentiality/deduplication tradeoff of convergent encryption.

## Acceptance Criteria

- No public git-warp API asks ordinary users to juggle anonymous raw
  encryption keys for CAS content.
- Vault-backed flows have tests for wrong passphrases, missing vault metadata,
  rotation, and legacy scheme errors.
- Documentation ships with the feature, not afterward.
