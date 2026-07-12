# v19 Public API Reflection

This note records the implemented v19 public API line. The target is
not to make `git-warp` less precise. The target is to stop making first-use
application code learn substrate language before it can do useful work.

The slogan is:

```text
Write intents. Read timelines. Keep receipts.
```

That is the public story. The architecture underneath can keep its exact WARP
terms, but the package boundary should be small, boring, and difficult to misuse.

## Why Change

The v18 public story is already moving in the right direction. It describes
`git-warp` as causal history first, with bounded reads, append-only writes,
provenance, and deterministic multi-writer behavior.

The problem is that the first-use API still makes users meet too much of the
implementation too early:

- `openWarpWorldline()`;
- `GitGraphAdapter`;
- `commit((patch) => ...)`;
- `coordinate()`;
- `optic()`;
- `openWarpGraph()`;
- graph-shaped entities and operation builders exported from root.

Those names are not all wrong. Many are accurate. The issue is that they are
not the best package boundary for application authors, agents, and higher-level
runtimes such as XYPH and Continuum.

The root API should say what users are doing:

- write an intent;
- read a timeline;
- inspect a receipt.

The root API should not make users think in graph substrate terms.

## Public Vocabulary

The preferred v19 root vocabulary is:

```text
Warp
Timeline
Intent
Reading
Tick
Receipt
ReceiptOutcome
```

`Reader` and `Writer` remain useful role or port names, but they should not be
the headline README characters. Most users should not need to create a reader
and writer before they understand the simpler timeline model.

The preferred first-use imports are:

```typescript
import { openWarp, intent, reading } from '@git-stunts/git-warp';
```

Storage adapters belong behind an explicit storage subpath:

```typescript
import { GitStorageAdapter } from '@git-stunts/git-warp/storage';
```

Advanced WARP vocabulary remains available where it is genuinely the right
tool:

```text
Optic
Coordinate
Witness
Worldline
Strand
Braid
Hologram
```

Those terms should live in advanced, diagnostics, or internal surfaces, not in
the first-use root API.

## Root Shape

The v19 quick-start shape should look like this:

```typescript
import { openWarp, intent, reading } from '@git-stunts/git-warp';
import { GitStorageAdapter } from '@git-stunts/git-warp/storage';
import GitPlumbing from '@git-stunts/plumbing';

const warp = await openWarp({
  storage: new GitStorageAdapter({
    plumbing: new GitPlumbing({ cwd: '.' }),
  }),
  writer: 'agent-1',
});

const timeline = await warp.timeline('events');

await timeline.write(
  intent.node.add({
    subject: 'user:alice',
  })
);

const write = await timeline.write(
  intent.property.set({
    subject: 'user:alice',
    key: 'role',
    value: 'admin',
  })
);

switch (write.outcome) {
  case 'accepted':
    console.log(write.patchSha);
    break;
  case 'obstructed':
  case 'conflicted':
  case 'underdetermined':
  case 'rejected':
    console.log(write.reason ?? write.outcome);
    break;
}

const role = await timeline.read(
  reading.property({
    subject: 'user:alice',
    key: 'role',
  })
);

console.log(role.value);
console.log(role.receipt);
```

The read path should return a result object, not a naked value. Provenance is
the normal path, not an afterthought:

```typescript
const result = await timeline.read(
  reading.property({
    subject: 'user:alice',
    key: 'role',
  })
);

result.value;
result.receipt;
```

A convenience method such as `readValue()` can exist, but it should be clearly
documented as the provenance-light path.

## Intent Builders

Generic intent envelopes are useful, but they should not be the only happy
path. This is too easy to turn into typed JSON by convention:

```typescript
intent({
  type: 'user.role.assign',
  subject: 'user:alice',
  payload: { role: 'admin' },
});
```

The root should ship semantic builders for common causal writes:

```typescript
intent.property.set({
  subject: 'user:alice',
  key: 'role',
  value: 'admin',
});

intent.node.add({
  subject: 'user:alice',
});

intent.edge.add({
  from: 'user:alice',
  to: 'team:ops',
  label: 'memberOf',
});
```

Domain-specific builders can be layered by application code, but the root API
should keep returning runtime-backed `Intent` values:

```typescript
function assignRole(subject: string, role: string) {
  return intent.property.set({
    subject,
    key: 'role',
    value: role,
  });
}

await timeline.write(assignRole('user:alice', 'admin'));
```

The builder output should be a runtime-backed value, not loose shape trust.

## Readings And Optics

The public API should lead with `reading`.

```typescript
await timeline.read(
  reading.property({
    subject: 'user:alice',
    key: 'role',
  })
);
```

The formal model remains:

```text
A Reading is the bounded question.
An Optic is the formal execution and proof shape.
```

In v18, users often need to call `prepareOpticBasis()`, capture a coordinate,
and read through `optic()`. That discipline is correct, but it should be
internal ceremony for the first-use path.

