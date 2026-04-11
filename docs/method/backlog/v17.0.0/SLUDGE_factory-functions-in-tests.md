---
id: SLUDGE_factory-functions-in-tests
blocks: []
blocked_by: []
status: done
---

# Kill factory sludge in test suite

## Status: DONE (with corrections)

### Shipped (commit 2e99c0cb)

- `createEventId()` deleted from `src/domain/utils/EventId.ts` — replaced
  with `new EventId()` in all 76+ consumer files.
- `createDot()` deleted from `src/domain/crdt/Dot.ts` — replaced with
  `Dot.create()` in all consumer files.
- `createEventId` removed from public API (`index.js`, `index.d.ts`).
- BREAKING CHANGE committed.

### Kept (plan was wrong about these)

The test wire-format factories (`createNodeAddV2()`, `createEdgeAddV2()`,
`createPropSetV2()`, etc.) in `warpGraphTestUtils.js` are **NOT sludge**.
They construct CBOR wire-format plain objects for testing the
decode → reduce pipeline. They are NOT wrappers around domain class
constructors. Replacing them with `new NodeAdd()` would skip the
decode path and change test semantics.

These factories should be renamed to `wireNodeAdd()`, `wireEdgeAdd()`,
etc. to clarify their purpose — but that's a separate cleanup.
