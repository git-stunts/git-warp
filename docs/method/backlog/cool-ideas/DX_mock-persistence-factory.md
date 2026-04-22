---
id: DX_mock-persistence-factory
blocked_by: []
blocks: []
---

# MockPersistenceFactory — typed, complete, safe

**Effort:** S

## Idea

Twenty-plus test files create inline persistence mocks. They're always
incomplete. We patched 22 files in a single session just to add missing
methods like `readTreeOids` that suddenly became required. Every time the
persistence port gains a method, a dozen test files break — not because
the tests are wrong, but because their mocks are incomplete.

What if there were a `MockPersistenceFactory` that generates a fully
`CorePersistence`-typed mock with ALL methods pre-stubbed?

```js
const mock = MockPersistenceFactory.create({
  readRef: async () => 'abc123...',
  listRefs: async () => ['refs/warp/default/writers/alice'],
});
```

Every `CorePersistence` method is covered with sensible defaults:
`readRef` returns `null`, `listRefs` returns `[]`, `readTreeOids`
returns `{}`, `createCommit` returns a fake SHA. Tests override only
what they need. The factory validates at construction that every
`CorePersistence` method is present — if the port adds a new method,
the factory fails to compile (or fails its own unit test), and you add
the default in ONE place.

The factory could also track calls: `mock.calls.readRef` returns an
array of arguments from each invocation. No external spy library needed.
Built-in verification: `mock.assertCalled('createCommit', 3)`.

## Why cool

One class. One place to update when the port changes. Twenty-two fewer
files to patch next time. The mock is always complete, always typed,
always honest. Test setup shrinks from 30 lines of boilerplate to 3
lines of intent.
