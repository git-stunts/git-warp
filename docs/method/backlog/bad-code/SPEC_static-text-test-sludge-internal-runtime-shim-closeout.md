---
id: SPEC_static-text-test-sludge-internal-runtime-shim-closeout
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/internal-runtime-shim-closeout.test.ts`

**Effort:** S

This file reads source files to assert the internal runtime shim is
deleted and remaining controller surfaces avoid its import path.

Replace it with behavior that constructs controller surfaces through
the supported host seams. Use a dead-import scanner for the deleted
shim path.
