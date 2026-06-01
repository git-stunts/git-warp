---
id: DX_readonly-receipts-docs
blocked_by: []
blocks: []
feature: docs-dx
---

# Document readonly receipt arrays

## Problem

The public materialization receipt surface returns immutable receipt snapshots:
`receipts: readonly TickReceipt[]`.

The type surface and runtime behavior already use frozen snapshot arrays, but
the docs should say this directly so consumers do not infer that receipt arrays
are safe mutation targets.

## Current evidence

- `src/domain/RuntimeHost.ts` exposes receipt materialization as
  `readonly TickReceipt[]`.
- `src/domain/warp/RuntimeHostProduct.ts` exposes receipt materialization as
  `readonly TickReceipt[]`.
- `src/domain/capabilities/MaterializeCapability.ts` exposes
  `MaterializeWithReceipts.receipts` as `readonly TickReceipt[]`.
- `src/domain/services/ImmutableSnapshot.ts` builds immutable receipt-array
  snapshots.

## Acceptance

- Public docs that mention `materialize({ receipts: true })` describe receipt
  arrays as readonly snapshots.
- Examples do not mutate receipt arrays in place.
- The docs tell callers to copy the array first if they need local mutation.
- The note stays focused on receipt-array mutability; do not reopen broader
  materialization API classification.

## Source

Rehomed from archived v17 residual note
`API_readonly-receipts-release-note`.
