---
id: SPEC_static-text-test-sludge-runtime-wiring-surface-closeout
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/runtime-wiring-surface-closeout.test.ts`

**Effort:** S

This file reads deleted shim paths, tsconfig text, and RuntimeHost
source to assert wiring surface closeout.

Replace it with RuntimeHost behavior tests for the direct static method
surface. Use dead-file and config validators outside Vitest for deleted
shim ratchets.
