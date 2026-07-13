# Querying

The v19 root API exposes bounded application readings. It deliberately does
not expose the broad graph query, worldline, or materialization handles from
earlier releases.

## Choose The Surface

| Need                                  | Surface                              |
| ------------------------------------- | ------------------------------------ |
| Read one known property               | `reading.property(...)`              |
| Check whether one known node exists   | `reading.node.exists(...)`           |
| Read one bounded adjacency page       | `reading.neighborhood(...)`          |
| Inspect a receipt                     | `diagnostics` subpath                |
| Capture a formal coordinate and optic | `advanced` subpath                   |
| Run operator-oriented graph commands  | `git warp query`, `path`, or `optic` |

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

## Read A Neighborhood

```typescript
const dependencies = await team.read(
  reading.neighborhood({
    subject: 'task:auth',
    direction: 'out',
    labels: ['dependsOn'],
    limit: 100,
  })
);

console.log(dependencies.value);
console.log(dependencies.receipt.evidence);
```

Neighborhood reads return one page in deterministic index order; they do not
promise lexical node-ID ordering. The default page size is 100 and the maximum
accepted `limit` is 1,000. When `value.cursor` is non-null, pass that opaque
cursor unchanged with the same subject, direction, and labels to read the next
page. Cursors are bound to the checkpoint basis and must not be reused after
that basis advances.

When the required checkpoint-tail basis is absent, a reading returns `null`
with an `obstructed` receipt and `repairHints`. It never falls back to broad
materialization. `readValue()` converts that unresolved result into an
exception for callers that explicitly prefer convenience over receipt control
flow.

## Unsupported Root Queries

The root does not currently provide wildcard matching, arbitrary traversal,
aggregation, arbitrary traversal, or draft reads. Do not recover
those APIs by importing internal modules. Use the operator CLI or an explicit
expert surface where one exists, and keep application code on readings.

This boundary is intentional: a broad materialization call must not masquerade
as a bounded read.

## Diagnostics

`@git-stunts/git-warp/diagnostics` exports `inspectReceipt()`. It accepts the
same write, read, and join receipts returned by the root API and does not
require an internal runtime host.

## Advanced Read Machinery

`@git-stunts/git-warp/advanced` exports `Coordinate`, executable `Optic`, and
the type-only `Witness`. Capture a coordinate with `timeline.coordinate()`;
ordinary application reads should continue to use `reading.*`.

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
