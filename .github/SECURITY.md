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
- **Bitmap Shard Validation**: Every serialized Roaring bitmap is validated before the bitmap library reads it. The boundary refuses a stored value that is not a byte string, checks the portable format structure, container headers, offsets, and container contents, and rejects one bitmap above 2^24 values or 34,086,920 bytes with `RoaringShardRejectedError`. Writers apply the same 2^24 limit before they serialize a bitmap. Both limits apply to one bitmap. One index shard file holds many bitmaps, and memory still grows with the number of bitmaps in that file. The `roaring-wasm` row under Accepted Risks is older than this boundary; [#1032](https://github.com/git-stunts/git-warp/issues/1032) owns that table and updates the row
- **Delimiter Safety**: Uses ASCII Record Separator (`\x1E`) to prevent message collision

## Sync Authentication (SHIELD)

### Overview

The HTTP sync protocol supports optional HMAC-SHA256 request signing with replay protection. When enabled, every sync request must carry a valid signature computed over a canonical payload that includes the request body, timestamp, and a unique nonce.

### Threat Model

**Protected against:**
- Unauthorized sync requests from unknown peers
- Replay attacks in enforce mode (signed freshness plus durable nonce reservations)
- Request body tampering (HMAC covers body SHA-256)
- Timing attacks on signature comparison (`timingSafeEqual`)

**Not protected against:**
- Compromised shared secrets (rotate keys immediately if leaked)
- Denial-of-service (body size limits provide basic protection, but no rate limiting)
- Man-in-the-middle without TLS (use HTTPS in production)

### Authentication Flow

1. Client computes SHA-256 of request body
2. Client reads epoch milliseconds through its injected clock and builds the canonical payload: `warp-v3|shared-secret-hmac-sha256|KEY_ID|METHOD|PATH|TIMESTAMP|NONCE|CONTENT_TYPE|BODY_SHA256`
3. Client computes HMAC-SHA256 of canonical payload using shared secret
4. Client sends six auth headers: `x-warp-auth-scheme`, `x-warp-sig-version`, `x-warp-key-id`, `x-warp-timestamp`, `x-warp-nonce`, `x-warp-signature`
5. Server validates header formats (cheap checks first)
6. Server resolves the key by key-id, recomputes HMAC, and compares with constant-time equality
7. Server checks the signed timestamp against its injected clock (inclusive five-minute skew allowance)
8. Server reserves the nonce atomically and durably (prevents replay)
9. Server checks freshness again after reservation completes, on the replay store's time and on its injected clock; enforce mode refuses an expired request and its nonce remains reserved
10. Server applies the configured per-key rate limit before graph work

### Enforcement Modes

- **`enforce`** (default): Rejects requests that fail authentication with appropriate HTTP status codes (400/401/403). No request details leak in error responses.
- **`log-only`**: Logs authentication failures but allows requests through. Use during rollout to identify issues before enforcing. Retired signature versions are still refused before authentication.

### Error Response Hygiene

External error responses use coarse status codes and generic reason strings:
- `400` — Malformed headers (version, timestamp, nonce, signature format)
- `401` — Missing auth headers, unknown key-id, invalid signature
- `403` — Expired timestamp, replayed nonce

Detailed diagnostics (exact failure reason, key-id, peer info) are sent to the structured logger only.

### Nonce Cache and Restart Semantics

Signature v3 binds an epoch-millisecond wall-clock timestamp and nonce to the
request HMAC. The verifier uses an injected clock and accepts a timestamp only
when its distance from the server clock is at most **300,000 ms (five minutes)**,
in either direction. A timestamp outside this inclusive interval returns
`403 EXPIRED`. Signature v2 used a Lamport counter and is refused with
`400 SIG_VERSION_RETIRED` before graph work in every mode, including `log-only`
and explicit unauthenticated localhost operation.

The Git runtime reserves each graph/key-id/nonce identity durably through
git-cas before admitting the request. Reservations use a **600,001 ms retention
interval**, with expiry calculated from the clock snapshot at reservation entry.
A request accepted five minutes early can remain valid for ten minutes, and the
extra millisecond keeps its nonce reserved at the inclusive freshness boundary.
git-cas preserves millisecond expiry and treats a marker as expired when its
expiry is at or before the current time.

The runtime's `ClockPort` signs requests and gives the early refusal. The final
freshness verdict and nonce retention both use the replay store's own time,
which is host time in the Git runtime. Each reservation reports two readings of
store time: one on entry, which sets the marker expiry, and one after the store
answers. In enforce mode the server admits a reserved request only when its
signed timestamp is at most 300,000 ms after the entry reading and at most
300,000 ms before the completion reading, both inclusive. Otherwise it returns
`403 EXPIRED` and the nonce stays reserved. A marker expires 600,001 ms after
its entry reading; from then on the completion bound refuses every timestamp
that the entry bound accepted. A caller-supplied runtime clock therefore cannot
reopen the replay window. A request must be fresh on both clocks, so a runtime
clock that disagrees with store time can refuse valid requests.

In enforce mode, a server restart preserves nonce refusal during the 600,001 ms
retention interval. Once the
reservation expires and is swept, the signed timestamp is already outside the
accepted interval. The server checks freshness again after the asynchronous
reservation. In enforce mode, crossing expiry while storage is awaited returns
`403 EXPIRED` before graph work. A nonce reserved during that wait remains reserved
on refusal.
Storage failure returns `503 REPLAY_STORE_UNAVAILABLE`. Expired markers can be
swept; no permanent nonce history is required.

Keep host clocks synchronized. These guarantees assume clocks progress normally;
they do not provide protection against arbitrary wall-clock rollback. Local
`log-only` and explicit unauthenticated modes deliberately permit unauthenticated
traffic; they still refuse retired signature v2. Use enforce mode and TLS for
protected sync. See the
[v21 sync authentication migration](../docs/migrations/v21/README.md#http-sync-authentication)
before upgrading peers.

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
| `@flyingrobots/bijou` | CLI | Low | Terminal presentation primitives; graph-derived strings require terminal-safe rendering |
| `@flyingrobots/bijou-node` | CLI | Medium | Node terminal and I/O adapters used by CLI presentation |
| `@flyingrobots/bijou-tui` | CLI | Medium | Interactive terminal UI; handles user input and graph-derived presentation data |
| `@git-stunts/git-cas` | Runtime | Medium | Git content-addressed storage, caches, and index pages; persisted data crosses a decoding and validation boundary |
| `@noble/hashes` | Runtime | Medium | Hash primitives used for content identity; correctness is security-sensitive |
| `@git-stunts/plumbing` | Runtime | Low | Internal package, spawns git processes with strict whitelist |
| `@git-stunts/alfred` | Runtime | Low | Retry/backoff utility, no I/O |
| `@git-stunts/trailer-codec` | Runtime | Low | Pure string encoding, no I/O |
| `cbor-x` | Runtime | Medium | Binary parser processing untrusted sync payloads; mitigated by body size limit in HttpSyncServer (4 MB default) |
| `roaring-wasm` | Runtime | Low-Medium | WebAssembly build of CRoaring. Synced peer-controlled graph data influences bitmap construction, and retained index shards are deserialized by bitmap readers. WASM memory isolation does not establish input trust or prevent wrong results, traps, or resource exhaustion. git-warp validates and bounds each serialized bitmap before the library reads it (see Bitmap Shard Validation) |
| `zod` | Runtime | Low | Schema validation, pure JS |


## Accepted Risks

| Risk | Severity | Owner | Expiry | Mitigation |
|---|---|---|---|---|
| `roaring-wasm` bitmap faults could corrupt results or exhaust resources | Medium | @flyingrobots | **EXPIRED 2026-08-01 — pending re-review** | WASM memory isolation limits host-memory exposure but does not validate peer-controlled graph data or retained bitmap shards; correctness and availability remain in scope. Input validation and resource bounds require owner re-review |
| `cbor-x` parser handles untrusted sync payloads | Medium | @flyingrobots | **EXPIRED 2026-08-01 — pending re-review** | 4 MB body size limit in HttpSyncServer; schema validation post-parse |
| Nonce cache lost on restart allows replay within clock skew window | Low | @flyingrobots | **EXPIRED 2026-08-01 — pending re-review** | 5-minute TTL; recommend TLS in production |
| No rate limiting on sync endpoint | Low | @flyingrobots | **EXPIRED 2026-08-01 — pending re-review** | Deploy behind reverse proxy with rate limiting |

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
