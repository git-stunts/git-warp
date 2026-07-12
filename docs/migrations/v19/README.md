# v19 Public API Migration Plan

This migration plan covers consumers moving from v18 or earlier public
surfaces to the planned v19 public API. It is intentionally explicit because
v19 is a major-version boundary: root exports become small and application
oriented, while graph-shaped compatibility surfaces are removed.

The migration target is:

```text
Write intents. Read timelines. Keep receipts.
```

## Migration Principle

Consumers should stop importing graph substrate from package root.

Application code should move to:

```typescript
import { openWarp, intent, reading } from '@git-stunts/git-warp';
```

Storage adapters move to:

```typescript
import { GitStorageAdapter } from '@git-stunts/git-warp/storage';
```

Diagnostics and expert WARP terms move to explicit subpaths:

```text
@git-stunts/git-warp/diagnostics
@git-stunts/git-warp/advanced
```

## Subpath Policy

| Subpath       | Contract                                   |
| ------------- | ------------------------------------------ |
| Root          | first-use public API; no graph substrate   |
| `storage`     | supported persistence adapters             |
| `advanced`    | stable formal WARP concepts for expert use |
| `diagnostics` | operator and inspection tools              |

The former `browser` and `legacy` subpaths do not exist in v19. Consumers must
remove those imports before upgrading.

## Root Import Migration

Before:

```typescript
import { GitGraphAdapter, openWarpWorldline } from '@git-stunts/git-warp';
import GitPlumbing from '@git-stunts/plumbing';

const persistence = new GitGraphAdapter({
  plumbing: new GitPlumbing({ cwd: '.' }),
});

const events = await openWarpWorldline({
  persistence,
  worldlineName: 'events',
  writerId: 'agent-1',
});
```

After:

```typescript
import { openWarp } from '@git-stunts/git-warp';
import { GitStorageAdapter } from '@git-stunts/git-warp/storage';
import GitPlumbing from '@git-stunts/plumbing';

const warp = await openWarp({
  storage: new GitStorageAdapter({
    plumbing: new GitPlumbing({ cwd: '.' }),
  }),
  writer: 'agent-1',
});

const events = await warp.timeline('events');
```

The old names are accurate implementation names, but they leak substrate
concepts. The new names describe the application action.

## Write Migration

Before:

```typescript
await events.commit((patch) => {
  patch.addNode('user:alice').setProperty('user:alice', 'role', 'admin');
});
```

After:

```typescript
import { intent } from '@git-stunts/git-warp';

const receipt = await events.write(
  intent.property.set({
    subject: 'user:alice',
    key: 'role',
    value: 'admin',
  })
);

switch (receipt.outcome) {
  case 'accepted':
    console.log(receipt.patchSha);
    break;
  case 'obstructed':
  case 'conflicted':
  case 'underdetermined':
  case 'rejected':
    console.log(receipt.reason ?? receipt.outcome);
    break;
}
```

`commit((patch) => ...)` is deprecated legacy API. The first-use write surface
is `timeline.write(intent)`.

## Read Migration

Before:

```typescript
const role = await events.live().getNodeProps('user:alice');
```

or:

```typescript
await events.prepareOpticBasis();
const coordinate = await events.coordinate();
const role = await coordinate.optic().node('user:alice').prop('role').read();
```

After:

```typescript
import { reading } from '@git-stunts/git-warp';

const result = await events.read(
  reading.property({
    subject: 'user:alice',
    key: 'role',
  })
);

result.value;
result.receipt;
```

`reading` is the public request. `Optic` remains the advanced execution and
proof shape.

## Time Travel Migration

Before:

```typescript
const historical = await events.seek({
  source: {
    kind: 'live',
    ceiling: 1,
  },
});
```

After:

```typescript
const tick = await events.tick();

const historical = await events.at(tick).read(
  reading.property({
    subject: 'user:alice',
    key: 'role',
  })
);
```

Use `Tick` for public time-travel handles. Use `Coordinate` only where formal
evidence posture matters.

## Speculative Work Migration

Before:

```typescript
const strand = await graph.strands.createStrand('try-admin-role');
await graph.strands.queueStrandIntent(strand.id, (patch) => {
  patch.setProperty('user:alice', 'role', 'admin');
});
await graph.strands.braidStrand(strand.id);
```

After:

```typescript
const draft = await timeline.draft('try-admin-role');

await draft.write(
  intent.property.set({
    subject: 'user:alice',
    key: 'role',
    value: 'admin',
  })
);

const preview = await timeline.previewJoin(draft, {
  policy: 'deterministic',
});

if (preview.receipt.outcome === 'accepted') {
  await timeline.join(draft);
}
```

