# Audit Receipt Specification

> **Spec Version:** 1 (draft)
> **Status:** Draft
> **Paper References:** Paper II Section 5 (tick receipts), Paper III Sections 4-5 (BTRs, provenance payloads)

---

## 1. Introduction

This document specifies the **audit receipt** — a persistent, chained, tamper-evident record proving what happened when a WARP graph patch was materialized. Each receipt covers exactly one data commit and is stored as an immutable Git commit.

The audit receipt chain extends the ephemeral `TickReceipt` (which captures per-operation outcomes in memory) into a durable Git-native audit trail. By chaining receipts via content-addressed commit parents, any mutation to a receipt invalidates all successors.

### Scope

This spec defines:

- Receipt schema and field constraints
- Canonical serialization (JSON, CBOR, trailers)
- Git object structure and ref layout
- Chain rules and verification algorithm
- Trust model and version compatibility
- Normative test vectors

This spec does NOT define implementation details (feature flags, callbacks, performance budgets). Those belong to M3.T1.SHADOW-LEDGER.

---

## 2. Terminology

| Term | Definition |
|---|---|
| **Data commit** | A Git commit containing a CBOR-encoded WARP patch (the "real" data). |
| **Audit commit** | A Git commit containing a `receipt.cbor` blob that records the outcome of materializing a data commit. |
| **Receipt** | The logical record stored in an audit commit. Nine required fields. |
| **Chain** | An ordered sequence of audit commits for a single (graphName, writerId) pair, linked via `prevAuditCommit`. |
| **Genesis** | The first receipt in a chain. Its `prevAuditCommit` is the zero-hash sentinel. |
| **opsDigest** | Domain-separated SHA-256 hash of the canonical JSON encoding of the operations array. |
| **receiptDigest** | SHA-256 hash of the canonical CBOR encoding of the receipt. Derived, not stored as a field. |
| **Retention anchor** | A previously observed tip hash, signed checkpoint, or external witness used to detect full history replacement. |
| **OID** | Object Identifier — a Git commit SHA (40 hex chars for SHA-1, 64 hex chars for SHA-256). |

---

## 3. Receipt Schema

Every receipt contains exactly 9 fields. No optional fields. No nulls.

| Field | Type | Constraints |
|---|---|---|
| `version` | uint | Must be `1` |
| `graphName` | string | Non-empty; must not contain `..`, `;`, spaces, or `\0` |
| `writerId` | string | `[A-Za-z0-9._-]{1,64}` |
| `dataCommit` | hex string | `oidLen` chars (40 or 64), lowercase |
| `tickStart` | uint | >= 1; must equal `tickEnd` in version 1 |
| `tickEnd` | uint | >= `tickStart`; must equal `tickStart` in version 1 |
| `opsDigest` | hex string | 64 chars (always SHA-256), lowercase |
| `prevAuditCommit` | hex string | `oidLen` chars (40 or 64), lowercase; zero-hash for genesis |
| `timestamp` | uint | Milliseconds since Unix epoch (UTC), `Number.isSafeInteger()` (see Section 5.1) |

### OID Length Rules

All OIDs within a single chain MUST use the same algorithm:

- **SHA-1**: 40 hex characters
- **SHA-256**: 64 hex characters

`dataCommit`, `prevAuditCommit`, and Git commit parents MUST all use the same OID length within a chain. The genesis sentinel is `"0" * oidLen` where `oidLen` is 40 or 64. Verifiers MUST reject length mismatches.

### Version 1 Constraints

In version 1, each receipt covers exactly one data commit: `tickStart == tickEnd`. The range fields exist for forward-compatibility with future block receipts that may cover multiple ticks.

---

## 4. Ref Layout

```
refs/warp/<graphName>/audit/<writerId>
```

Points to the latest audit commit for the given writer. Updated via compare-and-swap (CAS), mirroring the pattern used by `refs/warp/<graphName>/writers/<writerId>`.

Example:
```
refs/warp/events/audit/alice -> a1b2c3d4...
```

---

## 5. Canonical Serialization Rules

### 5.1 Timestamp Format (normative)

