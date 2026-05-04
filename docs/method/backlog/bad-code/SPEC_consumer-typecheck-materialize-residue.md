---
id: SPEC_consumer-typecheck-materialize-residue
blocked_by: []
blocks: []
feature: api-capabilities
release_home: v17.0.0
---

# Consumer typecheck still expects public materialization

**Effort:** S

## What's Wrong

`npm run typecheck:consumer` fails because
`test/type-check/consumer.ts` still expects the removed public
materialization surface:

- `graph.materialize()`
- `graphBag.materialize.materialize()`

That consumer suite is supposed to be the executable public contract.
Right now it contradicts the v17 direction and blocks release.

## Suggested Fix

Rewrite the consumer typecheck around the v17 reading surface. Add
positive cases for `openWarpGraph()`, query/worldline/observer/optic
reads, checkpoint capability access, and sync capability access. Add
negative cases proving public materialize calls do not typecheck.
