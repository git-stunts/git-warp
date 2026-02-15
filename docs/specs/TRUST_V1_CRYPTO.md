# Trust V1 Crypto Spec

> **Status:** Accepted
> **Version:** 1.0.0
> **Last Updated:** 2026-02-15
> **Paper References:** Paper III Section 4 (BTRs), Paper IV Section 3 (observer geometry)

---

## 1. Purpose

Trust V1 defines cryptographic, identity-backed trust for git-warp. Trust decisions are derived from signed evidence records + explicit policy + deterministic evaluation.

There is no unsigned trust mode in V1.

---

## 2. Scope

**In scope:**

- Signed trust records (append-only log)
- Key lifecycle (add / revoke)
- Writer-to-key binding lifecycle (add / revoke)
- Deterministic trust evaluation
- Machine-readable reason codes
- Strict boundary purity (no env reads in domain)

**Out of scope (future):**

- Delegation chains
- Threshold / quorum signatures
- Cross-repo federation
- External transparency anchoring requirements

---

## 3. Normative Terms

The key words MUST, MUST NOT, SHOULD, MAY are interpreted as RFC 2119 terms.

---

## 4. Security Invariants

1. A writer is trusted only if bound to at least one active, non-revoked key.
2. Every trust-affecting record MUST be signature-valid.
3. Revocations MUST be monotonic in evaluated history.
4. Invalid pin / signature / schema / chain MUST fail closed.
5. Domain trust logic MUST NOT read `process.env` or other ambient runtime state.

---

## 5. Refs and Storage

Authoritative trust record ref:

```text
refs/warp/<graph>/trust/records
```

Each Git commit in the trust record chain contains a tree with one blob per record batch (or a single `records.json` blob containing an ordered array). The chain is linear — each commit has exactly one parent (except genesis, which has none).

Policy may be provided by CLI/app config or repo config; policy is not a replacement for evidence.

---

## 6. Canonicalization and Crypto

### 6.1 Canonical JSON

Canonical JSON MUST:

- Sort object keys lexicographically at all levels
- Preserve array order
- Use UTF-8 encoding
- Contain no insignificant whitespace

Implementation: reuse existing `canonicalStringify()` from `src/domain/utils/canonicalStringify.js`.

### 6.2 Record ID

```text
recordId = sha256_hex("git-warp:trust-record:v1\0" + canonical_json(record_without_recordId_and_signature))
```

### 6.3 Signature Payload

Signature input bytes:

```text
"git-warp:trust-sign:v1\0" + canonical_json(record_without_signature)
```

V1 algorithm:

- `ed25519` only

---

## 7. Key Identifier Format

```text
keyId = "ed25519:" + sha256_hex(raw_public_key_bytes)
```

The declared `keyId` in a `KEY_ADD` record MUST match the computed fingerprint from the `publicKey` bytes. Mismatch MUST fail validation.

---

## 8. Trust Record Schema (V1)

```json
{
  "schemaVersion": 1,
  "recordType": "KEY_ADD | KEY_REVOKE | WRITER_BIND_ADD | WRITER_BIND_REVOKE",
  "recordId": "hex-64",
  "issuerKeyId": "ed25519:hex-64",
  "issuedAt": "ISO-8601 UTC",
  "prev": "hex-64 | null",
  "subject": {},
  "meta": {},
  "signature": {
    "alg": "ed25519",
    "sig": "base64"
  }
}
```

**Required fields:** `schemaVersion`, `recordType`, `recordId`, `issuerKeyId`, `issuedAt`, `prev`, `subject`, `signature.alg`, `signature.sig`.

`meta` is optional and non-authoritative.

---

## 9. Record Types

### 9.1 `KEY_ADD`

Subject:

```json
{
  "keyId": "ed25519:hex-64",
  "publicKey": "base64"
}
```

Rules:

- `keyId` MUST match `fingerprint(publicKey)`
- Key becomes active from this record forward

### 9.2 `KEY_REVOKE`

Subject:

```json
{
  "keyId": "ed25519:hex-64",
  "reasonCode": "KEY_COMPROMISE | KEY_ROLLOVER | OPERATOR_REQUEST"
}
```

Rules:

- Key becomes revoked from this record forward
- Revocation is monotonic — a revoked key cannot become active again without a new `KEY_ADD` for a different key

### 9.3 `WRITER_BIND_ADD`

Subject:

```json
{
  "writerId": "string",
  "keyId": "ed25519:hex-64"
}
```

Rules:

- `keyId` SHOULD be active at binding time; if not, evaluator treats inactive key as not trusted
- Writer is trusted only when at least one active binding references an active key

### 9.4 `WRITER_BIND_REVOKE`

Subject:

```json
{
  "writerId": "string",
  "keyId": "ed25519:hex-64",
  "reasonCode": "ACCESS_REMOVED | ROTATION | KEY_REVOKED"
}
```

Rules:

- Binding becomes inactive from this record forward

---

## 10. Policy (V1)

Policy schema:

```json
{
  "schemaVersion": 1,
  "mode": "warn | enforce",
  "writerPolicy": "all_writers_must_be_trusted"
}
```

V1 supports only one writer policy: `all_writers_must_be_trusted`.

No `any` policy in V1. Trust V1 is always evidence-based.

---

## 11. Pin Precedence

Pin resolution MUST happen at CLI/app boundary:

1. `--trust-ref-tip <sha>` (CLI pin — highest priority)
2. `WARP_TRUSTED_ROOT` environment variable (env pin)
3. Live ref tip at `refs/warp/<graph>/trust/records`

Domain receives resolved values (`trustRefTip`, `pinSource`) and MUST NOT read env.

---

## 12. Evaluation Algorithm

**Input:**

- `writerIds` from audit scope
- Trust records (pinned or live)
- Policy

**Algorithm:**

1. Validate schemas and signatures for all records in scope.
2. Build effective state:
   - `activeKeys` / `revokedKeys`
   - `activeBindings` / `revokedBindings`
3. For each `writerId` (sorted):
   - Trusted if writer has >= 1 active binding to an active key
4. Emit deterministic assessment arrays and explanations.
5. Derive trust status + verdict.

---

## 13. Trust Status and Verdict

**Trust status enum:**

- `not_configured`
- `configured`
- `pinned`
- `error`

**Trust verdict enum:**

- `pass`
- `fail`
- `not_configured`

**Mapping:**

- `status = not_configured` → `not_configured`
- `status = error` → `fail`
- `untrustedWriters.length > 0` → `fail`
- Otherwise → `pass`

Note: V1 has no `degraded` verdict. Untrusted writers are a hard failure in `enforce` mode.

---

## 14. Output Contract (V1)

```json
{
  "trustSchemaVersion": 1,
  "mode": "signed_evidence_v1",
  "trustVerdict": "pass | fail | not_configured",
  "trust": {
    "status": "configured | pinned | error | not_configured",
    "source": "ref | cli_pin | env_pin | none",
    "sourceDetail": "string | null",
    "evaluatedWriters": [],
    "untrustedWriters": [],
    "explanations": [
      {
        "writerId": "string",
        "trusted": true,
        "reasonCode": "WRITER_BOUND_TO_ACTIVE_KEY",
        "reason": "human-readable string"
      }
    ],
    "evidenceSummary": {
      "recordsScanned": 0,
      "activeKeys": 0,
      "revokedKeys": 0,
      "activeBindings": 0,
      "revokedBindings": 0
    }
  }
}
```

`reasonCode` is REQUIRED and MUST be a stable enum value from the reason code registry.

---

## 15. Reason Code Registry (V1)

### Positive

| Code | Meaning |
|---|---|
| `WRITER_BOUND_TO_ACTIVE_KEY` | Writer has at least one active binding to an active key |

### Negative

