# Promote ORSet from @typedef to class

**Effort:** M

## Problem

`src/domain/crdt/ORSet.js` defines `ORSet` as a `@typedef {Object}` but
it has 10+ functions operating on it (add, remove, join, compact, contains,
encode). This is a full CRDT data structure — should be a class.
