---
id: NDNM_delete-vv-orset-shims
feature: runtime-boundaries
blocked_by: []
blocks: []
---

# Delete VersionVector and ORSet backward-compat shims

**Effort:** M

## Problem

VersionVector.js has ~130 LOC of shim functions (`createVersionVector`,
`vvMerge`, `vvClone`, etc.) and ORSet.js has ~180 LOC of shim functions
(`createORSet`, `orsetAdd`, etc.). These exist only for test backward
compatibility — all 13+ source consumers already use the class API directly.

36 test files import VV shims. ~46 test files import ORSet shims.

## Fix

Migrate test files to class API, then delete the shims. The `_coerce()`
bridge disappears too — it's a code smell from the incomplete migration.

## Notes

Mechanical but high file count. Good candidate for parallel subagents.
