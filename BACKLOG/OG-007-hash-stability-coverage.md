# OG-007 — Expand Hash-Stability Coverage Across Snapshot Flavors

Status: QUEUED

## Problem

The read-boundary slice added detached snapshot behavior, but hash-stability
coverage is still incomplete across receipt-enabled and working-set snapshots.

## Why This Matters

Hash-stable materialized state is a core requirement for immutable read-side
semantics.

## Promotion Trigger

Promote this item when the next snapshot-integrity test pass begins.
