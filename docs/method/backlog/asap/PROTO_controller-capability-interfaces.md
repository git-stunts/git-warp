# Typed capability interfaces per controller

**Effort:** L

## Idea

Each kernel controller currently accesses `this._host` which is the full
WarpRuntime — 20+ fields, every method. This defeats the purpose of
extraction: the controller can still reach anything.

Instead, each controller gets a typed interface with ONLY the fields
and methods it actually needs:

```javascript
/** @typedef {{
 *   _persistence: CorePersistence,
 *   _graphName: string,
 *   _writerId: string,
 *   _codec: CodecPort,
 *   materialize: () => Promise<WarpStateV5>
 * }} PatchControllerCapabilities */

class PatchController {
  constructor(capabilities) { /* ... */ }
}
```

This is the "port per controller" idea — Interface Segregation at the
controller level. Benefits:
- Each controller's dependencies are explicit and testable
- No accidental coupling to unrelated host state
- Tests can provide minimal stubs instead of full WarpRuntime mocks

## Why not now

The field surface needs to stabilize first. More extractions (WorldlineSource,
strand materialization strategies) may shift which fields each controller
needs. Do this after the dust settles.
