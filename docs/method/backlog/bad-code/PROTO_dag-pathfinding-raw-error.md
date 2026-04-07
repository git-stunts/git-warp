# DagPathFinding throws a raw Error in core code

**Effort:** S

## What's wrong

`src/domain/services/dag/DagPathFinding.js` throws a raw `Error` in its constructor when `indexReader` is missing:

```js
throw new Error('DagPathFinding requires an indexReader');
```

That violates the systems-style doctrine in `docs/SYSTEMS_STYLE_JAVASCRIPT.md`:

- error type is primary; codes are optional metadata
- raw `Error` objects are banned in infrastructure code
- runtime-backed domain failures should be explicit

This file already uses `TraversalError` for operational failures, so the constructor stands out as an inconsistent boundary.

## Suggested fix

- Replace the raw `Error` with a specific runtime-backed error type.
- Either:
  - reuse `TraversalError` with a constructor/configuration code like `E_DAG_INDEX_READER_REQUIRED`, or
  - introduce a narrower error such as `DagPathFindingError` if constructor/configuration failures need to be distinguished from runtime path-finding failures.
- Add a dedicated constructor test that asserts on error type and code, not message text.
