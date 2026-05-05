---
id: SPEC_static-text-test-sludge-public-api-observer-label
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/public-api-observer-label.test.ts`

**Effort:** S

This file reads declaration/source text to assert labeled and unlabeled
observer overloads exist on Worldline and WarpApp.

Replace it with consumer type tests that compile calls to both overload
forms and runtime behavior tests that verify labels affect observer
identity or metadata as intended.