- Type: unsigned integer (milliseconds since Unix epoch, 1970-01-01T00:00:00Z)
- Must satisfy `Number.isSafeInteger(timestamp)` and `timestamp >= 0`
- Stored as a CBOR number (integer for values ≤ 2^32-1; IEEE 754 float64 for larger values — both are deterministic)
- Human-readable display (ISO 8601 formatting) is a verifier/CLI concern, not stored in the receipt

Examples:
```
1768435200000   ✓  valid (2026-01-15T00:00:00.000Z)
0               ✓  valid (epoch)
-1              ✗  negative
1.5             ✗  not integer
2^53            ✗  exceeds Number.MAX_SAFE_INTEGER
```

### 5.2 Canonical JSON (normative)

The canonical JSON algorithm used for opsDigest computation. This algorithm is code-independent — any conforming implementation MUST produce identical bytes.

Rules:
- **Encoding:** UTF-8
- **Object keys:** Sorted lexicographically by Unicode code point at every nesting level
- **Array order:** Preserved (not sorted)
- **Whitespace:** None between tokens
- **Trailing commas:** None
- **Numbers:** Standard JSON number representation (no NaN, Infinity, -Infinity; integers as integers, no unnecessary decimals)
- **Strings:** Standard JSON string escaping:
  - Control characters (U+0000 through U+001F): `\u00XX`
  - Quotation mark: `\"`
  - Reverse solidus: `\\`
  - Standard short escapes: `\n`, `\r`, `\t`, `\b`, `\f`
  - The null byte (U+0000): `\u0000`
- **`undefined` values:** Omitted (standard JSON behavior). The `reason` field in an op outcome is absent when not present, not `null`.

### 5.3 opsDigest Computation (normative)

```
input       = receipt.ops array (Array<OpOutcome>)
canonical   = JSON.stringify(input, sortedKeyReplacer)   // no whitespace
prefixed    = UTF8("git-warp:opsDigest:v1\0") + UTF8(canonical)
opsDigest   = lowercase_hex(SHA256(prefixed))
```

Where `sortedKeyReplacer` sorts all object keys lexicographically by Unicode code point at every nesting level.

The domain separator `"git-warp:opsDigest:v1\0"` prevents cross-protocol hash confusion. The `\0` is a literal null byte (U+0000) acting as an unambiguous delimiter between the prefix and the JSON payload.

**OpOutcome schema:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `op` | string | Yes | One of: `NodeAdd`, `NodeTombstone`, `EdgeAdd`, `EdgeTombstone`, `PropSet`, `BlobValue` |
| `target` | string | Yes | Node ID, edge key, or property key |
| `result` | string | Yes | One of: `applied`, `superseded`, `redundant` |
| `reason` | string | No | Human-readable explanation. Absent (not null) when not provided. |

Canonical key order for an op outcome (when all fields present): `op`, `reason`, `result`, `target`.

### 5.4 Receipt CBOR Encoding (normative)

- All map keys sorted lexicographically by Unicode code point before encoding
- CBOR major type 5 (map) for the receipt object
- No CBOR records/tags — plain maps and standard types only
- `useRecords: false` in cbor-x configuration

Resulting canonical key order:
```
dataCommit, graphName, opsDigest, prevAuditCommit, tickEnd, tickStart, timestamp, version, writerId
```

### 5.5 receiptDigest (informative)

The receipt digest is derived from the CBOR blob content, not stored as a field:

```
receiptDigest = lowercase_hex(SHA256(canonicalCBOR(receipt)))
```

Useful for indexing, witness logs, and future transparency layers.

### 5.6 Commit Message Trailers (normative)

**Title:** `warp:audit`

**Required trailers** (in this canonical order):

| Trailer Key | Value |
|---|---|
| `eg-data-commit` | `<dataCommit>` |
| `eg-graph` | `<graphName>` |
| `eg-kind` | `audit` |
| `eg-ops-digest` | `<opsDigest>` |
| `eg-schema` | `1` |
| `eg-writer` | `<writerId>` |

Rules:
- Trailer keys: lowercase, lexicographic order
- Duplicate trailers: forbidden — reject on decode
- Unknown `eg-*` trailers: allowed, ignored by v1 verifiers (forward-compatible for additive fields)
- Non-`eg-*` trailers: allowed, ignored (Git may add its own)
- Trailer values MUST NOT contain newlines

---

## 6. Git Object Structure

Each audit commit contains a tree with a single blob:

