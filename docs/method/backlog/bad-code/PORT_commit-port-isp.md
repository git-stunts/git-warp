---
id: PORT_commit-port-isp
blocked_by: []
blocks: []
feature: sync-trust-security
---

# CommitPort has 10 methods mixing 4 concerns

**Effort:** L

## What's Wrong

`CommitPort` bundles 10 methods spanning 4 distinct concerns: commit
creation (`commitNode`, `commitNodeWithTree`), reading (`showNode`,
`getNodeInfo`, `getCommitTree`), querying (`logNodes`,
`logNodesStream`, `countNodes`, `nodeExists`), and health (`ping`).
`logNodesStream` returns `node:stream.Readable` through the port
boundary, which is a hexagonal architecture violation -- Node.js
host API leaking into the domain contract. ISP says consumers
shouldn't depend on methods they don't use.

## Suggested Fix

- Split into `CommitWritePort`, `CommitReadPort`, `CommitQueryPort`.
- Remove `node:stream.Readable` from the port contract; use an
  async iterable or domain-level stream abstraction instead.
- `ping` belongs on a separate `HealthPort` or `DiagnosticsPort`.
