---
id: SPEC_static-text-test-sludge-v17-checkpoint-tail-optic-read-basis
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/conformance/v17CheckpointTailOpticReadBasis.test.ts`

**Effort:** S

This file has useful causal-tail behavior coverage, but one case reads
documentation and asserts checkpoint-tail wording.

Keep the causal read behavior tests and replace the doc text check with
a playback test that builds a checkpoint plus tail and proves the optic
observes the causal tail rather than a scalar patch count.