```
tree/
  receipt.cbor          # 100644 blob — canonical CBOR receipt (Section 5.4)

commit:
  tree: <tree SHA>
  parents: [prevAuditCommit] or [] for genesis
  message: <trailer-encoded message> (Section 5.6)

ref update:
  refs/warp/<graphName>/audit/<writerId> -> <commit SHA>
```

### Genesis Commit

- `prevAuditCommit` = `"0" * oidLen`
- Git parents: empty (`[]`)

### Continuation Commit

- `prevAuditCommit` = SHA of previous audit commit
- Git parents: exactly one parent, matching `prevAuditCommit`

---

## 7. Chain Rules

### Chain Invariants

For a chain `r[0], r[1], ..., r[n-1]`:

1. **Linear linking:** `r[i].prevAuditCommit == sha(r[i-1])` for all i > 0
2. **Genesis sentinel:** `r[0].prevAuditCommit == "0" * oidLen`
3. **Strictly monotonic ticks:** `r[i].tickStart > r[i-1].tickEnd` for all i > 0
4. **Writer consistency:** All receipts in a chain share the same `writerId` and `graphName`
5. **dataCommit uniqueness:** No duplicate `dataCommit` values within a (graphName, writerId) chain
6. **Git parent match:** The Git commit parent of `r[i]` (i > 0) must equal `r[i].prevAuditCommit`
7. **OID length consistency:** All OIDs in a chain use the same length (40 or 64)

### Contiguity (soft)

In version 1, `r[i].tickStart == r[i-1].tickEnd + 1` is expected but gaps are permitted to support opt-in rollout scenarios where auditing is enabled partway through a writer's lifetime. Verifiers SHOULD warn about gaps but MUST NOT reject them.

---

## 8. Verification Algorithm

### Chain Walk

```
function verifyAuditChain(graphName, writerId, repo):
  tip = repo.resolveRef(`refs/warp/${graphName}/audit/${writerId}`)
  if tip is null:
    return OK (no audit chain exists)

  current = tip
  prev = null

  while current is not null:
    commit = repo.readCommit(current)
    tree = repo.readTree(commit.tree)
    blob = tree.lookup("receipt.cbor")
    if blob is null:
      FAIL "missing receipt.cbor in audit commit"

    receipt = CBOR.decode(repo.readBlob(blob))
    trailers = parseTrailers(commit.message)

    // Structure validation
    validateReceiptSchema(receipt)
    validateTrailerConsistency(receipt, trailers)

    // Chain linking
    if prev is not null:
      if receipt does not match prev's prevAuditCommit:
        FAIL "chain link broken"
      if receipt.tickEnd >= prev.tickStart:
        FAIL "tick monotonicity violated"
      if receipt.writerId != prev.writerId:
        FAIL "writer consistency violated"
      if receipt.graphName != prev.graphName:
        FAIL "graph consistency violated"

    // OID length check
    oidLen = len(receipt.dataCommit)
    if oidLen != 40 and oidLen != 64:
      FAIL "invalid OID length"
    if len(receipt.prevAuditCommit) != oidLen:
      FAIL "OID length mismatch"

    // Genesis check
    if receipt.prevAuditCommit == "0" * oidLen:
      if commit.parents.length != 0:
        FAIL "genesis must have no parents"
      return OK
    else:
      if commit.parents.length != 1:
        FAIL "continuation must have exactly one parent"
      if commit.parents[0] != receipt.prevAuditCommit:
        FAIL "Git parent does not match prevAuditCommit"

    prev = receipt
    current = receipt.prevAuditCommit

  FAIL "chain did not terminate at genesis"
```

### Deep Verification (optional)

Re-materialize the data commit with `receipts: true`, recompute the opsDigest from the materialized ops array, and compare against the stored opsDigest. This validates that the receipt accurately records what happened during materialization.

---

## 9. Trust and Version Compatibility

### Versioning

The `version` field is a positive integer, incremented on breaking schema changes. Verifiers MUST reject receipts with `version > maxSupportedVersion`. Additive trailers (new `eg-*` keys) are non-breaking and do not require a version bump.

### Trust Model

**Content-addressing:** The audit commit SHA covers the tree (containing `receipt.cbor`), parent links, and commit message. Any mutation to any of these changes the SHA, breaking the chain.

