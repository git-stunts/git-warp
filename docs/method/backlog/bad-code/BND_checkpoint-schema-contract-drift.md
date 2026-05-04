---
id: BND_checkpoint-schema-contract-drift
blocked_by: []
blocks: []
feature: trie-state-storage
release_home: v17.0.0
---

# Checkpoint schema support contract has drifted

**Effort:** M

## What's Wrong

`checkpointLoad.ts` documents V5 checkpoint state, but its unsupported
schema error still says only schema 2, 3, and 4 are supported. Current
unit failures show tests and implementation disagree about which
checkpoint schemas should load or reject.

This is boundary-contract drift. Checkpoint schema support must be a
clear versioned boundary, not a mix of stale error text and stale tests.

## Suggested Fix

Define the v17 checkpoint support matrix in tests first: current schema
loads, unsupported legacy schemas reject with explicit migration
guidance, and error codes are stable. Then update `checkpointLoad.ts`,
checkpoint tests, and docs to match that matrix exactly.
