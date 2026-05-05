---
id: MODEL_versionvector-constructor-no-validation
blocked_by: []
blocks: []
feature: merge-strands-worldlines
release_home: v20.0.0
---

# VersionVector constructor accepts undefined entries

**Effort:** S

## What's Wrong

`new VersionVector()` (no args) sets `#entries` to `undefined`. Any
subsequent method call (`merge`, `get`, `[Symbol.iterator]`) throws a
confusing `TypeError: undefined is not iterable`. The constructor
should reject missing or non-Map arguments per P2 (boundary validation).

## Suggested Fix

Add validation to the constructor:

```js
class VersionVector {
  constructor(entries) {
    if (!(entries instanceof Map)) {
      throw new CrdtError('VersionVector requires a Map<string, number>');
    }
    this.#entries = entries;
  }
}
```

## Source

Discovered during cycle 0009 reducer integration tests.
