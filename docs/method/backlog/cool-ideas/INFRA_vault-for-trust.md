---
id: INFRA_vault-for-trust
blocks: []
blocked_by: []
---

# Use @git-stunts/vault for trust signing keys

## Idea

`@git-stunts/vault` stores secrets in OS-native keychains (macOS
Keychain, Linux Secret Service, Windows Credential Manager). Trust
records require Ed25519 signing keys for record creation and
verification.

Currently the trust pipeline receives signing keys as raw parameters.
Vault could be the canonical provisioning path:

```typescript
const vault = new Vault({ account: 'git-warp' });
const signingKey = vault.getSecret({ target: `trust/${graphName}/signing-key` });
```

## Benefits

- Signing keys never touch disk as plaintext
- Multi-runtime (Node/Bun/Deno) via vault's adapter pattern
- `resolveSecret({ envKey, vaultTarget })` supports CI (env var)
  and local dev (keychain) with one call
- `ensureSecret()` can prompt for key provisioning on first use

## Scope

- Wire vault into `appendRecord` / `appendRecordWithRetry` as the
  default key source
- CLI `git warp trust` commands use vault for key lookup
- Optional: `git warp trust init` stores generated keypair in vault
