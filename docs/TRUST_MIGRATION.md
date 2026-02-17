# Trust V1 Migration Guide

## Overview

Trust V1 introduces cryptographic identity-backed writer trust. Writer trust is now derived from signed trust records containing Ed25519 key bindings, replacing the previous environment-variable-based allowlist model.

## What Changed

| Before (v1.x) | After (v2.0) |
|---|---|
| `WARP_TRUSTED_ROOT` env var | Signed trust record chain in Git refs |
| No cryptographic evidence | Ed25519 signed records |
| No revocation | Monotonic key/binding revocation |
| Trust is advisory only | `warn` and `enforce` modes |

## Migration Path

### Step 1: Bootstrap Trust Records

Create the initial trust record chain using the CLI:

```bash
# Generate an Ed25519 keypair (outside of git-warp)
openssl genpkey -algorithm ed25519 -out root.pem
openssl pkey -in root.pem -pubout -outform DER | tail -c 32 | base64 > root.pub

# The trust record chain is stored at:
# refs/warp/<graph>/trust/records
```

### Step 2: Add Keys

Trust records are appended to the chain. The first record (genesis) must be a `KEY_ADD` with `prev: null`.

Record types:
- `KEY_ADD` — register a new Ed25519 public key
- `KEY_REVOKE` — permanently revoke a key (monotonic)
- `WRITER_BIND_ADD` — bind a writer ID to an active key
- `WRITER_BIND_REVOKE` — revoke a writer binding

### Step 3: Evaluate Trust

```bash
# Check trust status (warn mode — default)
git warp trust

# Check with enforce mode
git warp trust --mode enforce

# Pin to a specific trust chain commit
git warp trust --trust-pin <sha>

# Include trust in audit verification
git warp verify-audit --trust-mode enforce
```

### Step 4: Rollout Strategy

1. **Start in warn mode** — evaluates trust but does not block operations
2. **Review output** — check `git warp trust` for any unexpected untrusted writers
3. **Switch to enforce** — once confident, use `--mode enforce`

## Pre-v2 Repositories

Repositories without trust records will show `trustVerdict: not_configured`. This is expected and does not block any operations. Trust evaluation only activates when records exist in `refs/warp/<graph>/trust/records`.

## Rollback

If enforce mode produces false denials:

```bash
# Immediate: switch to warn mode
git warp trust --mode warn

# Or: remove the --trust-mode flag from verify-audit
git warp verify-audit
```

Trust evaluation is purely advisory in warn mode. No data is modified or blocked by the trust system.

## Environment Variable Deprecation

`WARP_TRUSTED_ROOT` is deprecated. If set, `verify-audit` will emit a warning:

```text
Trust: Trust root configured but signature verification is not implemented in v1
```

Migrate to the signed trust record chain for cryptographic evidence.