`Strand` and `Braid` remain formal WARP terms. Public users should see drafts
and joins first.

## Symbol Disposition Table

| v18 or earlier symbol    | v19 path                           | Notes                                             |
| ------------------------ | ---------------------------------- | ------------------------------------------------- |
| `openWarpWorldline()`    | root `openWarp().timeline(name)`   | preferred application opener                      |
| `WarpWorldline`          | root `Timeline`                    | public handle rename                              |
| `GitGraphAdapter`        | `storage` `GitStorageAdapter`      | graph name removed                                |
| `InMemoryGraphAdapter`   | `storage` `MemoryStorageAdapter`   | graph name removed                                |
| `GraphPersistencePort`   | root `WarpStorage` for app options | old graph-shaped port removed from public API     |
| `commit((patch) => ...)` | `timeline.write(intent.*)`         | receipt-returning                                 |
| `PatchBuilder`           | removed                            | replace with intent builders                      |
| `PatchSession`           | removed                            | replace with receipt-returning writes             |
| `createNodeAdd()`        | removed                            | use intent builders                               |
| `createEdgeAdd()`        | removed                            | use intent builders                               |
| `createPropSet()`        | removed                            | use intent builders                               |
| `openWarpGraph()`        | removed                            | replace diagnostics with explicit diagnostic APIs |
| `WarpApp`                | removed                            | no root default export in v19                     |
| `WarpCore`               | removed                            | replace diagnostics with explicit diagnostic APIs |
| `GraphNode`              | removed                            | no public export                                  |
| `GraphDiff`              | `diagnostics`                      | operator-facing comparison                        |
| `Optic`                  | `advanced`                         | readings are root                                 |
| `Coordinate`             | `advanced` or receipt fields       | ticks are root                                    |
| `Observer`               | `advanced`                         | readings are first-use root                       |
| `Strand`                 | `advanced`                         | drafts are first-use root                         |
| `Braid`                  | `advanced`                         | joins are first-use root                          |
| Continuum evidence nouns | `advanced` or `diagnostics`        | receipt evidence stays root-facing                |

## Receipt Outcome Migration

Before, consumers often treated write success as a returned commit SHA or a
thrown exception.

After, consumers should switch on receipt outcomes:

```typescript
const receipt = await timeline.write(
  intent.property.set({
    subject: 'user:alice',
    key: 'role',
    value: 'admin',
  })
);

switch (receipt.outcome) {
  case 'accepted':
    console.log(receipt.patchSha);
    break;
  case 'obstructed':
  case 'conflicted':
  case 'underdetermined':
  case 'rejected':
    console.log(receipt.reason ?? receipt.outcome);
    break;
}
```

The allowed receipt outcome axis is:

```text
accepted
obstructed
conflicted
underdetermined
rejected
```

Operation names such as `join`, `sync`, and `read` belong in distinct receipt
classes or operation fields, not in `receipt.outcome`.

## Suggested Upgrade Sequence

1. Replace root imports with subpath imports while staying on v18 where
   possible.
2. Move persistence imports from root graph adapters to `storage` adapters.
3. Convert `commit((patch) => ...)` calls to `timeline.write(intent.*)` calls.
4. Rewrite direct live/query/optic reads as `timeline.read(reading.*)` calls.
5. Move `seek()`/coordinate-first call sites to `tick()` and `at(tick)`.
6. Move diagnostics, materialization, and graph diff code to explicit
   `diagnostics` APIs.
7. Remove remaining graph-shaped package imports.

## Compatibility Window

The v19 line should not keep old and new APIs side by side in root. That would
make root a mixed contract again.

There is no graph-first compatibility subpath in v19. Keep a consumer on v18
until its graph-shaped imports have been migrated.

## Validation Plan

The v19 migration should land with checks that enforce the new boundary:

- root export audit rejects graph-shaped public symbols;
- consumer typecheck covers `openWarp`, `intent`, `reading`, `Timeline`,
  `Receipt`, and storage subpath imports;
- package-boundary tests reject the removed `browser` and `legacy` subpaths;
- docs reference generator records root, storage, advanced, and diagnostics
  surfaces separately;
- README quick start uses no graph-shaped root import.

## Related Reading

- [v19 public API reflection](../../topics/api/)
- [Supported Outcome Settlement](../../topics/supported-outcome-settlement.md)
- [Optic reads](../../topics/optic-reads.md)
- [Unmaterialized intents](../../topics/unmaterialized-intents.md)
