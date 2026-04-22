---
id: MODEL_patchdiff-no-validation
blocked_by: []
blocks: []
feature: trie-state-storage
---

# PatchDiff class has no validation and typedef-only entries

**Effort:** S

## What's Wrong

`PatchDiff` constructor has no validation and no `Object.freeze()`.
`EdgeDiffEntry` and `PropDiffEntry` are typedef-only domain concepts
-- plain objects with no runtime identity, no constructor validation,
no behavioral surface.

## Suggested Fix

Add constructor validation to `PatchDiff` (check that added/removed
are arrays, props is a Map, etc.) and freeze the instance. Promote
`EdgeDiffEntry` and `PropDiffEntry` to proper classes with constructor
validation and their own source files.
