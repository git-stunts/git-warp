---
id: SPEC_deno-adapter-tautology
blocked_by: []
blocks: []
feature: testing-quality
---

# DenoHttpAdapter test has literal expect(true).toBe(true) assertion

**Effort:** XS

## Issue

"does not produce unhandled rejection when shutdown rejects" asserts
`expect(true).toBe(true)`. A tautology. The test cannot fail
regardless of what the code does.

## Fix

Either use vitest's `unhandledRejection` detection or assert on the
actual promise outcome.
