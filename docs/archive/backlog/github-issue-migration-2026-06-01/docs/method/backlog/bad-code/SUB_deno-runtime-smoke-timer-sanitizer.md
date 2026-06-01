---
id: SUB_deno-runtime-smoke-timer-sanitizer
blocked_by: []
blocks: []
feature: runtime-boundaries
release_home: v18.0.0
---

# Deno runtime smoke tests must disable timer sanitizers

**Effort:** M

## What's Wrong

The Deno runtime smoke suite currently runs through `denoRuntimeTest()`,
which disables op and resource sanitizers. The immediate leak source is
`@git-stunts/alfred` timeout handling under the `@git-stunts/git-cas`
path: successful Git CAS operations leave timeout timers visible to
Deno's test sanitizer.

That is acceptable for the v17 release smoke gate because the suite is
checking runtime compatibility, not dependency internals, but it weakens
Deno's ability to catch real leaked resources in this repository.

## Suggested Fix

Investigate the `@git-stunts/alfred` timeout policy under Deno and either
clear timeout handles after successful operations or inject a Deno-safe
clock/timer policy for the Git CAS integration. Once fixed, remove
`sanitizeOps: false` and `sanitizeResources: false` from the Deno test
harness and let the runtime smoke suite run with default leak checks.
