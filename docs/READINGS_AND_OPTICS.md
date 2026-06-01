# Readings And Optics

Use this guide when you are building an app, agent workflow, or local-first tool
on top of `git-warp` and need to choose the right public read surface.

The v18 first-use path is:

```text
openWarpWorldline() -> worldline.commit() -> worldline.live(), worldline.seek(), worldline.observer()
openWarpWorldline() -> worldline.prepareOpticBasis() -> worldline.coordinate() -> coordinate.optic()
```

Application code should write claims through `WarpWorldline.commit()` and read
admitted truth through live or pinned worldlines, observers, and coordinate
Optics.
`openWarpGraph()` remains supported for compatibility, migration evidence,
diagnostics, and substrate tooling, but it is no longer the surface new
application code should reach for first.

Current v18 read shapes are cost-labeled in
[PUBLIC API COSTS](PUBLIC_API_COSTS.md). Live exact reads, queries, observers,
coordinate capture, and coordinate Optics are first-use friendly shapes, but
their current providers are `transitional` until the bounded-memory gate lands.

## Core Contract

A **reading** is a read basis over causal history. It answers "from which
worldline, coordinate, strand, or aperture am I allowed to see?"

A **coordinate** is the public stable read position for coherent Optics. It
captures a checkpoint-tail basis plus a worldline frontier. If the live
worldline advances after the coordinate is captured, reads through that
coordinate keep answering from the captured position.

An **optic** is the bounded question asked over a reading. It answers "which
node, edge, neighbor set, traversal, or query result do I want?"

The public read contract is intentionally direct:

```typescript
const events = await openWarpWorldline({
  persistence,
  worldlineName: 'events',
  writerId: 'agent-1',
});

await events.commit((patch) => {
  patch.addNode('task:auth').setProperty('task:auth', 'status', 'open');
});

const props = await events.live().getNodeProps('task:auth');
```

You do not need to fold the whole graph before reading. The capability you reach
for in app code is the read surface that names the basis you mean.

## Live Worldline Reading

Use a live worldline for normal product reads against the current admitted
history.

```typescript
const live = events.live();

const task = await live.getNodeProps('task:auth');

const openTasks = await live.query()
  .match('task:*')
  .where({ status: 'open' })
  .run();

const path = await live.traverse.shortestPath('task:auth', 'service:login', {
  dir: 'out',
});
```

`events.live()` names a live reading basis. It does not expose graph-wide
materialization, substrate mutation controls, or diagnostic internals.

## Pinned Coordinate Reading

Use a pinned coordinate when you want to read an earlier causal view.

```typescript
const beforeReview = await events.seek({
  source: {
    kind: 'coordinate',
    frontier: { alice: 'abc123...' },
    ceiling: 12,
  },
});

const taskBeforeReview = await beforeReview.getNodeProps('task:auth');
```

Pinned readings keep historical inspection in the read model. Application code
does not reconstruct old state by replaying patches itself.

For coordinate Optics, capture the coordinate from the `WarpWorldline` handle
after verifying the checkpoint-tail basis:

```typescript
await events.prepareOpticBasis();
const coordinate = await events.coordinate();

const status = await coordinate
  .optic()
  .node('task:auth')
  .prop('status')
  .read();
```

## Observer Reading

Use an observer when a consumer should see only part of a worldline.

```typescript
const publicAperture = {
  match: ['task:*', 'service:*'],
  redact: ['internalNotes', 'exploitSteps'],
};

const publicView = await events.observer('public-review', publicAperture);
const visibleTask = await publicView.getNodeProps('task:auth');
```

Observers are the normal way to express product boundaries such as redaction,
tenant scoping, or role-specific views.

## Optic Reading

Use an optic when the product needs a bounded, named question over a captured
coordinate.

```typescript
await events.prepareOpticBasis();
const coordinate = await events.coordinate();

const status = await coordinate
  .optic()
  .node('task:auth')
  .prop('status')
  .read();
```

Foundation optics are deliberately narrower than general reads. They reject
unbounded or unsupported bases instead of silently falling back to a whole-graph
fold. `prepareOpticBasis()` verifies existing checkpoint-tail basis evidence; it
does not create that evidence by materializing the full graph. If basis
verification, coordinate capture, or an optic reports
`E_OPTIC_NO_BOUNDED_BASIS`, repair or build the checkpoint-tail basis through operator
tooling, or use a live worldline or observer read when you do not need Optic
identity.

