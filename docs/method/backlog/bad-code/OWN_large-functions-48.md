---
id: OWN_large-functions-48
blocked_by: []
blocks: []
feature: testing-quality
---

# 48 functions exceed the 50-line limit

**Effort:** L

## Issue

The audit found 48 functions exceeding the eslint max-lines-per-function
limit of 50. The worst offenders: WarpRuntime.constructor (218 LOC),
SyncController.syncWith (194), WarpRuntime.open (162),
MaterializeController.materialize (153). Most are in files with eslint
overrides that relax the limit.

## Fix

The eslint overrides are acknowledgments, not solutions. Decompose
systematically. Priority: `commit()` in PatchBuilderV2 (128 LOC),
`fork()` in ForkController (125 LOC), `syncWith()` in SyncController
(194 LOC) — these are actionable without architectural changes.
