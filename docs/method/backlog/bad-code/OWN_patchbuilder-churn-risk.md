---
id: OWN_patchbuilder-churn-risk
blocked_by: []
blocks: []
feature: api-capabilities
---

# CC_patchbuilder-churn-risk

**Title:** PatchBuilderV2 is the highest-churn file with 76 commits in 3 months
**Effort:** M

## Issue

PatchBuilderV2.js has 76 commits (most-changed file after WarpGraph.js
facade), 1101 LOC, fan-out=11, and change-couples with JoinReducer
(20x), CheckpointService (22x), WarpGraph (22x), SyncProtocol (18x),
and Writer (17x). Its commit() method is 128 lines. Every change to the
patch format ripples through 5+ files.

## Fix

The change-coupling numbers suggest PatchBuilderV2 is doing too much.
The commit() method should be decomposed: op validation, version vector
management, persistence, and trailer encoding are separate concerns.
Extract a PatchCommitService or similar.
