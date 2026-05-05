# Readings And Optics

Use this guide when you are building an app, agent workflow, or local-first tool
on top of `git-warp` and need to choose the right public read surface.

The v17 app path is:

```text
openWarpGraph() -> graph.patches -> graph.query -> worldlines, observers, readings, optics
```

Application code should write claims through `graph.patches` and read admitted
truth through `graph.query`, worldlines, observers, and bounded query or
traversal optics.

## Core Contract

A **reading** is a read basis over causal history. It answers "from which
worldline, coordinate, strand, or aperture am I allowed to see?"

An **optic** is the bounded question asked over a reading. It answers "which
node, edge, neighbor set, traversal, or query result do I want?"

The public read contract is intentionally direct:

```typescript
const worldline = graph.query.worldline();
const props = await worldline.getNodeProps('task:auth');
```

You do not need to fold the whole graph before reading. The capability you reach
for in app code is the read surface that names the basis you mean.

## Live Worldline Reading

Use a live worldline for normal product reads against the current admitted
history.

```typescript
const worldline = graph.query.worldline();

const task = await worldline.getNodeProps('task:auth');

const openTasks = await worldline.query()
  .match('task:*')
  .where({ status: 'open' })
  .run();

const path = await worldline.traverse.shortestPath('task:auth', 'service:login', {
  dir: 'out',
});
```

## Pinned Coordinate Reading

Use a pinned coordinate when you want to read an earlier causal view.

```typescript
const beforeReview = graph.query.worldline({
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

const publicView = await worldline.observer('public-review', publicAperture);
const visibleTask = await publicView.getNodeProps('task:auth');
```

Observers are the normal way to express product boundaries such as redaction,
tenant scoping, or role-specific views.

## Strand Reading

Use a strand when you are exploring speculative work that should not land in
the live worldline yet.

```typescript
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

Strands are write lanes with their own provenance. Read them through strand and
comparison capabilities instead of copying their data into a second graph.

## Checkpoint-Backed Readings

Checkpoints are operational artifacts that make replay cheaper and release
state easier to validate. They do not change the public app read path.

```typescript
await graph.checkpoint.createCheckpoint();

const worldline = graph.query.worldline();
const nodes = await worldline.getNodes();
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
| Read current truth | `graph.query` or `graph.query.worldline()` |
| Read historical truth | `graph.query.worldline({ source: ... })` |
| Read a filtered view | `worldline.observer(...)` |
| Traverse visible structure | `worldline.traverse` |
| Query visible structure | `worldline.query()` |
| Inspect provenance | `graph.provenance` |
| Create an operational snapshot | `graph.checkpoint` |
| Explore speculative work | `graph.strands` |

## Migration Notes

Older examples sometimes taught an explicit fold before querying. In v17,
prefer a reading basis:

```typescript
const worldline = graph.query.worldline();
const props = await worldline.getNodeProps('task:auth');
```

If a runtime error says no live reading basis is available, open a worldline,
pin a coordinate, or create an observer that matches the operation you are
trying to perform.
