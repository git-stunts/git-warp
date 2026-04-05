# Worldline reaches into 13+ WarpRuntime private fields

**Effort:** M

## What's Wrong

`Worldline.js` accesses `graph._persistence`, `graph._graphName`,
`graph._writerId`, and 10+ more private fields on WarpRuntime. It
double-casts `self` to WarpRuntime via `/** @type {unknown} */` to
bypass type checking, then casts away `instanceof` results after
checking them. This is a massive encapsulation violation combined with
Rule 0 lying casts -- the type system says one thing while the runtime
does another.

## Suggested Fix

- Extract a `RuntimeContext` interface or port that exposes the fields
  Worldline actually needs (persistence, graphName, writerId, etc.)
  through a clean contract.
- Have WarpRuntime pass a context object to Worldline instead of
  exposing its internals.
- Alternatively, if Worldline is inherently coupled to WarpRuntime,
  make it a proper inner collaborator with explicit dependency injection.
