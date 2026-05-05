---
id: SPEC_static-text-test-sludge-public-api-observer-noun
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/public-api-observer-noun.test.ts`

**Effort:** S

This file reads public surface declarations to assert Observer is the
runtime noun and ObserverView is absent.

Replace it with runtime import and consumer type tests that create an
Observer and prove the public read-handle behavior, while the legacy
noun remains unexported.
