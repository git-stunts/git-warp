# InMemoryGraphAdapter has ~250 LOC of extractable SHA hashing

**Effort:** M

## What's Wrong

`InMemoryGraphAdapter.js` is 815 LOC. It contains `hashBlob`, `hashTree`, `hashCommit`, and preprocessing helpers (~190 LOC) plus `concatBytes`, `hexToBytes`, and `toBytes` (~60 LOC) that duplicate utilities already in `src/domain/utils/bytes.js`. Module-level mutable state is used for lazy crypto probing.

## Suggested Fix

Extract hashing logic to a dedicated `gitObjectHashing.js` module. Replace duplicated byte utilities with imports from `bytes.js`. Inject the crypto capability via constructor instead of probing globals at module level.
