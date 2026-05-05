---
id: VIZ_levels-lightweight-layout
blocked_by: []
blocks: []
feature: browser-viz
---

# `levels()` as Lightweight `--view` Layout

**Effort:** M

## Problem

`levels()` is exactly the Y-axis assignment a layered DAG layout needs. For simple DAGs, `levels()` + left-to-right X sweep could produce clean layouts without the 2.5MB ELK import. Offer `--view --layout=levels` as an instant rendering mode, reserving ELK for complex graphs.

## Notes

- Files: `src/visualization/layouts/`, `bin/cli/commands/view.js`
- Part of P5 Features & Visualization tier
