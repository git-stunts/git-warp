# Kill the _host bag pattern across all controllers

## The sludge

Every controller receives `_host` (a WarpRuntime reference) and
reaches into its internals: `_host._cachedState`, `_host._blobStorage`,
`_host._persistence`, `_host._crypto`, etc. This is the god object
in disguise — the controllers are coupled to WarpRuntime's private
fields, not to typed contracts.

Splitting controllers into smaller files just distributes the same
bag access across more files. The coupling stays.

## The fix

Each controller's constructor takes **typed, specific dependencies** —
not a host reference, not a "context bag", not a "deps object."

```typescript
// SLUDGE — bag injection
class QueryController {
  constructor(host: WarpRuntime) { this._host = host; }
  hasNode(id) { return this._host._cachedState.nodeAlive.contains(id); }
}

// CLEAN — specific deps
class QueryController {
  constructor(
    private readonly state: MaterializedStateProvider,
    private readonly index: IndexProvider,
    private readonly blobs: BlobStoragePort,
  ) {}
  hasNode(id) { return this.state.current().nodeAlive.contains(id); }
}
```

## Affected controllers

All 9: MaterializeController, QueryController, PatchController,
CheckpointController, SyncController, StrandController,
ComparisonController, ProvenanceController, ForkController.

## Dependency

Depends on capability interfaces being defined first. The interfaces
define what each controller needs; the factory wires the real
implementations.
