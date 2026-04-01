# OG-008 — Compatibility And Deprecation Story For Retargeting Reads

Status: DONE

Completed in: `15.0.0`

## Problem

The public read semantics changed. Callers that depended on retargeting needed
an explicit decision about whether the old surface would linger as an alias or
be removed cleanly.

## Why This Matters

Breaking API changes are acceptable here, but they should still be explicit and
traceable.

## Promotion Trigger

This item resolved as a hard major-version cut:

- detached read semantics already removed the old retargeting contract
- the runtime noun was renamed from `WarpGraph` to `WarpRuntime`
- no compatibility alias was kept
- the release version moved to `15.0.0`
