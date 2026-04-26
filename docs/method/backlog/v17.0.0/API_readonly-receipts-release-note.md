---
id: API_readonly-receipts-release-note
blocked_by: []
blocks: []
feature: tooling-release
release_home: v17.0.0
---

# Document readonly materialization receipts

**Effort:** S

Cycle 0100 corrected the public materialization receipt surface from
mutable `TickReceipt[]` to `readonly TickReceipt[]`.

This matches runtime behavior: receipt arrays returned from public
materialization snapshot paths are frozen snapshots, not mutable arrays.

## Acceptance

- Document the `readonly TickReceipt[]` receipt-array surface in the v17
  changelog or migration notes.
- Confirm public examples do not mutate receipt arrays.
- Mention that callers needing mutation should copy the array first.
- Keep the note focused on API surface honesty; do not reopen generic
  snapshot protocol work.

## Source

Created from 0100 retrospective follow-up handling.
