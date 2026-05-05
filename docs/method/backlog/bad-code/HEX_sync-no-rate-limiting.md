---
id: HEX_sync-no-rate-limiting
blocked_by: []
blocks: []
feature: sync-trust-security
release_home: v17.0.0
---

# Sync endpoint has no rate limiting

**Effort:** M

**Status:** Closed in cycle `0139-sync-rate-limiting`.

HttpSyncServer has HMAC auth, body size limits, and writer ACLs
but no rate limiting. An authenticated client can:

- Flood with sync requests (each triggers frontier computation +
  patch loading)
- Request sync with empty frontier, forcing full patch load
- Chain rapid requests causing Git lock contention

Since materialization is O(P), this is a denial-of-service vector
even with valid credentials.

## Suggested fix

Add per-key-id rate limiting to SyncAuthService (token bucket with
configurable QPS and burst). Add maxPatchesPerResponse cap to
processSyncRequest for response paging. Log sync latency and
payload size as metrics.

## Resolution

`SyncAuthService` now owns a per-key token bucket with configurable
capacity, refill rate, and injected clock. `HttpSyncServer` returns
`429 RATE_LIMITED` without calling graph sync work when a key exhausts
its budget, and non-local enforced sync auth now requires
`auth.rateLimit`.

Response paging and payload metrics remain valid follow-up ideas, but
they are not part of this release blocker.
