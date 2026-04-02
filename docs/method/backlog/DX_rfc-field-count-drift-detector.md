# RFC Field Count Drift Detector

**Effort:** S

## Problem

Script that counts WarpGraph instance fields (grep `this._` in constructor) and warns if design RFC field counts diverge. Prevents stale numbers in `warpgraph-decomposition.md`.

## Notes

- Depends on `docs/design/warpgraph-decomposition.md`
- Low urgency — fold into PRs that touch related files