**Chain linking:** Modifying any receipt invalidates all successor receipts in the chain, since each successor's `prevAuditCommit` references the predecessor's SHA.

**No GPG/SSH signing required in v1.** Signing is orthogonal to the receipt format and can be layered via Git's native `--sign` mechanism. The receipt format does not depend on signatures for integrity — content-addressing provides tamper-evidence.

**Retention anchor required for tamper-proof guarantees.** Without a previously recorded tip hash or external witness, the system is:

- **Tamper-evident:** Detects mutation of any receipt in the chain (broken SHAs)
- **NOT tamper-proof against full history replacement:** An adversary with write access to the ref can replace the entire chain with a valid alternative chain

Verifiers SHOULD record and compare tip hashes across runs. External anchoring mechanisms (signed checkpoints, transparency logs, multi-party witnesses) can provide stronger guarantees but are out of scope for v1.

### Authoritative Time

`receipt.timestamp` is the authoritative time source. Git commit header timestamps (`committer` and `author` dates) are informational only. Verifiers MUST NOT compare Git header timestamps against receipt timestamps in v1.

---

## 10. Test Vectors — Golden Corpus

All vectors specify exact bytes. Conforming implementations MUST produce byte-identical output for the same inputs.

### 10.1 Vector 1 — Genesis Receipt (SHA-1 OIDs)

**Input ops:**
```json
[
  {"op":"NodeAdd","target":"user:alice","result":"applied"},
  {"op":"PropSet","target":"user:alice\u0000name","result":"applied"}
]
```

**Canonical JSON (hex):**
```
5b7b226f70223a224e6f6465416464222c22726573756c74223a226170706c696564222c22746172676574223a22757365723a616c696365227d2c7b226f70223a2250726f70536574222c22726573756c74223a226170706c696564222c22746172676574223a22757365723a616c6963655c75303030306e616d65227d5d
```

**opsDigest:**
```
63df7eaa05e5dc38b436ffd562dad96d2175c7fa089fec6df8bb78bdc389b8fe
```

**Receipt fields:**
```json
{
  "version": 1,
  "graphName": "events",
  "writerId": "alice",
  "dataCommit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "tickStart": 1,
  "tickEnd": 1,
  "opsDigest": "63df7eaa05e5dc38b436ffd562dad96d2175c7fa089fec6df8bb78bdc389b8fe",
  "prevAuditCommit": "0000000000000000000000000000000000000000",
  "timestamp": 1768435200000
}
```

**Receipt CBOR (hex):**
```
b900096a64617461436f6d6d69747828616161616161616161616161616161616161616161616161616161616161616161616161616161616967726170684e616d65666576656e7473696f70734469676573747840363364663765616130356535646333386234333666666435363264616439366432313735633766613038396665633664663862623738626463333839623866656f707265764175646974436f6d6d6974782830303030303030303030303030303030303030303030303030303030303030303030303030303030677469636b456e6401697469636b5374617274016974696d657374616d70fb4279bbef3b0000006776657273696f6e0168777269746572496465616c696365
```

**Trailer block:**
```
eg-data-commit: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
eg-graph: events
eg-kind: audit
eg-ops-digest: 63df7eaa05e5dc38b436ffd562dad96d2175c7fa089fec6df8bb78bdc389b8fe
eg-schema: 1
eg-writer: alice
```

### 10.2 Vector 2 — Continuation Receipt (SHA-1 OIDs)

**Input ops:**
```json
[
  {"op":"EdgeAdd","target":"user:alice\u0000user:bob\u0000follows","result":"applied"}
]
```

**Canonical JSON (hex):**
```
5b7b226f70223a2245646765416464222c22726573756c74223a226170706c696564222c22746172676574223a22757365723a616c6963655c7530303030757365723a626f625c7530303030666f6c6c6f7773227d5d
```

**opsDigest:**
```
2d060db4f93b99b55c5effdf7f28042e09c1e93f1e0369a7e561bfc639f4e3d3
```

**Receipt fields:**
```json
{
  "version": 1,
  "graphName": "events",
  "writerId": "alice",
  "dataCommit": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "tickStart": 2,
  "tickEnd": 2,
  "opsDigest": "2d060db4f93b99b55c5effdf7f28042e09c1e93f1e0369a7e561bfc639f4e3d3",
  "prevAuditCommit": "cccccccccccccccccccccccccccccccccccccccc",
  "timestamp": 1768435260000
}
```

