---
id: PORT_dual-export-pattern
blocked_by: []
blocks: []
feature: browser-viz
release_home: v17.0.0
---

# Visualization modules mix named and default exports

**Effort:** XS

## Problem

`colors.js`, `table.js`, `progress.js`, `unicode.js`, `truncate.js` all
use both named exports AND a default export wrapping the same functions.
This invites inconsistent import styles across the codebase.

## Suggested Fix

Pick one pattern. Prefer named exports (consistent with the rest of the
codebase). Remove default export objects.
