---
id: PORT_persistence-port-instanceof
blocked_by: []
blocks: []
feature: materialization-query-index
release_home: v17.0.0
---

# GraphPersistencePort uses Object.defineProperty breaking instanceof

**Effort:** M

## What's Wrong

`GraphPersistencePort` and `IndexStoragePort` use
`Object.defineProperty` to compose focused port methods at runtime.
This means `instanceof BlobPort`, `instanceof CommitPort`, etc. return
`false` for any persistence instance. This is a P7 violation --
`instanceof` dispatch is the prescribed mechanism for runtime type
discrimination, but the composition strategy silently breaks it.

## Suggested Fix

- **Option A**: Use proper class inheritance via mixins so that
  `instanceof` checks work correctly for all composed ports.
- **Option B**: Accept that focused ports are structural contracts
  (duck typing), stop using `instanceof` checks against them, and
  document that they are protocol-based, not class-based.
- Either way, the current approach of pretending to be a class
  hierarchy while breaking its fundamental dispatch mechanism must
  be resolved.
