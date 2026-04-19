# PROTO_join-reducer-import-time-strategy-validation-residue

## What stinks

`src/domain/services/JoinReducer.js` still has three uncovered load-time validation throws:

- line 522: missing strategy method
- line 526: missing `receiptName`
- line 529: invalid `receiptName` not present in `OP_TYPES`

Those guards run while the module is being imported, against the hardcoded local `OP_STRATEGIES` registry defined in the same file. In normal repo truth, the registry is already correct before any test code can interact with the exported API.

## Why it matters

- Coverage work gets pulled into import-order tricks and module surgery instead of behavior testing.
- The remaining misses do not represent untested runtime behavior; they represent defensive boot-time assertions over static local data.
- This makes it harder to tell whether the remaining gap is a real risk or just a shape of the file.

## Suggested direction

- Keep the validation, but extract it into a tiny exported helper that accepts a registry and can be tested directly, or
- convert the throws to a one-time assertion utility with its own focused test surface.

## Evidence

- After the cycle 0010 reducer tranche, `JoinReducer.js` was reduced to exactly these three uncovered lines while the public reducer paths, diff paths, receipt paths, and direct strategy behavior were covered.
