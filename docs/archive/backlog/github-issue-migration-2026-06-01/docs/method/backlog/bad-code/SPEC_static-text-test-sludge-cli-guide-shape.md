---
id: SPEC_static-text-test-sludge-cli-guide-shape
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/cli-guide-shape.test.ts`

**Effort:** S

This file reads CLI guide prose and asserts command-family and workflow
wording.

Replace it with CLI smoke tests that execute representative commands
against a fixture repo and verify outputs. Documentation examples can
then be generated or checked from those executable scenarios.
