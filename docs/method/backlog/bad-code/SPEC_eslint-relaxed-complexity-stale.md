---
id: SPEC_eslint-relaxed-complexity-stale
blocked_by: []
blocks: []
feature: trie-state-storage
---

# ESLint relaxed-complexity overrides may contain stale entries

**Effort:** S

## What's Wrong

`eslint.config.js:270-441` — 109 files are listed in the relaxed
complexity overrides. After the TypeScript migration, many of these
may reference old `.js` extensions or files that have been
refactored/simplified. Some may no longer need the complexity
exemption.

## Suggested Fix

Audit each entry: verify the file still exists, confirm the extension
is `.ts`, and check whether the complexity that originally justified
the exemption is still present. Remove entries that no longer need
relaxation.
