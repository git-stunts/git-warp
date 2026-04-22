---
id: PROTO_patch-commit-visibility-contract
blocked_by: []
blocks: []
---

# Patch Commit Visibility Contract

**Effort:** S

## Problem

The write surface currently blurs two different claims:

1. a patch commit object was created
2. the canonical writer ref advanced and the mutation is visible to
   normal materialization

For callers, only the second claim should count as success. If a patch
was created but never became reachable from the visible writer tip, the
operation did not succeed in the sense that applications care about.

## Notes

- Make the success contract for `PatchBuilder.commit()`,
  `writer.commitPatch()`, and `graph.patch()` explicit: success means
  canonical writer-tip advancement, not just commit creation.
- Conflict or visibility failures must be surfaced as failures, not as
  "success with an unreachable sibling commit."
- Add API-level documentation and tests that pin this contract so
  higher layers can safely treat a successful return as visible graph
  truth.
- This is a correctness contract, not a WAL design.
