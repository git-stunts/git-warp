---
id: HEX_sync-server-no-graceful-shutdown
blocked_by: []
blocks: []
---

# HTTP sync server has no graceful shutdown

**Effort:** M

NodeHttpAdapter creates a plain `http.createServer()` with no:
- Drain period for in-flight requests before shutdown
- Connection tracking (no way to count active requests)
- SIGTERM/SIGINT signal handling
- Health endpoint beyond adapter-level ping()

Ungraceful shutdown during a sync can leave partial responses that
corrupt the client's frontier tracking (client updates frontier to
a SHA it never received all patches for).

## Suggested fix

Add `gracefulShutdown(timeoutMs)` to HttpServerHandle. Track
in-flight requests. Stop accepting new connections, wait for drain
(up to timeout), then close. Wire SIGTERM/SIGINT in the `serve`
CLI command.
