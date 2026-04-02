# Promote PatchV2 from @typedef to class

**Effort:** M

## Problem

`src/domain/types/WarpTypesV2.js` defines `PatchV2` as a `@typedef {Object}`.
Core domain entity — created by PatchBuilder, serialized to CBOR, consumed
by JoinReducer. Should be a class.