The v19 `timeline.read(reading)` flow is the public shape. Advanced bounded
read paths can still lower readings to optics internally:

1. validate the `Reading`;
2. lower `Reading` to `Optic`;
3. prepare or check an optic basis;
4. capture the observer position;
5. execute the bounded read;
6. return `ReadingResult` and `ReadReceipt`.

Operational uncertainty should return receipt outcomes where possible.
Programmer errors, corruption, impossible states, and violated invariants may
still throw typed errors.

## Receipts As Control Flow

Receipts should become the normal control-flow object.

```typescript
const receipt = await timeline.write(assignRole('user:alice', 'admin'));

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

The receipt outcome axis should stay clean:

```text
accepted
obstructed
conflicted
underdetermined
rejected
```

Do not mix operation types into outcomes. `joined`, `synced`, `staged`, and
`materialized` describe operations or states, not the outcome axis.

Use separate result classes (`WriteReceipt`, `ReadReceipt`, and later join
receipts), not one overloaded status string.

## Timelines, Drafts, And Joins

Use `Timeline` publicly.

Internally:

```text
Timeline        -> public handle
Worldline       -> committed causal history
Strand          -> speculative lane
Braid           -> deterministic lane composition
```

Public speculative work reads like this:

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
  const joined = await timeline.join(draft);
  console.log(joined.receipt);
}
```

Use `previewJoin()`, not `join({ dryRun: true })`. A dedicated preview method
avoids boolean-trap API design and makes the two phases explicit.

`Braid` remains the expert term. Root users should see `join`.

## Tick And Coordinate

Future ergonomic public time travel should use `Tick`:

```typescript
const tick = await timeline.tick();

const roleAtTick = await timeline.at(tick).read(
  reading.property({
    subject: 'user:alice',
    key: 'role',
  })
);
```

Use `Coordinate` for formal evidence and proof posture on advanced surfaces.
Do not make first-use application examples import coordinate machinery.

```text
public: tick handle
advanced: coordinate evidence
```

That split lets casual users keep a simple handle while advanced users and
receipts retain the exact observer position.

## What Leaves Root

The v19 root should not export graph substrate.

Remove from root:

```text
GraphNode
GraphPersistencePort
GitGraphAdapter
InMemoryGraphAdapter
GraphOpAlgebraProjection
GraphDiff
openWarpGraph
PatchBuilder
PatchSession
createNodeAdd
createEdgeAdd
createPropSet
publicGraphSubstrate
```

Use explicit subpaths:

```text
@git-stunts/git-warp/storage
@git-stunts/git-warp/advanced
@git-stunts/git-warp/diagnostics
```

The boundaries mean different things:

| Surface       | Meaning                                                 |
| ------------- | ------------------------------------------------------- |
| Root          | first-use product API                                   |
| `storage`     | supported persistence adapters                          |
| `advanced`    | formal WARP nouns for expert use                        |
| `diagnostics` | inspection, materialization, replay, and operator tools |

Do not turn `advanced` into a junk drawer. Symbols that exist only for removed
graph-first consumers are not part of the v19 package boundary.

## Migration Map

Each old root symbol needs one explicit disposition:

| v18 root symbol          | v19 disposition                                            |
| ------------------------ | ---------------------------------------------------------- |
| `openWarpWorldline()`    | `openWarp().timeline(name)`                                |
| `GitGraphAdapter`        | `GitStorageAdapter` from `storage`                         |
| `InMemoryGraphAdapter`   | `MemoryStorageAdapter` from `storage`                      |
| `commit((patch) => ...)` | `timeline.write(intent.*)`                                 |
| `coordinate()`           | `tick()` publicly, `Coordinate` in advanced/evidence       |
| `optic()`                | `timeline.read(reading.*)` or `advanced`                   |
| `openWarpGraph()`        | removed; replace diagnostics with explicit diagnostic APIs |
| `PatchBuilder`           | removed; use intent builders                               |
| `GraphDiff`              | `diagnostics`                                              |
| graph op creators        | removed; use intent builders                               |

The compatibility story should be honest:

```text
Root is clean.
Graph-first compatibility exports are gone.
Diagnostics are for operators.
Advanced is for formal WARP work.
```

## Non-Goals

Do not remove internal graph mechanics from the runtime in this API cut. The
runtime can still use graph-shaped storage and graph-shaped diagnostic
readings. The v19 line is about the public package boundary.

Do not call receipts proofs unless the runtime really proves the claimed
relation. Prefer:

```text
receipt
evidence
witness
support
```

Reserve stronger words such as `proof`, `verified`, and `guaranteed` for
relations the implementation actually verifies.

Do not make users learn `Hologram` in the root API. Hologram is architecture
vocabulary. Receipt is product vocabulary.

## Design Rule

The architecture can stay exact. The package boundary must be humane.

The root API should make the unusual machinery feel inevitable:

```text
Write intents.
Read timelines.
Keep receipts.
```
