---
id: HEX_sync-no-rate-limiting
blocked_by: []
blocks: []
feature: sync-trust-security
release_home: v17.0.0
---

# Sync endpoint has no rate limiting

**Effort:** M

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
