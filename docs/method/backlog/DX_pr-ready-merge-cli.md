---
id: DX_pr-ready-merge-cli
feature: tooling-release
blocked_by: []
blocks: []
---

# `scripts/pr-ready` Merge-Readiness CLI

**Effort:** M

## Problem

No single tool aggregates unresolved review threads, pending/failed checks, CodeRabbit status/cooldown, and human-review count into one deterministic verdict. A `scripts/pr-ready` CLI would provide a single go/no-go answer before attempting merge.

## Notes

- Part of P2 CI & Tooling batch
