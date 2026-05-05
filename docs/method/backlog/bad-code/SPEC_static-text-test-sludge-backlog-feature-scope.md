---
id: SPEC_static-text-test-sludge-backlog-feature-scope
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/scripts/backlog-feature-scope.test.ts`

**Effort:** S

This file scans backlog markdown and README text for `feature`
frontmatter and documented lane wording.

Replace it with a structured backlog metadata validator and a small
behavioral test for the backlog triage command, so feature scope is
proven as data rather than prose matching.