Coordinate Optics avoid full graph materialization, but remain `transitional`
until gate 2 adds memory-budgeted basis verification, frontier capture, and tail
providers.

`events.optic()` remains a convenience for one-off live optic reads when a
checkpoint-tail basis already exists. It is not the coherent multi-read boundary. If two
awaited reads must describe the same causal position, use one captured
coordinate for both reads.

Coordinate Optics report ordinary absence as data, not as an exception:

- a missing or blank node id reads as `{ nodeId, alive: false, readIdentity }`;
- a missing or blank property key reads as
  `{ nodeId, key, exists: false, value: undefined, readIdentity }`.

Evidence failures are different. `E_OPTIC_TAIL_BUDGET_EXCEEDED` means the
bounded tail is longer than the configured read budget, so refresh the
checkpoint basis or retry with an intentional larger budget when that surface is
available. `E_OPTIC_READ_IDENTITY` means the evidence envelope itself is invalid
and should be treated as an integrity failure, not a missing value.

## Strand Reading

Use a strand when you are exploring speculative work that should not land in the
live worldline yet.

```typescript
const graph = await openWarpGraph({
  persistence,
  graphName: 'events',
  writerId: 'agent-1',
});

const strand = await graph.strands.createStrand({
  strandId: 'review-auth',
  owner: 'alice',
  intent: 'try a safer auth rollout',
});

await strand.patch((patch) => {
  patch.setProperty('task:auth', 'status', 'review');
});

const preview = await graph.strands.analyzeConflicts({ strandId: 'review-auth' });
```

Strands are still exposed through the lower-level graph capability bag because
they are write lanes with their own provenance and diagnostic controls. Read
them through strand and comparison capabilities instead of copying their data
into a second graph.

## Checkpoint-Backed Readings

Checkpoints are operational artifacts that make replay cheaper and release state
easier to validate. They do not change the public app read path, and first-use
application docs should not teach checkpoint creation as a way to fold a large
graph into memory.

If a checkpoint exists, the substrate may use it behind the read basis. The
caller still names the reading or optic it wants.

## Provenance And Diagnostics

Use provenance when you need to explain where a value came from or why a write
lost.

```typescript
const patchShas = await graph.provenance.patchesFor('task:auth');

for (const patchSha of patchShas) {
  const patch = await graph.provenance.loadPatchBySha(patchSha);
  console.log(patchSha, patch.ops.length);
}
```

Entity-scoped provenance replay and command-line inspection are substrate and
tooling concerns. They are useful for diagnostics, but they are not the public
first-use read path for application code.

## Choosing A Surface

| Goal | Use |
| --- | --- |
| Start a new application workflow | `openWarpWorldline()` |
| Commit admitted worldline truth | `worldline.commit(...)` |
| Read current truth | `worldline.live()` |
| Read historical truth | `worldline.seek({ source: ... })` |
| Read a filtered view | `worldline.observer(...)` |
| Traverse visible structure | `worldline.live().traverse` |
| Query visible structure | `worldline.live().query()` |
| Prepare coordinate Optics | `worldline.prepareOpticBasis()` |
| Capture a coherent optic coordinate | `worldline.coordinate()` |
| Ask a bounded optic question | `coordinate.optic()` |
| Inspect provenance | `graph.provenance` |
| Create an operational snapshot | `graph.checkpoint` |
| Explore speculative work | `graph.strands` |

## Migration Notes

Older examples sometimes taught `openWarpGraph()` plus explicit graph query
capabilities before querying. In v18, prefer a worldline handle:

```typescript
const events = await openWarpWorldline({
  persistence,
  worldlineName: 'events',
  writerId: 'agent-1',
});

const props = await events.live().getNodeProps('task:auth');
```

Use `openWarpGraph()` only when you deliberately need compatibility,
diagnostic, migration, provenance, checkpoint, sync, or speculative strand
capabilities that are outside the first-use `WarpWorldline` handle.

If a runtime error says no live reading basis is available, open a worldline,
pin a coordinate, or create an observer that matches the operation you are
trying to perform.
