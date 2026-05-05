---
id: SPEC_static-text-test-sludge-uniform-git-cas-closeout
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/uniform-git-cas-closeout.test.ts`

**Effort:** S

This file reads source, backlog, and ledger text to assert git-cas
closeout, checkpoint/index payload routing, trust records, and upgrade
carve-outs.

Replace it with adapter and runtime boot behavior tests proving all
payload paths use the injected CAS surface. Track broader adapter
parity with backlog metadata.
