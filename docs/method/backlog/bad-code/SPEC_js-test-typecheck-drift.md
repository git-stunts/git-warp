---
id: SPEC_js-test-typecheck-drift
blocked_by: []
blocks: []
feature: docs-dx
---

# PROTO_js-test-typecheck-drift

## Problem

The repo's strict `tsc --noEmit` surface currently includes a large set of JS
test files whose JSDoc typing has drifted behind the code. The failures are not
runtime regressions in `src/`; they are mostly:

- private/helper access in tests
- loose structural mocks that no longer satisfy richer runtime types
- index-signature and `checkJs` friction on test-only fixtures

This makes CI red for reasons that do not reflect the merge-readiness of the
source tree.

## Why it stinks

- It blurs source-type safety with test-fixture polish.
- It encourages fake fixes like `ts-ignore` or widening everything back to mush.
- It blocks PRs even when `src/`, the public consumer surface, lint, and runtime
  tests are all green.

## Current mitigation

CI and release-preflight gate required status checks on `npm run
typecheck:src` instead of the whole-repo `npm run typecheck`. The main CI
workflow also runs an advisory `npm run typecheck:test` lane so the drift stays
visible while runtime tests, lint, policy checks, consumer surface checks, and
coverage remain merge gates.

## Follow-up

- Decide whether JS tests should be:
  - cleaned up to pass full-repo `tsc --noEmit`, or
  - moved behind a dedicated non-blocking `typecheck:test` lane until that work
    is done.
- Do not paper over this with `any`, `ts-ignore`, or `ts-nocheck`.
