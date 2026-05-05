---
id: SPEC_static-text-test-sludge-cast-quarantine-graduation
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/conformance/castQuarantineGraduation.test.ts`

**Effort:** S

This file reads quarantine manifests and source files to assert empty
file lists and absence of cast escape-hatch text.

Replace it with a dedicated policy command that parses quarantine
manifests and TypeScript syntax, then keep Vitest coverage focused on
the runtime behavior that made the casts unnecessary.
