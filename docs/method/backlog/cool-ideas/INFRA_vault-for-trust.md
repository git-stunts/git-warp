---
id: INFRA_vault-for-trust
blocks: []
blocked_by: []
---

# Use @git-stunts/vault for trust record storage (optional)

## Idea

Trust records are an append-only chain of Git commits under
`refs/warp/<graph>/trust/records`. These commits contain signed
key/binding records that establish writer identity.

Vault provides:
- **GC protection** — trust commits won't be pruned by `git gc`
- **Optional encryption** — protect key material at rest
- **Key rotation** — rotate vault encryption without re-signing records
- **Audit trail** — vault commits track when entries were added/removed

## Considerations

- Trust records are already GC-safe (they're reachable via the ref)
- Encryption adds complexity to the verification pipeline
- Vault's CAS-conflict retry may interact with trust chain CAS
- Could store the entire trust chain as a single vault entry (tree OID)
  or individual records as separate entries

## When to explore

After `INFRA_unify-persistence-on-git-cas` ships — vault is built on
git-cas, so unifying persistence first makes vault integration cleaner.
