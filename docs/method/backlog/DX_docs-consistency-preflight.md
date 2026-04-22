---
id: DX_docs-consistency-preflight
feature: tooling-release
blocked_by: []
blocks: []
---

# Docs Consistency Preflight

**Effort:** S

## Problem

Automated pass in `release:preflight` verifying changelog/readme/guide updates for behavior changes in hot paths (materialize, checkpoint, sync). Prevents releasing behavior changes without corresponding documentation updates.

## Notes

- Part of P2 CI & Tooling batch
