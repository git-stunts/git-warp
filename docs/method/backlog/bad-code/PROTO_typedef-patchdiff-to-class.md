# Promote PatchDiff from @typedef to class

**Effort:** S

## Problem

`src/domain/types/PatchDiff.js` defines `PatchDiff` as a `@typedef {Object}`
with a factory (`createEmptyDiff`) and merge logic (`mergeDiffs`). Real
data entity accumulated during reduce. It should be a class.
