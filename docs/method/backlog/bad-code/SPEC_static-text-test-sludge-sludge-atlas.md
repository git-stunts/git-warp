---
id: SPEC_static-text-test-sludge-sludge-atlas
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/conformance/sludgeAtlas.test.ts`

**Effort:** S

This file parses sludge-map and refactoring-guide text to assert
presence of required families, paths, blockers, and wording.

Replace it with a structured sludge-atlas validator or documentation
build check. Behavioral tests should target the runtime seams that
paid down each sludge family, not prose shape.