**Receipt CBOR (hex):**
```
b900096a64617461436f6d6d69747828626262626262626262626262626262626262626262626262626262626262626262626262626262626967726170684e616d65666576656e7473696f70734469676573747840326430363064623466393362393962353563356566666466376632383034326530396331653933663165303336396137653536316266633633396634653364336f707265764175646974436f6d6d6974782863636363636363636363636363636363636363636363636363636363636363636363636363636363677469636b456e6402697469636b5374617274026974696d657374616d70fb4279bbef49a600006776657273696f6e0168777269746572496465616c696365
```

**Trailer block:**
```
eg-data-commit: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
eg-graph: events
eg-kind: audit
eg-ops-digest: 2d060db4f93b99b55c5effdf7f28042e09c1e93f1e0369a7e561bfc639f4e3d3
eg-schema: 1
eg-writer: alice
```

### 10.3 Vector 3 — Mixed Outcomes

**Input ops:**
```json
[
  {"op":"NodeAdd","target":"user:charlie","result":"applied"},
  {"op":"PropSet","target":"user:alice\u0000name","result":"superseded","reason":"LWW: writer bob at lamport 5 wins"},
  {"op":"NodeAdd","target":"user:alice","result":"redundant"}
]
```

**Canonical JSON (hex):**
```
5b7b226f70223a224e6f6465416464222c22726573756c74223a226170706c696564222c22746172676574223a22757365723a636861726c6965227d2c7b226f70223a2250726f70536574222c22726561736f6e223a224c57573a2077726974657220626f62206174206c616d706f727420352077696e73222c22726573756c74223a2273757065727365646564222c22746172676574223a22757365723a616c6963655c75303030306e616d65227d2c7b226f70223a224e6f6465416464222c22726573756c74223a22726564756e64616e74222c22746172676574223a22757365723a616c696365227d5d
```

**opsDigest:**
```
c8e06e3a8b8d920dd9b27ebb4d5944e91053314150cd3671d0557d3cff58d057
```

**Receipt fields:**
```json
{
  "version": 1,
  "graphName": "events",
  "writerId": "alice",
  "dataCommit": "dddddddddddddddddddddddddddddddddddddd",
  "tickStart": 3,
  "tickEnd": 3,
  "opsDigest": "c8e06e3a8b8d920dd9b27ebb4d5944e91053314150cd3671d0557d3cff58d057",
  "prevAuditCommit": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "timestamp": 1768435320000
}
```

**Receipt CBOR (hex):**
```
b900096a64617461436f6d6d69747828646464646464646464646464646464646464646464646464646464646464646464646464646464646967726170684e616d65666576656e7473696f70734469676573747840633865303665336138623864393230646439623237656262346435393434653931303533333134313530636433363731643035353764336366663538643035376f707265764175646974436f6d6d6974782865656565656565656565656565656565656565656565656565656565656565656565656565656565677469636b456e6403697469636b5374617274036974696d657374616d70fb4279bbef584c00006776657273696f6e0168777269746572496465616c696365
```

### 10.4 Vector 4 — SHA-256 OIDs

**Input ops:**
```json
[
  {"op":"NodeAdd","target":"server:prod-1","result":"applied"}
]
```

**Canonical JSON (hex):**
```
5b7b226f70223a224e6f6465416464222c22726573756c74223a226170706c696564222c22746172676574223a227365727665723a70726f642d31227d5d
```

**opsDigest:**
```
03a8cb1f891ac5b92277271559bf4e2f235a4313a04ab947c1ec5a4f78185cb8
```

**Receipt fields:**
```json
{
  "version": 1,
  "graphName": "infra",
  "writerId": "deployer",
  "dataCommit": "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "tickStart": 1,
  "tickEnd": 1,
  "opsDigest": "03a8cb1f891ac5b92277271559bf4e2f235a4313a04ab947c1ec5a4f78185cb8",
  "prevAuditCommit": "0000000000000000000000000000000000000000000000000000000000000000",
  "timestamp": 1768435200000
}
```

