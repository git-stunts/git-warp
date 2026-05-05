---
id: HEX_warpserve-domain-infra-blur
blocked_by: []
blocks: []
feature: merge-strands-worldlines
release_home: v19.0.0
---

# WarpServeService domain/infra boundary blur

**Effort:** S

## Problem

`WarpServeService` lives in `src/domain/services/` but requires a
`WebSocketServerPort` — a port whose only implementations are
infrastructure adapters. The service orchestrates WebSocket protocol
handling which is domain logic, but its constructor requires I/O
infrastructure to function. This blurs the hexagonal boundary and
makes unit testing harder.

Not a bug. Acceptable today. If more I/O-dependent services emerge,
consider an "application services" layer between domain and
infrastructure.
