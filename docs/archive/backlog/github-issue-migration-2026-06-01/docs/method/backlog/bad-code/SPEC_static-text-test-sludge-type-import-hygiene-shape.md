---
id: SPEC_static-text-test-sludge-type-import-hygiene-shape
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/type-import-hygiene-shape.test.ts`

**Effort:** S

This file reads eslint config, decisions docs, and quarantine manifests
to assert hygiene rules and documentation state.

Replace it with invoking ESLint against fixtures and parsing quarantine
manifests as structured data. Documentation should describe the active
tooling rather than being the tested contract.
