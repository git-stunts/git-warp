# RECEIPT_OP_TYPE mapping redundant with OpStrategy

**Effort:** XS

## Problem

`JoinReducer.js` `RECEIPT_OP_TYPE` maps internal names to receipt
names (e.g. `NodeRemove` -> `NodeTombstone`). With the OpStrategy
registry, this could be a `receiptName` property on each strategy
object. Low priority — cosmetic.
