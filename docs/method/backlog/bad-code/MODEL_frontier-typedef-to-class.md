---
id: MODEL_frontier-typedef-to-class
blocked_by: []
blocks: []
feature: merge-strands-worldlines
release_home: v20.0.0
---

# Frontier is a typedef alias for Map with 9 free functions

**Effort:** M

## What's Wrong

`Frontier.js` defines `Frontier` as a `@typedef` for `Map<string,string>`
with 9 module-level functions (`create`, `update`, `get`, `getWriters`,
`serialize`, `deserialize`, `clone`, `fingerprint`, `merge`). This is a
domain concept with identity, invariants, and behavior -- but no class.
Violates Rule 0 (runtime truth wins) and P1 (domain concepts require
runtime-backed forms). Also imports `defaultCodec`, violating P5
(serialization is the codec's problem).

## Suggested Fix

- Promote `Frontier` to a proper class owning `update`, `get`,
  `getWriters`, `clone`, `fingerprint`, and `merge` as instance methods.
- Constructor validates input (non-empty writer IDs, valid SHAs).
- Move `serialize`/`deserialize` to a codec or infrastructure adapter.
- Remove the `defaultCodec` import from the domain module.
