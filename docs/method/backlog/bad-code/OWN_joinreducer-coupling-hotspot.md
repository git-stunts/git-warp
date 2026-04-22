---
id: OWN_joinreducer-coupling-hotspot
blocked_by: []
blocks: []
---

# CC_joinreducer-coupling-hotspot

**Title:** JoinReducer is the highest-coupling hotspot in the codebase
**Effort:** L

## Issue

JoinReducer.js has fan-in=14 (14 files import it), fan-out=11 (it
imports 11 modules), and 53 commits in 3 months. Risk score: 675. It
change-couples with PatchBuilderV2 (20x), CheckpointService (17x), and
WarpGraph (17x). It exports 182+ symbols including many that appear to
be dead (applyFast, OpApplied, OpRedundant, OpSuperseded,
RAW_KNOWN_OPS, CANONICAL_KNOWN_OPS, isKnownOp, isKnownCanonicalOp).
This is the most dangerous file to change in the codebase — every
change ripples everywhere.

## Fix

Audit exports — remove dead ones. Extract op outcome classes to their
own file. Reduce fan-out by inverting dependencies (callers should
construct state, not import state factories from JoinReducer). The
change-coupling with PatchBuilderV2 suggests they should share extracted
types rather than importing each other.