| Code | Meaning |
|---|---|
| `WRITER_HAS_NO_ACTIVE_BINDING` | Writer has no active bindings |
| `WRITER_BOUND_KEY_REVOKED` | Writer's binding references a revoked key |
| `BINDING_REVOKED` | Writer's binding has been explicitly revoked |
| `KEY_UNKNOWN` | Binding references a keyId not found in record log |

### System

| Code | Meaning |
|---|---|
| `TRUST_REF_MISSING` | Trust record ref does not exist |
| `TRUST_PIN_INVALID` | Pinned commit does not exist or is invalid |
| `TRUST_RECORD_SCHEMA_INVALID` | Record fails schema validation |
| `TRUST_SIGNATURE_INVALID` | Record signature verification failed |
| `TRUST_RECORD_CHAIN_INVALID` | Record chain linking is broken |
| `TRUST_POLICY_INVALID` | Policy value is unknown or unsupported |

---

## 16. Failure Semantics

**In enforce mode:**

- Any trust validation error MUST fail the command
- Invalid pin MUST fail (no fallback to live ref)
- Untrusted writers MUST fail

**In warn mode:**

- Evaluator returns same trust object/verdict
- Caller may choose non-zero exit policy based on verdict

---

## 17. Determinism Requirements

The following MUST be deterministic:

- Canonical serialization
- `recordId` computation
- Evaluation ordering (writers sorted, explanations sorted)
- Output array ordering
- Verdict mapping

Equivalent input state MUST produce byte-identical JSON output in `--json` mode (excluding explicit timestamps if present).

---

## 18. Required Test Matrix

No merge without all 10 test classes passing:

1. **Canonicalization determinism** — permuted key order → identical canonical bytes
2. **RecordId determinism** — same unsigned payload → identical SHA-256 hex
3. **Signature verify pass/fail** — known-good fixture + tamper detection
4. **Tamper detection** — mutated payload/signature/issuerKeyId
5. **Key revocation semantics** — revoked key cannot validate future bindings
6. **Binding revocation semantics** — revoked binding removes trust for writer
7. **Writer evaluation determinism** — shuffled input → sorted output with reason codes
8. **Pin precedence** — CLI > env > default
9. **Domain purity** — no `process.env` in `src/domain/`
10. **Output contract snapshot** — full schema validation on JSON output including `reasonCode`

---

## 19. Migration from Allowlist Model

The previous trust model (v11.1.0 `trust` branch) used an unsigned declarative allowlist (`trust.json` with `trustedWriters[]`). Trust V1 replaces this entirely:

| Allowlist Model | Trust V1 |
|---|---|
| Writer IDs are self-declared strings | Writer IDs bound to Ed25519 keys via signed records |
| `trust.json` with `trustedWriters[]` | Append-only signed record log |
| No signatures | Every record signed |
| No revocation semantics | Monotonic key + binding revocation |
| `policy: "any"` allows all writers | No `any` policy — evidence required |
| `degraded` verdict for untrusted writers | `fail` verdict — untrusted is a hard failure |

Operators migrating from the allowlist model must:

1. Generate Ed25519 keypairs for trusted issuers
2. Append `KEY_ADD` records for each key
3. Append `WRITER_BIND_ADD` records for each writer-key pair
4. Remove old `refs/warp/<graph>/trust/root` ref (legacy allowlist)

---

## 20. Threat Model

### What Trust V1 Protects Against

1. **Writer impersonation detection** — writers must be bound to cryptographic keys; self-declared IDs without key binding are rejected
2. **Trust config tampering** — every trust record is signed; modified records fail signature verification
3. **Rollback attacks** — monotonic revocation prevents silently un-revoking keys or bindings
4. **Policy enforcement in CI** — `--trust-required` + `enforce` mode gates on signed evidence

### What Trust V1 Does NOT Protect Against

1. **Key compromise** — if an attacker obtains a private key, they can issue valid records. Revoke compromised keys immediately.
2. **Trust ref replacement** — an adversary with ref-write access can replace the entire trust chain. Use external anchoring for stronger guarantees.
3. **Time-of-check / time-of-use** — trust state is evaluated at verification time. Pinning mitigates this.
