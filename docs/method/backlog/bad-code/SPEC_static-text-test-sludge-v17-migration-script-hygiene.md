---
id: SPEC_static-text-test-sludge-v17-migration-script-hygiene
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/v17-migration-script-hygiene.test.ts`

**Effort:** S

This file reads migration script source to assert custom script errors
and shared file-walker usage.

Replace it with behavior that runs migration script fixtures through
success and failure paths, verifying the observable errors and traversal
results rather than source phrases.
