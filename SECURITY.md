# Security Model

@git-stunts/git-warp is designed with security-by-default principles, treating the underlying Git binary as an untrusted subsystem through the `@git-stunts/plumbing` layer.

## 🛡️ Security Through Plumbing

This library inherits all security protections from `@git-stunts/plumbing`:

- **Command Sanitization**: All Git commands are validated through a strict whitelist
- **Argument Injection Prevention**: Refs are validated against strict patterns to prevent command injection
- **No Arbitrary Commands**: Only safe Git plumbing commands are permitted
- **Environment Isolation**: Git processes run in a clean environment with minimal variables

## 🚫 Ref Validation

The `GitGraphAdapter` validates all ref arguments to prevent injection attacks:

- Refs must match the pattern: `^[a-zA-Z0-9._/-]+((~\d*|\^\d*|\.\.[a-zA-Z0-9._/-]+)*)$`
- Refs cannot start with `-` or `--` to prevent option injection
- Invalid refs throw an error immediately

## 🌊 Resource Protection

- **Streaming-First**: Large graph traversals use async generators to prevent OOM
- **Bitmap Indexing**: Sharded Roaring Bitmap indexes enable O(1) lookups without loading entire graphs
- **Delimiter Safety**: Uses ASCII Record Separator (`\x1E`) to prevent message collision

## Sync Authentication (SHIELD)

### Overview

The HTTP sync protocol supports optional HMAC-SHA256 request signing with replay protection. When enabled, every sync request must carry a valid signature computed over a canonical payload that includes the request body, timestamp, and a unique nonce.

### Threat Model

**Protected against:**
- Unauthorized sync requests from unknown peers
- Replay attacks (nonce-based, with 5-minute TTL window)
- Request body tampering (HMAC covers body SHA-256)
- Timing attacks on signature comparison (`timingSafeEqual`)

**Not protected against:**
- Compromised shared secrets (rotate keys immediately if leaked)
- Denial-of-service (body size limits provide basic protection, but no rate limiting)
- Man-in-the-middle without TLS (use HTTPS in production)

### Authentication Flow

1. Client computes SHA-256 of request body
2. Client builds canonical payload: `warp-v1|KEY_ID|METHOD|PATH|TIMESTAMP|NONCE|CONTENT_TYPE|BODY_SHA256`
3. Client computes HMAC-SHA256 of canonical payload using shared secret
4. Client sends 5 auth headers: `x-warp-sig-version`, `x-warp-key-id`, `x-warp-timestamp`, `x-warp-nonce`, `x-warp-signature`
5. Server validates header formats (cheap checks first)
6. Server checks clock skew (default: 5 minutes)
7. Server reserves nonce atomically (prevents replay)
8. Server resolves key by key-id
9. Server recomputes HMAC and compares with constant-time equality

### Enforcement Modes

- **`enforce`** (default): Rejects requests that fail authentication with appropriate HTTP status codes (400/401/403). No request details leak in error responses.
- **`log-only`**: Logs authentication failures but allows requests through. Use during rollout to identify issues before enforcing.

### Error Response Hygiene

External error responses use coarse status codes and generic reason strings:
- `400` — Malformed headers (version, timestamp, nonce, signature format)
- `401` — Missing auth headers, unknown key-id, invalid signature
- `403` — Expired timestamp, replayed nonce

Detailed diagnostics (exact failure reason, key-id, peer info) are sent to the structured logger only.

### Nonce Cache and Restart Semantics

The nonce cache is an in-memory LRU (default capacity: 100,000 entries). On server restart, the cache is empty. This means:
- Nonces from before the restart can be replayed within the 5-minute clock skew window
- This is an accepted trade-off for simplicity; persistent nonce storage is not implemented in v1
- For higher security, keep the clock skew window small and use TLS

### Key Rotation

Key management uses a key-id system for zero-downtime rotation:

1. Add the new key-id and secret to the server's `keys` map
2. Deploy the server
3. Update clients to use the new key-id
4. Remove the old key-id from the server's `keys` map
5. Deploy again

Multiple key-ids can coexist indefinitely.

### Configuration

**Server (`serve()`):**
```js
await graph.serve({
  port: 3000,
  httpPort: new NodeHttpAdapter(),
  auth: {
    keys: { default: 'your-shared-secret' },
    mode: 'enforce', // or 'log-only'
  },
});
```

