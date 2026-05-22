---
id: DX_review-bot-warning-policy
feature: tooling-release
blocked_by: []
blocks: []
---

# Review bot warning policy

**Effort:** S

## Design

[0152 review bot warning policy](../../design/0152-review-bot-warning-policy/review-bot-warning-policy.md)

## Problem

PR #93 showed two different review-bot outcomes:

- a real inline issue that needed RED/GREEN repair;
- a generic docstring coverage warning that did not map to any local
  script, workflow, or repository policy.

The review loop needs a clear local rule for when warnings become work
and when they should be answered as false positives with evidence.

## Suggested Fix

Document the evidence bundle required for review-bot false positives:
local gate search, CI status, affected files, and the reason a proposed
fix would add churn or violate local style. Fold this into contributor
review-loop hygiene instead of relying on chat memory.
