# Querying

The v19 root API exposes bounded application observations. It deliberately
does not expose the broad graph query, worldline, materialization, or storage
handles from earlier releases.

## Choose The Surface

| Need | Surface |
| --- | --- |
| Read one known application fact | Generated `Observer` + `Observation.one()` |
| Stream bounded application results | Generated `Observer` + `for await` |
| Inspect an observation outcome | `Observation.receipt` |
| Inspect lower-level substrate provenance | `diagnostics` subpath |
| Capture a formal coordinate and optic | `advanced` subpath |
| Run operator-oriented graph commands | `git warp query`, `path`, or `optic` |

The `advanced` and `diagnostics` subpaths expose expert components, not a
second graph-first application facade.

## Open A Runtime And Lane

`Runtime` owns the production adapters and their lifecycle. Application code
opens a Runtime and asks it for a Lane; it does not construct `GitStorage` or
call `openWarp`.

```typescript
import { Runtime } from '@git-stunts/git-warp';
import { users } from './generated/users.js';

const runtime = await Runtime.open({
  at: '.',
  writer: 'alice',
});
const team = await runtime.lane('team');
```

Generated SDKs provide immutable, validated observers for the application
schema. The examples below use representative `users.observers.*` builders;
the names and value types in a generated SDK come from its Wesley schema.

## Read One Value

Pass a generated Observer to `Lane.observe()`. An exactly-one Observer supports
the `Observation.one()` convenience consumer:

```typescript
const roleObservation = team.observe(
  users.observers.roleOf({
    subject: 'user:alice',
  }),
);

const role = await roleObservation.one();
const receipt = await roleObservation.receipt;

console.log(role.value);
console.log(receipt.status);
```

The Observation is dormant until its readings or receipt are first demanded.
`one()` consumes the single Reading and joins the same execution represented by
`receipt`; it does not issue a second query.

## Check Existence

Existence is an application fact, so it is also modeled by a generated
Observer rather than a root `reading.node.exists()` registry:

```typescript
const existence = team.observe(
  users.observers.exists({
    subject: 'user:alice',
  }),
);

const reading = await existence.one();
console.log(reading.value);
console.log((await existence.receipt).status);
```

The generated Observer declares its cardinality, bounds, capability needs, and
formal optic. Application code supplies domain parameters, not graph
traversal machinery.

## Stream Bounded Results

Use the Observation as an async iterable when an Observer can emit multiple
Readings:

```typescript
const reports = team.observe(
  users.observers.directReports({
    manager: 'user:alice',
    limit: 100,
  }),
);

for await (const report of reports) {
  console.log(report.value);
}

const receipt = await reports.receipt;
console.log(receipt.status, receipt.evidence);
```

Iteration is the sole Reading consumer for that Observation. Awaiting
`receipt` after iteration joins the same execution. Awaiting `receipt` first
instead selects drain-and-discard delivery, which is useful when only the
terminal outcome matters.

Bounds and continuation data belong to the generated Observer contract.
Opaque continuation values must be passed back unchanged to the same observer
builder and basis; applications must not infer ordering or decode them.

## Handle An Unresolved Observation

An ObservationReceipt has status `completed`, `obstructed`, or
`underdetermined`. When control flow depends only on that terminal status,
await the receipt directly:

```typescript
const probe = team.observe(
  users.observers.roleOf({
    subject: 'user:alice',
  }),
);
const receipt = await probe.receipt;

if (receipt.status !== 'completed') {
  console.error(receipt.reason, receipt.repairHints);
}
```

Receipt-first demand deliberately drains any emitted Readings. Create a new
Observation when the application needs to consume values after a receipt-only
probe.

An operational obstruction never falls back to broad materialization. The
receipt carries the defined terminal status and any repair hints.

## Unsupported Root Queries

The root does not provide wildcard matching, arbitrary traversal, aggregation,
or draft reads. Do not recover those APIs by importing internal modules. Use a
generated bounded Observer, the operator CLI, or an explicit expert surface
where one exists.

This boundary is intentional: a broad materialization call must not masquerade
as a bounded observation.

## Diagnostics

`Observation.receipt` is the normal application-level diagnostic record. It
reports the Lane, Observer, writer, terminal status, evidence, reason, and
repair hints without exposing storage adapters.

`@git-stunts/git-warp/diagnostics` remains an expert surface for inspecting
lower-level write/read/join substrate receipts when the caller already owns the
required expert storage context. Do not open a second storage handle merely to
query through the Runtime API.

## Advanced Read Machinery

`@git-stunts/git-warp/advanced` exports `captureCoordinate()`, `Coordinate`,
executable `Optic`, and the type-only `Witness`. Capture a coordinate with
`captureCoordinate(lane)`; ordinary application reads should continue to use
generated Observers.

## Close The Runtime

After the final write or observation, close the Runtime to release its local
Git and git-cas resources. This does not change admitted history, receipts, or
retention anchors.

```typescript
await runtime.close();
```

For structured cleanup, `Runtime` also implements `Symbol.asyncDispose`.
Repeated close requests are idempotent.

## Removed Compatibility Surface

The graph-first `openWarpWorldline()` and `openWarpGraph()` package exports, the
root `openWarp()` factory, and the `reading.*` registry are removed in v19.
Keep an unmigrated consumer on v18 until it can use Runtime/Lane/Observer, the
CLI, or an explicit expert integration.

## See Also

- [Getting started](getting-started.md)
- [v19 Public API](api/)
- [Optic reads](optic-reads.md)
- [Strands](strands.md)
- [v19 migration guide](../migrations/v19/)
