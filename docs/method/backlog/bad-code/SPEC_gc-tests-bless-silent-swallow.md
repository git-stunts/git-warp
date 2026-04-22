---
id: SPEC_gc-tests-bless-silent-swallow
blocked_by: []
blocks: []
---

# GC tests bless silent error swallowing

**Effort:** S

Two tests in WarpGraph.autoGC.test.js validate that GC silently
swallows errors without verifying the error was actually thrown or
logged:

1. "GC throws -> materialize still succeeds" — passes null state
   to GC, asserts `not.toThrow()`, but never checks error was caught
   and logged. Would pass if GC silently skips null state entirely.
2. "no logger -> no crash" — `not.toThrow()` on code designed to
   swallow errors. Vacuous by definition.

## What's wrong

Testing that errors are swallowed without testing that errors
OCCURRED is testing that the silence is quiet. These tests would
pass even if the GC code path was never entered.

## Suggested fix

Assert that the error WAS thrown internally (spy on logger.warn
or logger.error). Assert that GC metrics reflect the failure.
"GC handles errors gracefully" means "errors are caught, logged,
and reported" — not "errors vanish."
