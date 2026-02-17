# Trust V1 Operator Runbook

## Quick Reference

| Operation | Command |
|---|---|
| Check trust status | `git warp trust` |
| Enforce trust | `git warp trust --mode enforce` |
| Pin to commit | `git warp trust --trust-pin <sha>` |
| Verify with trust | `git warp verify-audit --trust-mode enforce` |

## Bootstrap: First-Time Setup

### 1. Generate Root Key

```bash
# Generate Ed25519 keypair
openssl genpkey -algorithm ed25519 -out root-key.pem
openssl pkey -in root-key.pem -pubout -outform DER | tail -c 32 | base64
# Output: base64-encoded 32-byte public key
```

### 2. Compute Key Fingerprint

The key fingerprint is `ed25519:` + SHA-256 hex of the raw 32-byte public key. This is the `keyId` used in trust records.

### 3. Create Genesis Record

The first trust record must be:
- `recordType: KEY_ADD`
- `prev: null`
- `subject.keyId` matches fingerprint of `subject.publicKey`
- `issuerKeyId` matches the same fingerprint (self-signed genesis)

### 4. Append Records

Records form an append-only chain. Each record's `prev` field points to the previous record's `recordId`. Records are stored as Git commits under `refs/warp/<graph>/trust/records`.

> **Note:** The append path validates record schema, recordId integrity, prev-link consistency, and signature envelope structure (presence of `alg` + `sig` fields). It does **not** perform cryptographic Ed25519 signature verification at append time — full crypto verification occurs during trust state evaluation (`buildState`).

## Verify: Check Trust State

```bash
# Default: warn mode, live ref
git warp trust

# Enforce mode
git warp trust --mode enforce

# Pin to specific chain commit (for reproducibility)
git warp trust --trust-pin abc123def456...
```

### Output Fields

| Field | Meaning |
|---|---|
| `trustVerdict` | `pass`, `fail`, or `not_configured` |
| `mode` | Always `signed_evidence_v1` |
| `trust.status` | `configured`, `pinned`, `error`, `not_configured` |
| `trust.source` | `ref`, `cli_pin`, `env_pin`, `none` |
| `trust.explanations[]` | Per-writer trust assessment with reason codes |

### Reason Codes

| Code | Meaning |
|---|---|
| `WRITER_BOUND_TO_ACTIVE_KEY` | Writer has active binding to active key (trusted) |
| `WRITER_HAS_NO_ACTIVE_BINDING` | Writer has no bindings at all |
| `WRITER_BOUND_KEY_REVOKED` | Writer's key has been revoked |
| `BINDING_REVOKED` | Writer's binding has been explicitly revoked |
| `KEY_UNKNOWN` | Binding references unknown key |

## Rotate: Key Rotation

1. **Add new key**: `KEY_ADD` record with new keypair
2. **Bind writers to new key**: `WRITER_BIND_ADD` for each writer
3. **Revoke old bindings**: `WRITER_BIND_REVOKE` for old key bindings
4. **Revoke old key**: `KEY_REVOKE` with reason `KEY_ROLLOVER`

Key revocation is **monotonic** — a revoked key cannot be re-added.

## Revoke: Emergency Key Revocation

For compromised keys:

1. **Revoke the key immediately**: `KEY_REVOKE` with reason `KEY_COMPROMISE`
2. **Revoke all bindings**: `WRITER_BIND_REVOKE` for every binding to the compromised key
3. **Issue new key**: `KEY_ADD` with fresh keypair
4. **Re-bind writers**: `WRITER_BIND_ADD` to the new key

## Incident Response

### False Deny in Enforce Mode

**Symptom:** `trustVerdict: fail` for a writer you expect to be trusted.

**Steps:**
1. Switch to warn mode: `git warp trust --mode warn`
2. Check explanations: `git warp trust --json | jq '.trust.explanations'`
3. Verify the writer has an active binding to an active key
4. If binding is missing, create a `WRITER_BIND_ADD` record

### Trust Ref Corruption

**Symptom:** Trust evaluation errors or missing records.

**Steps:**
1. Check ref exists: `git show-ref refs/warp/<graph>/trust/records`
2. Walk chain manually: `git log --format=oneline <ref>`
3. If corrupted, restore from a known-good backup or re-bootstrap

### Rollback to Pre-Trust

Trust evaluation is opt-in. To completely disable:
- Do not pass `--mode` or `--trust-mode` flags
- Remove `WARP_TRUST_PIN` env var
- Without trust records, verdict is `not_configured` (no enforcement)

## Monitoring

### Key Metrics

- Number of active keys (`evidenceSummary.activeKeys`)
- Number of revoked keys (`evidenceSummary.revokedKeys`)
- Number of active bindings (`evidenceSummary.activeBindings`)
- Trust verdict distribution across evaluations

### Alerts

- `trustVerdict: fail` in enforce mode → immediate investigation
- `activeKeys: 0` → all keys revoked, no writer can be trusted
- `errors` in trust state → chain corruption or invalid records
