---
id: SPEC_static-text-test-sludge-gitgraphadapter-git-cas-persistence
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/infrastructure/adapters/GitGraphAdapter.gitCasPersistence.test.ts`

**Effort:** S

This file mostly tests adapter behavior, but it also reads adapter and
backlog text to ratchet write delegation through string matching.

Keep the delegated write behavior tests with fake CAS ports. Replace
the source/backlog text ratchet with an adapter interaction test that
fails if blob or tree writes bypass the injected git-cas persistence
port.
