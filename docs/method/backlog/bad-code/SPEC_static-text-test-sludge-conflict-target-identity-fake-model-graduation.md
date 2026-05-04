---
id: SPEC_static-text-test-sludge-conflict-target-identity-fake-model-graduation
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/conformance/conflictTargetIdentityFakeModelGraduation.test.ts`

**Effort:** S

This file mixes real normalization behavior with static reads of
quarantine manifests and source text for `*Like` placeholders.

Keep the runtime conflict-op normalization tests, but move the
manifest and source-text graduation checks to policy tooling. The
behavioral replacement should prove canonical conflict target identity
objects flow through consumers without shape cloning.
