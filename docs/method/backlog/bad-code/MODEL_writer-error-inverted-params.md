---
id: MODEL_writer-error-inverted-params
blocked_by: []
blocks: []
feature: runtime-boundaries
release_home: v17.0.0
---

# WriterError constructor has inverted parameter order

**Effort:** S

## Problem

`WriterError` takes `(code, message, cause)` while all other `WarpError`
subclasses follow the standard `(message, options)` pattern. This
inconsistency creates a developer trap -- callers must remember which
error class uses which signature.

## Suggested Fix

Align `WriterError` with the standard `(message, options)` constructor
pattern used by every other error in `src/domain/errors/`. Update all
call sites that pass positional `(code, message, cause)`.
