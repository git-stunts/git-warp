# readTreeOids mocks returned [] instead of {} (type contract violation)

**Effort:** XS

## What's Wrong

Three test files had `readTreeOids` mocks returning `[]` (empty array)
instead of `{}` (empty object). `TreePort.readTreeOids()` contract is
`Record<string, string>`. This violated the type contract silently
because `Object.entries([])` is `[]`. Found by CodeRabbit review.

The instances are already fixed, but the underlying weakness remains:
nothing prevents future mocks from returning the wrong shape.

## Suggested Fix

Add a JSDoc/tsc assertion to `createMockPersistence()` ensuring
`readTreeOids` returns `Record<string, string>`, not `any[]`. Consider
a runtime shape check in debug builds or test helpers.
