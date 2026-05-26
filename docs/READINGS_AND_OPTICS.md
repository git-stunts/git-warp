# Readings And Optics

Use this guide when you are building an app, agent workflow, or local-first tool
on top of `git-warp` and need to choose the right public read surface.

The v18 first-use path is:

```text
openWarpWorldline() -> worldline.commit() -> worldline.live(), worldline.seek(), worldline.observer(), worldline.optic()
```

Application code should write claims through `WarpWorldline.commit()` and read
admitted truth through live or pinned worldlines, observers, and bounded optics.
`openWarpGraph()` remains supported for compatibility, migration evidence,
diagnostics, and substrate tooling, but it is no longer the surface new
application code should reach for first.

## Core Contract

A **reading** is a read basis over causal history. It answers "from which
worldline, coordinate, strand, or aperture am I allowed to see?"

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

Use an optic when the product needs a bounded, named question over a live
worldline and the substrate has a checkpoint-tail basis available.

```typescript
const status = await events
  .optic()
  .node('task:auth')
  .prop('status')
  .read();
```

Foundation optics are deliberately narrower than general reads. They reject
unbounded or unsupported bases instead of silently falling back to a whole-graph
fold. If an optic reports that no bounded basis is available, use a worldline or
observer read, or create the operational checkpoint evidence the optic needs.

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
easier to validate. They do not change the public app read path.

```typescript
await graph.checkpoint.createCheckpoint();

const nodes = await events.live().getNodes();
```

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
| Ask a bounded optic question | `worldline.optic()` |
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
