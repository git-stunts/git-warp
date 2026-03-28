# OG-007 — Expand Hash-Stability Coverage Across Snapshot Flavors

Status: DONE

Promoted to: `docs/design/snapshot-hash-stability-coverage.md`

Closed by:

- `test/unit/domain/WarpRuntime.snapshotHashStability.test.js`
- `docs/retrospectives/2026-03-27-snapshot-hash-stability-coverage.md`

## Problem

The read-boundary slice added detached snapshot behavior, but hash-stability
coverage is still incomplete across receipt-enabled and strand snapshots.

## Why This Matters

Hash-stable materialized state is a core requirement for immutable read-side
semantics.

## Promotion Trigger

Promoted when the next snapshot-integrity test pass began after detached reads,
runtime renaming, and immutable public snapshots had all landed.
