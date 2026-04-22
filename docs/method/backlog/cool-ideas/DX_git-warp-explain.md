---
blocked_by: []
blocks: []
id: DX_git-warp-explain
feature: docs-dx
---

# `git warp explain` — trace a value's admission history

A command that answers "why does node X have property Y?" by
tracing the full provenance chain:

```
$ git warp explain user:alice.role
user:alice.role = "admin"
  Admitted at tick 7 by writer agent-1
  Patch sha: abc123...
  Policy: CRDT/LWW (last-writer-wins at lamport 7)
  Previous value: "member" (tick 3, writer agent-2)
  Witness: TickReceipt abc123...#op-3
```

For the MCP server, this becomes `warp_explain` — an agent tool
that makes provenance queryable in natural language.
