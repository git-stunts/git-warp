# Querying

The v19 root API exposes bounded application readings. It deliberately does
not expose the broad graph query, worldline, or materialization handles from
earlier releases.

## Choose The Surface

| Need                                                 | Surface                              |
| ---------------------------------------------------- | ------------------------------------ |
| Read one known property                              | `reading.property(...)`              |
| Check whether one known node exists                  | `reading.node.exists(...)`           |
| Inspect comparison or visible-state diagnostics      | `diagnostics` subpath                |
| Work with formal optics, observers, or support plans | `advanced` subpath                   |
| Run operator-oriented graph commands                 | `git warp query`, `path`, or `optic` |

The `advanced` and `diagnostics` subpaths expose expert components, not a
second graph-first application facade.

## Read A Property

```typescript
import { openWarp, reading } from '@git-stunts/git-warp';
import { GitStorageAdapter } from '@git-stunts/git-warp/storage';

const warp = await openWarp({
  storage: new GitStorageAdapter({ plumbing }),
  writer: 'alice',
});
const team = await warp.timeline('team');

const status = await team.read(
  reading.property({
    subject: 'task:auth',
    key: 'status',
  })
);

console.log(status.value);
console.log(status.receipt);
```

## Check Node Existence

```typescript
const task = await team.read(
  reading.node.exists({
    subject: 'task:auth',
  })
);

console.log(task.value);
console.log(task.receipt.outcome);
```

## Unsupported Root Queries

The root does not currently provide wildcard matching, arbitrary traversal,
aggregation, historical coordinate selection, or draft reads. Do not recover
those APIs by importing internal modules. Use the operator CLI or an explicit
expert surface where one exists, and keep application code on readings.

This boundary is intentional: a broad materialization call must not masquerade
as a bounded read.

## Diagnostics

`@git-stunts/git-warp/diagnostics` exports operator-oriented components such as
`GraphDiff`, `QueryBuilder`, `TtdMergeInspector`, and visible-state scope
helpers. Callers are responsible for supplying their required runtime context.

## Advanced Read Machinery

`@git-stunts/git-warp/advanced` exports formal concepts such as `Optic`,
`Observer`, `BoundedSupportRule`, and `CausalIndexPlan`. These are useful for
proof-oriented or runtime-integration work; they are not first-use query verbs.

## Removed Compatibility Surface

The graph-first `openWarpWorldline()` and `openWarpGraph()` package exports are
removed in v19. Keep an unmigrated consumer on v18 until it can use readings,
the CLI, or an explicit expert integration.

## See Also

- [Getting started](getting-started.md)
- [v19 Public API](api/)
- [Optic reads](optic-reads.md)
- [Strands](strands.md)
- [v19 migration guide](../migrations/v19/)