**Client (`syncWith()`):**
```js
await graph.syncWith('http://peer:3000', {
  auth: {
    secret: 'your-shared-secret',
    keyId: 'default',
  },
});
```

## Dependency Risk Assessment

| Package | Type | Risk | Notes |
|---|---|---|---|
| `@git-stunts/plumbing` | Runtime | Low | Internal package, spawns git processes with strict whitelist |
| `@git-stunts/alfred` | Runtime | Low | Retry/backoff utility, no I/O |
| `@git-stunts/trailer-codec` | Runtime | Low | Pure string encoding, no I/O |
| `cbor-x` | Runtime | Medium | Binary parser processing untrusted sync payloads; mitigated by body size limit in HttpSyncServer (4 MB default) |
| `roaring` | Runtime | Medium | Native C++ bindings (N-API); largest attack surface but sandboxed by N-API boundary, no network-facing input |
| `zod` | Runtime | Low | Schema validation, pure JS |
| `elkjs` | Runtime (lazy) | Low | ELK layout engine, pure JS, lazy-loaded only for `--view` |
| `chalk` | CLI-only | Negligible | Terminal coloring, no security surface |
| `boxen` | CLI-only | Negligible | Terminal box drawing |
| `cli-table3` | CLI-only | Negligible | Terminal table rendering |
| `string-width` | CLI-only | Negligible | String measurement |
| `strip-ansi` | Inlined | Negligible | ANSI escape removal; inlined into `src/visualization/utils/ansi.js` since v10.1.2, no longer a direct dependency |
| `open` | Transitive | Low | Opens URLs in browser; transitive dependency only, invoked by `--view` flag |

## Accepted Risks

| Risk | Severity | Owner | Expiry | Mitigation |
|---|---|---|---|---|
| `roaring` native bindings could have memory-safety bugs | Medium | @jross | 2026-08-01 | N-API sandbox; no untrusted input reaches bitmap code directly |
| `cbor-x` parser handles untrusted sync payloads | Medium | @jross | 2026-08-01 | 4 MB body size limit in HttpSyncServer; schema validation post-parse |
| Nonce cache lost on restart allows replay within clock skew window | Low | @jross | 2026-08-01 | 5-minute TTL; recommend TLS in production |
| No rate limiting on sync endpoint | Low | @jross | 2026-08-01 | Deploy behind reverse proxy with rate limiting |

## Threat Model Boundaries

| Category | In Scope | Out of Scope |
|---|---|---|
| **Data integrity** | CRDT convergence, CAS ref updates, patch ordering | Filesystem corruption, disk failure |
| **Authentication** | HMAC-SHA256 sync auth, key rotation, replay protection | User identity management, OAuth/OIDC |
| **Authorization** | Writer whitelist (per-graph allowed writers) | Role-based access control, per-node ACLs |
| **Transport** | Body signing, tamper detection | TLS termination (delegated to reverse proxy) |
| **Availability** | Body size limits, streaming for large graphs | DDoS protection, rate limiting (delegated to infrastructure) |
| **Supply chain** | `npm audit` in CI, pinned dependencies via lockfile | Runtime SCA scanning, SBOM generation |

## Writer Authorization

The sync server supports an optional writer whitelist that restricts which writer IDs can submit patches through the HTTP sync protocol.

### Configuration

```js
await graph.serve({
  port: 3000,
  httpPort: new NodeHttpAdapter(),
  auth: {
    keys: { default: 'your-shared-secret' },
    mode: 'enforce',
  },
  allowedWriters: ['alice', 'bob', 'node-1'],
});
```

### Rules

- Writer ID matching is **case-sensitive** and follows the pattern `[A-Za-z0-9._-]+` (1–64 characters)
- Writer IDs are validated at server startup; invalid IDs throw immediately
- When `allowedWriters` is not set (default), all authenticated writers are permitted
- When set, sync requests containing patches from unlisted writers receive HTTP 403 (`FORBIDDEN_WRITER`)
- The `forbiddenWriterRejects` metric tracks rejected requests

## Reporting a Vulnerability

If you discover a security vulnerability, please send an e-mail to [james@flyingrobots.dev](mailto:james@flyingrobots.dev).
