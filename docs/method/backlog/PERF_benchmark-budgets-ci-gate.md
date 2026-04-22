---
id: PERF_benchmark-budgets-ci-gate
blocked_by: []
blocks: []
---

# Benchmark Budgets + CI Regression Gate

**Effort:** L

## Problem

Define perf thresholds for eager post-commit and materialize hash cost; fail CI on agreed regression. Without budgets, performance regressions slip in undetected.

## Notes

- Part of P2 CI & Tooling batch
- Largest remaining P2 item — may need to split out into its own PR
