---
id: OWN_inmemory-adapter-global-state
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# InMemoryGraphAdapter has module-level mutable global state

**Effort:** S

## Problem

`_nodeCreateHash` and `_cryptoProbed` are module-level variables shared
across ALL `InMemoryGraphAdapter` instances. State cannot be reset
between tests. This couples instances to process-wide state, breaking
test isolation.

## Suggested Fix

Move crypto probing into the instance, or accept a hash function via
the constructor. Each instance should own its own state.
