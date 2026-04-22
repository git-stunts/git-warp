---
id: MODEL_patchv2-no-validation
blocked_by: []
blocks: []
---

# PatchV2 class has zero constructor validation

**Effort:** S

## What's Wrong

`PatchV2.js` constructor performs no validation. `writer` could be
empty string, `lamport` negative, `schema` set to 99, `ops` null.
The `context` field stores an unvalidated `VersionVector | Record`
with no normalization.

"A class without constructor validation is a typedef in disguise."

## Suggested Fix

Validate all fields in the constructor: non-empty writer, non-negative
lamport, known schema version, non-null ops array. Normalize `context`
via `VersionVector.from()`. Freeze the instance after construction.
