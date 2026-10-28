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
| Render a graph-shaped derived view | `charts` subpath |

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

## How Readings Are Answered

A Lane needs no preparation step: it is readable immediately after its writes,
with or without a checkpoint. Each Observation advances the Lane's clone-local
cone basis once, folding only the writer patches that are new since this clone
last looked into per-entity records, and every Reading of that Observation
answers from that one basis. A property or existence Reading opens one node
record; a neighborhood Reading opens the node's incident edges and their other
endpoints. The cost of an Observation therefore follows what it reads, not the
size of the graph or the length of its history. Content Observations read the
owner's attachment registers and liveness from the same records.

When folding the new patches is obstructed, the Observation settles with
status `obstructed` (reason `cone_shared_dot` or `cone_writer_diverged`) or
`underdetermined` (reason `cone_contended`) and a repair hint; see
[Troubleshooting](troubleshooting.md#a-read-or-write-is-obstructed-by-the-cone-basis).

## See Concurrent Edits

Two clones can replace the same property while neither has seen the other's
write. Last-writer-wins still decides the Reading's `value`, identically on
every clone, but the Reading no longer hides the value it replaced:
`reading.plurality` lists what raced.

```typescript
const body = await comments.observe(
  margins.observers.commentBody({ comment: 'comment:1' }),
).one();

for (const race of body.plurality) {
  if (race.kind === 'register') {
    console.log(`${race.winner.writer} wrote ${String(race.winner.value)}`);
    for (const sibling of race.siblings) {
      console.log(`concurrently, ${sibling.writer} wrote ${String(sibling.value)}`);
    }
  } else {
    console.log(`${race.removedBy.join(', ')} deleted it while ${race.editedBy.join(', ')} edited it`);
  }
}
```

- A `register` plurality names the LWW `winner` and the `siblings` it hides,
  each with its writer. A write that observed every sibling (any write made
  after an Observation that showed them) resolves the race, and later Readings
  report no plurality.
- A `lifecycle` plurality reports a delete that raced an edit or re-add of the
  same node (on a property or existence Reading) or edge (on the first page of
  a neighborhood Reading). The value is still what the CRDT join decided: an
  observed remove hides the concurrent edit, and a concurrent add survives the
  remove.
- `causality` is `underdetermined` when a write involved recorded no causal
  context (patches from before conflict visibility, or deprecated facade
  writes), so the race may be an artefact of missing history. `overflow`
  counts concurrent values beyond the 16 each register keeps.
- `ReadReceipt.plurality` carries the same list, and the CLI renders it as a
  `plurality` field on each Reading line.

A race is decided by what each write recorded as observed. A Lane write that
only sets properties records the cone basis this clone held when the write
began, which is what its Observations had read; values fetched since then and
not yet read stay concurrent with it. Such a write is admitted `plural` instead
of `derived`, and its `WriteReceipt.plurality` lists the values it raced. A
write that removes or attaches content reads the records it changes and
records that newer basis.

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
