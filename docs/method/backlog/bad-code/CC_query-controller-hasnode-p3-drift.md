# QueryController.hasNode assigned via external prototype mutation

**Effort:** XS

`QueryController.js` contains a standalone `hasNode` function that
uses `this` binding and is assigned to `WarpRuntime.prototype`
externally. This is a P3 violation — behavior lives outside the
type that owns it.

## What's wrong

- **P3 drift**: The function uses `this` but is not a method of the
  class it belongs to.
- Invisible to readers of either `QueryController` or `WarpRuntime`.
- It can't be tested through the controller's own interface.

## Suggested fix

Move `hasNode` to a proper method on `QueryController`. Delegate
from `WarpRuntime` via the existing controller dispatch pattern.
