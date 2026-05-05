---
id: COOL_query-cursor-fuzzer
blocked_by: []
blocks: []
feature: materialization-query-index
---

# Query Cursor Fuzzer

## Idea

Build a test harness that feeds `QueryRunner` adversarial lazy read
models:

- streams that throw after N reads
- streams that never end
- streams that duplicate nodes
- streams that reorder neighbors
- streams that expose huge graph pressure

## Why It Is Cool

It prevents "streaming" from becoming generator cosplay.

## Guardrails

- Keep this focused on the `QueryReadModelProvider` /
  `QueryReadModel` contract.
- Do not require storage-layer holography before the seam can be tested.
- Model expected behavior explicitly: bounded queries must stay bounded;
  traversal queries may consume more.
- Treat non-termination tests carefully so they cannot hang the suite.
