---
id: HEX_sync-response-paging-and-metrics
blocked_by: []
blocks: []
feature: sync-trust-security
release_home: v19.0.0
---

# Sync response paging and metrics are still coarse

**Effort:** M

## What's Wrong

Cycle `0139-sync-rate-limiting` bounded request admission per key id, but
`processSyncRequest` can still produce large patch responses for broad or
empty frontiers. Operators also lack first-class latency and payload-size
metrics for sync responses.

This is not the same release blocker as missing rate limiting: the endpoint
now has an auth admission budget. The remaining concern is response shaping
and observability under legitimate sync workloads.

## Suggested Fix

Add an explicit response paging contract for sync responses, with a maximum
patches-per-response budget and continuation token or cursor. Emit sync
latency and payload-size metrics through a logging or metrics port so
operators can see large frontier catches before they become incidents.
