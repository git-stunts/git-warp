# OG-006 — Remove Remaining Docs And Examples That Imply Caller Retargeting

Status: QUEUED

## Problem

Some docs and examples may still imply that `materializeCoordinate()` or
`materializeWorkingSet()` retarget the caller graph instance.

## Why This Matters

Tests now encode the safer contract. The prose surface should stop teaching the
old semantics.

## Promotion Trigger

Promote this item when the documentation reconciliation pass begins.
