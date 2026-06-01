---
id: SPEC_static-text-test-sludge-hygiene-quarantine-graduation
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/conformance/hygieneQuarantineGraduation.test.ts`

**Effort:** S

This file reads quarantine JSON as text and asserts the `"files": []`
shape with a regex.

Replace it with a manifest parser or policy command that validates
structured quarantine state. Vitest should cover the behavior enabled
by the hygiene cleanup, not hard-code JSON formatting.