**Receipt CBOR (hex):**
```
b900096a64617461436f6d6d69747840666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666967726170684e616d6565696e667261696f70734469676573747840303361386362316638393161633562393232373732373135353962663465326632333561343331336130346162393437633165633561346637383138356362386f707265764175646974436f6d6d6974784030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030677469636b456e6401697469636b5374617274016974696d657374616d70fb4279bbef3b0000006776657273696f6e01687772697465724964686465706c6f796572
```

**Trailer block:**
```
eg-data-commit: ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
eg-graph: infra
eg-kind: audit
eg-ops-digest: 03a8cb1f891ac5b92277271559bf4e2f235a4313a04ab947c1ec5a4f78185cb8
eg-schema: 1
eg-writer: deployer
```

### 10.5 String Escaping Edge Cases

**Null byte in target:**
```
Input:  [{"op":"PropSet","target":"node:a\u0000key","result":"applied"}]
Canonical JSON (hex): 5b7b226f70223a2250726f70536574222c22726573756c74223a226170706c696564222c22746172676574223a226e6f64653a615c75303030306b6579227d5d
```

The `\0` (U+0000) encodes as `\u0000` in JSON.

**Unicode in target:**
```
Input:  [{"op":"NodeAdd","target":"节点:α","result":"applied"}]
Canonical JSON (hex): 5b7b226f70223a224e6f6465416464222c22726573756c74223a226170706c696564222c22746172676574223a22e88a82e782b93aceb1227d5d
```

CJK and Greek characters are encoded as raw UTF-8 bytes, not escaped.

**Quotes and backslashes in target:**
```
Input:  [{"op":"PropSet","target":"say \"hello\\world\"","result":"applied"}]
Canonical JSON (hex): 5b7b226f70223a2250726f70536574222c22726573756c74223a226170706c696564222c22746172676574223a22736179205c2268656c6c6f5c5c776f726c645c22227d5d
```

Quotation marks escape as `\"`, backslashes as `\\`.

### 10.6 Negative Fixtures

| # | Input | Expected Error |
|---|---|---|
| N1 | `version: 2` | Unsupported version |
| N2 | `version: 0` | Invalid version (must be >= 1) |
| N3 | Missing `graphName` | Missing required field |
| N4 | `tickStart > tickEnd` (e.g., 3, 1) | tickStart must be <= tickEnd |
| N5 | `tickStart != tickEnd` in v1 (e.g., 1, 3) | v1 requires tickStart == tickEnd |
| N6 | Invalid `dataCommit` (not hex, e.g., `"zzzz..."`) | Invalid OID format |
| N7 | Genesis sentinel length mismatch (40-char zero-hash with 64-char dataCommit) | OID length mismatch |
| N8 | Non-genesis with zero-hash `prevAuditCommit` and `tickStart > 1` | Non-genesis receipt cannot use zero-hash sentinel |
| N9 | Duplicate trailer key | Duplicate trailer rejected |

### 10.7 Chain Break Dramatization

Given a valid receipt CBOR blob, flip a single byte at offset 10. The verifier detects either:

- **CBOR decode failure** (if the flip corrupts CBOR structure), or
- **opsDigest mismatch** (if the flip corrupts a field value but CBOR remains valid)

This demonstrates that any single-byte mutation is detectable.

---

