---
id: PERF_change-coupling-alert
blocked_by: []
blocks: []
---

# CI alert when change-coupling score increases

## Idea

Track change-coupling pairs in CI. When a PR changes two files that
already have high coupling (>15x in 3 months), alert:
"PatchBuilderV2.js and JoinReducer.js change together 21 times. This
PR makes it 22. Consider extracting shared types."

The alert doesn't block — it educates. Over time, developers naturally
reduce coupling because they see the score on every PR.

**Related:** `PROTO_change-coupling-breaker.md` addresses the fix
(extracting shared types). This idea addresses the feedback loop — making
the coupling visible at review time so it stays visible even after the
initial extraction work.