## 11. JSON Schema (normative appendix)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://git-stunts.dev/schemas/audit-receipt/v1",
  "title": "WARP Audit Receipt v1",
  "type": "object",
  "required": [
    "version",
    "graphName",
    "writerId",
    "dataCommit",
    "tickStart",
    "tickEnd",
    "opsDigest",
    "prevAuditCommit",
    "timestamp"
  ],
  "additionalProperties": false,
  "properties": {
    "version": {
      "type": "integer",
      "const": 1
    },
    "graphName": {
      "type": "string",
      "minLength": 1,
      "not": {
        "anyOf": [
          {"pattern": "\\.\\."},
          {"pattern": ";"},
          {"pattern": " "},
          {"pattern": "\\u0000"}
        ]
      }
    },
    "writerId": {
      "type": "string",
      "pattern": "^[A-Za-z0-9._-]{1,64}$"
    },
    "dataCommit": {
      "type": "string",
      "pattern": "^[0-9a-f]{40}([0-9a-f]{24})?$"
    },
    "tickStart": {
      "type": "integer",
      "minimum": 1
    },
    "tickEnd": {
      "type": "integer",
      "minimum": 1
    },
    "opsDigest": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "prevAuditCommit": {
      "type": "string",
      "pattern": "^[0-9a-f]{40}([0-9a-f]{24})?$"
    },
    "timestamp": {
      "type": "integer",
      "minimum": 0
    }
  }
}
```

**Trailer set schema:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://git-stunts.dev/schemas/audit-receipt-trailers/v1",
  "title": "WARP Audit Receipt Trailers v1",
  "type": "object",
  "required": [
    "eg-data-commit",
    "eg-graph",
    "eg-kind",
    "eg-ops-digest",
    "eg-schema",
    "eg-writer"
  ],
  "properties": {
    "eg-data-commit": {
      "type": "string",
      "pattern": "^[0-9a-f]{40}([0-9a-f]{24})?$"
    },
    "eg-graph": {
      "type": "string",
      "minLength": 1
    },
    "eg-kind": {
      "type": "string",
      "const": "audit"
    },
    "eg-ops-digest": {
      "type": "string",
      "pattern": "^[0-9a-f]{64}$"
    },
    "eg-schema": {
      "type": "string",
      "const": "1"
    },
    "eg-writer": {
      "type": "string",
      "pattern": "^[A-Za-z0-9._-]{1,64}$"
    }
  }
}
```

---

## 12. Implementation Notes (informational appendix)

These notes provide guidance for M3.T1.SHADOW-LEDGER and are NOT normative.

### Integration Point

The recommended integration point is an `onCommitSuccess` callback in the patch commit path. After a data commit succeeds, the audit receipt is created as a separate Git commit and the audit ref is updated via CAS.

### Feature Flag

Auditing should be gated by an `audit: true` option on `WarpGraph.open()`. When disabled, no audit commits are created and no audit refs are touched.

### Performance

Creating an audit receipt adds one Git commit per data commit. The CBOR encoding and SHA-256 computation are negligible relative to the Git I/O. The audit chain is append-only and never read during normal operations — only during explicit verification.

### receiptDigest Derivation

```javascript
const receiptBytes = codec.encode(sortedReceipt);
const receiptDigest = crypto.createHash('sha256').update(receiptBytes).digest('hex');
```

The receipt digest is computed from the canonical CBOR bytes, not from the receipt fields directly. This ensures the digest matches regardless of implementation language or CBOR library, as long as canonical encoding is used.

---

## 13. Verification Output (M4.T1)

### JSON Output Schema

```json
{
  "graph": "string",
  "verifiedAt": "ISO-8601 timestamp",
  "summary": {
    "total": "number",
    "valid": "number",
    "partial": "number",
    "invalid": "number"
  },
  "chains": [
    {
      "writerId": "string",
      "ref": "string",
      "status": "VALID | PARTIAL | BROKEN_CHAIN | DATA_MISMATCH | ERROR",
      "receiptsVerified": "number",
      "receiptsScanned": "number",
      "tipCommit": "string | null",
      "tipAtStart": "string | null",
      "genesisCommit": "string | null",
      "stoppedAt": "string | null",
      "since": "string | null",
      "errors": [{ "code": "string", "message": "string", "commit": "string?" }],
      "warnings": [{ "code": "string", "message": "string" }]
    }
  ],
  "trustWarning": {
    "code": "string",
    "message": "string",
    "sources": ["string"]
  }
}
```

### Status Codes

| Code | Meaning |
|------|---------|
| `VALID` | Full chain verified from tip to genesis, no errors |
| `PARTIAL` | Chain verified from tip to `--since` boundary, no errors |
| `BROKEN_CHAIN` | Structural integrity failure (parent mismatch, genesis/continuation) |
| `DATA_MISMATCH` | Content integrity failure (trailer vs CBOR field mismatch) |
| `ERROR` | Operational failure (missing blob, decode failure, since not found) |

### `--since` Boundary Semantics

- **Inclusive:** the `since` commit IS verified (it is the last commit checked)
- **Walk:** backward from tip, stop AFTER verifying the `since` commit
- **Chain link at boundary:** the link FROM `since` to its predecessor is NOT checked
- **`since` not in chain:** `SINCE_NOT_FOUND` error, status = `ERROR`
- **Result status:** `PARTIAL` when `--since` was used and verification succeeded
