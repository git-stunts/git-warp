# WARP Multi-Writer Guide

This guide explains how to use WarpGraph's multi-writer capabilities powered by the WARP (Write-Ahead Replicated Patches) protocol.

## Overview

WARP enables multiple independent writers to modify a shared graph without coordination. Changes are recorded as **patches** that deterministically merge using Last-Writer-Wins (LWW) semantics.

### When Multi-Writer Shines

WarpGraph excels when you need:
- Multiple processes/machines writing to the same graph
- Offline-first applications that sync later
- Distributed systems without central coordination
- Audit trails of who changed what

## Core Concepts

### Writers

A **writer** is an independent actor identified by a unique string ID. Each writer:
- Maintains its own chain of patches under `refs/empty-graph/<graph>/writers/<writerId>`
- Assigns Lamport timestamps to operations
- Can work offline and sync later

```javascript
const graph = await WarpGraph.open({
  persistence,
  graphName: 'my-graph',
  writerId: 'server-1',  // Unique writer ID
});
```

**Writer ID best practices:**
- Use stable identifiers (hostname, UUID, user ID)
- Keep IDs short but unique
- Don't reuse IDs across different logical writers

### Patches

A **patch** is an atomic batch of graph operations. Operations include:
- `NodeAdd` - Create a node
- `NodeTombstone` - Delete a node
- `EdgeAdd` - Create an edge
- `EdgeTombstone` - Delete an edge
- `PropSet` - Set a property value (also targets edge properties when used with `setEdgeProperty()`)

```javascript
await graph.createPatch()
  .addNode('user:alice')
  .setProperty('user:alice', 'email', 'alice@example.com')
  .addEdge('user:alice', 'org:acme', 'works-at')
  .setEdgeProperty('user:alice', 'org:acme', 'works-at', 'since', '2024-06')
  .commit();
```

Each patch is stored as a Git commit with:
- CBOR-encoded operations in `patch.cbor` blob
- Metadata in Git trailers (writer, writerId, lamport, graph name)
- Parent pointing to previous patch from same writer

### EventId and Ordering

Every operation gets an **EventId** for deterministic ordering:

```text
EventId = (lamport, writerId, patchSha, opIndex)
```

Comparison is lexicographic:
1. Higher lamport wins
2. Same lamport → lexicographically greater writerId wins
3. Same writerId → greater patchSha wins
4. Same patchSha → higher opIndex wins

This ensures identical merge results regardless of patch arrival order.

### Last-Writer-Wins (LWW)

When two writers modify the same entity, the operation with the higher EventId wins:

```javascript
// Writer A at lamport=1: sets name to "Alice"
// Writer B at lamport=2: sets name to "Alicia"
// Result: name is "Alicia" (lamport 2 > 1)
```

For concurrent operations (same lamport):
```javascript
// Writer "alice" at lamport=5: sets color to "red"
// Writer "bob" at lamport=5: sets color to "blue"
// Result: color is "blue" ("bob" > "alice" lexicographically)
```

### Visibility Rules

Not everything in state is visible. Visibility predicates:

- **Node visible**: `node_alive[nodeId].value === true`
- **Edge visible**: edge alive AND both endpoints visible
- **Property visible**: node visible AND property exists

**Tombstone cascading**: Deleting a node automatically hides its edges and properties.

```javascript
await graph.createPatch()
  .addNode('temp')
  .setProperty('temp', 'data', 'value')
  .addEdge('temp', 'other', 'link')
  .commit();

await graph.createPatch()
  .removeNode('temp')  // Tombstone
  .commit();

const state = await graph.materialize();
// Node 'temp' is not visible
// Property 'temp.data' is not visible
// Edge 'temp->other' is not visible
```

## Edge Properties

Edges can carry properties just like nodes. Edge properties use LWW (Last-Write-Wins) semantics identical to node properties.

### Setting Edge Properties

```javascript
await graph.createPatch()
  .addNode('user:alice')
  .addNode('user:bob')
  .addEdge('user:alice', 'user:bob', 'follows')
  .setEdgeProperty('user:alice', 'user:bob', 'follows', 'since', '2024-01')
  .setEdgeProperty('user:alice', 'user:bob', 'follows', 'weight', 0.9)
  .commit();
```

### Reading Edge Properties

```javascript
// Get all edges with their properties
const edges = await graph.getEdges();
// [{ from: 'user:alice', to: 'user:bob', label: 'follows', props: { since: '2024-01', weight: 0.9 } }]

// Get properties for a specific edge
const props = await graph.getEdgeProps('user:alice', 'user:bob', 'follows');
// { since: '2024-01', weight: 0.9 }
```

### Visibility Rules

Edge properties are only visible when the parent edge is alive:

- **Remove edge**: all its properties become invisible
- **Re-add edge**: starts with a clean slate — old properties are NOT restored

This prevents stale property data from leaking through after edge lifecycle changes.

### Multi-Writer Conflict Resolution

Edge properties follow the same LWW resolution as node properties:

1. Higher Lamport timestamp wins
2. Tie: higher writer ID wins (lexicographic)
3. Tie: higher patch SHA wins

Two writers setting the same edge property concurrently will deterministically converge to the same winner, regardless of patch arrival order.

### Schema Compatibility

Edge properties require schema v3 (introduced in v7.3.0). When syncing:

- **v3 → v2 with edge props**: v2 reader throws `E_SCHEMA_UNSUPPORTED` with upgrade guidance
- **v3 → v2 with node-only ops**: succeeds (schema number alone is not a rejection criterion)
- **v2 → v3**: always succeeds (v2 patches are valid v3 input)

## Auto-Materialize and Auto-Checkpoint

### Auto-Materialize

By default, query methods throw if no materialized state exists. With `autoMaterialize: true`, query methods automatically materialize before returning results:

```javascript
const graph = await WarpGraph.open({
  persistence,
  graphName: 'my-graph',
  writerId: 'local',
  autoMaterialize: true,
});

// No explicit materialize() needed — queries auto-materialize
const nodes = await graph.getNodes();
const exists = await graph.hasNode('user:alice');
const result = await graph.query().match('user:*').run();
```

When `autoMaterialize` is off (the default), querying dirty state throws `QueryError` with code `E_STALE_STATE`, and querying without any cached state throws `QueryError` with code `E_NO_STATE`.

### Auto-Checkpoint

Configure automatic checkpointing to keep materialization fast:

```javascript
const graph = await WarpGraph.open({
  persistence,
  graphName: 'my-graph',
  writerId: 'local',
  checkpointPolicy: { every: 500 },
});
```

After `materialize()` processes 500+ patches, a checkpoint is created automatically. The counter resets after each checkpoint. Checkpoint failures are swallowed — they never break materialization.

### Eager Re-Materialize

After a local commit, the patch is applied eagerly to cached state. This means queries immediately reflect local writes without calling `materialize()` again:

```javascript
await graph.materialize();

await (await graph.createPatch())
  .addNode('user:carol')
  .commit();

// No re-materialize needed — eager apply already updated state
await graph.hasNode('user:carol'); // true
```

This works for all write paths: `createPatch().commit()`, `writer.commitPatch()`, and `PatchSession.commit()`.

### Frontiers and Checkpoints

A **frontier** tracks the last-seen patch from each writer:
```javascript
Map { 'alice' => 'abc123...', 'bob' => 'def456...' }
```

A **checkpoint** is a snapshot of materialized state at a known frontier:
- Stored as Git commit with `state.cbor` and `frontier.cbor`
- Enables fast recovery without replaying all patches
- Created with `graph.createCheckpoint()`

```javascript
// Create checkpoint after significant work
const checkpointSha = await graph.createCheckpoint();

// Later: fast recovery
const state = await graph.materializeAt(checkpointSha);
```

## Workflows

### Basic Workflow

```javascript
import { WarpGraph, GitGraphAdapter } from '@git-stunts/empty-graph';
import Plumbing from '@git-stunts/plumbing';

const plumbing = new Plumbing({ cwd: './my-repo' });
const persistence = new GitGraphAdapter({ plumbing });

const graph = await WarpGraph.open({
  persistence,
  graphName: 'todos',
  writerId: 'local',
});

// Add items
await graph.createPatch()
  .addNode('todo:1')
  .setProperty('todo:1', 'title', 'Buy groceries')
  .setProperty('todo:1', 'done', false)
  .commit();

// Query state
const state = await graph.materialize();
console.log(state.nodeAlive.get('todo:1')); // { eventId: {...}, value: true }
```

### Multi-Writer Collaboration

```javascript
// === Machine A ===
const graphA = await WarpGraph.open({
  persistence: persistenceA,
  graphName: 'shared-doc',
  writerId: 'machine-a',
});

await graphA.createPatch()
  .addNode('section:intro')
  .setProperty('section:intro', 'text', 'Hello World')
  .commit();

// === Machine B ===
const graphB = await WarpGraph.open({
  persistence: persistenceB,
  graphName: 'shared-doc',
  writerId: 'machine-b',
});

await graphB.createPatch()
  .addNode('section:conclusion')
  .setProperty('section:conclusion', 'text', 'The End')
  .commit();

// === After git sync (push/pull) ===
// Both machines can now see all content
const stateA = await graphA.materialize();
const stateB = await graphB.materialize();
// stateA and stateB are identical
```

### Checkpoint and Recovery

```javascript
// Periodic checkpointing (e.g., every 1000 patches)
const checkpointSha = await graph.createCheckpoint();
console.log(`Checkpoint created: ${checkpointSha}`);

// Fast startup: materialize from checkpoint
const state = await graph.materializeAt(checkpointSha);
// Only processes patches since checkpoint, not entire history
```

#### Automatic Checkpointing

```javascript
// Auto-checkpoint: no manual intervention needed
const graph = await WarpGraph.open({
  persistence,
  graphName: 'todos',
  writerId: 'local',
  checkpointPolicy: { every: 500 },
});

// After 500+ patches, materialize() creates a checkpoint automatically
await graph.materialize();
```

### Discovering Writers

```javascript
const writers = await graph.discoverWriters();
console.log('Active writers:', writers);
// ['alice', 'bob', 'charlie']

// Useful for monitoring, debugging, or UI
```

### Coverage Sync

Ensure all writers are reachable from a single ref (useful for cloning):

```javascript
await graph.syncCoverage();
// Creates octopus anchor at refs/empty-graph/<graph>/coverage/head
// All writer tips are now parents of this commit
```

## Git Hooks

### Post-Merge Hook

WarpGraph ships a `post-merge` Git hook that runs after every `git merge` or `git pull` and checks whether any warp writer refs (`refs/empty-graph/`) changed during the merge.

If warp refs changed, the hook prints an informational message:

```
[warp] Writer refs changed during merge. Call materialize() to see updates.
```

The hook **never blocks a merge** — it always exits 0.

### Auto-Materialize

Enable automatic materialization and checkpointing after pulls:

```bash
git config warp.autoMaterialize true
```

When enabled, the post-merge hook will automatically run `git warp materialize` whenever warp refs change during a merge. This materializes all graphs and creates checkpoints so the local state is always up to date.

When disabled or unset (the default), the hook prints the informational warning shown above.

### `git warp materialize`

Materialize and checkpoint graphs explicitly:

```bash
git warp materialize                          # All graphs in the repo
git warp materialize --graph my-graph         # Single graph
git warp materialize --json                   # JSON output
```

For each graph, the command materializes state, counts nodes and edges, and creates a checkpoint. Output:

```
my-graph: 42 nodes, 18 edges, checkpoint abc123...
```

### Installing the Hook

Use the `install-hooks` CLI command:

```bash
git warp install-hooks
# or: warp-graph install-hooks --repo /path/to/repo
```

If a `post-merge` hook already exists, the command offers three options interactively:

1. **Append** — keeps your existing hook and adds the warp section (delimited, upgradeable)
2. **Replace** — backs up the existing hook to `post-merge.backup` and installs fresh
3. **Skip** — do nothing

If the warp hook is already installed, running the command again either reports "up to date" or offers to upgrade to the current version.

### Non-Interactive / CI Usage

In non-interactive environments (no TTY), use `--force` to replace any existing hook:

```bash
git warp install-hooks --force
```

The `--force` flag always backs up an existing hook before replacing it.

Both `--json` and `--force` flags are supported:

```bash
git warp install-hooks --json --force
```

### Checking Hook Status

The `check` command reports hook status:

```bash
git warp check
```

Example output lines:
- `Hook: installed (v7.1.0) — up to date`
- `Hook: installed (v7.0.0) — upgrade available, run 'git warp install-hooks'`
- `Hook: not installed — run 'git warp install-hooks'`

## Troubleshooting

### "My changes aren't appearing"

1. Check that `commit()` was called on the patch
2. Verify the writer ref exists: `git show-ref | grep empty-graph`
3. Ensure you're materializing the same graph name

### "State differs between writers"

1. Both writers must sync (git push/pull) before materializing
2. Verify both are using the same `graphName`
3. Check for Lamport clock issues (writer ID reuse)

### "Materialization is slow"

1. Enable auto-checkpointing: `checkpointPolicy: { every: 500 }` on `WarpGraph.open()`
2. Create checkpoints manually with `graph.createCheckpoint()` if not using auto-checkpointing
3. Use `materializeAt(checkpointSha)` for incremental recovery
4. Consider reducing patch frequency (batch operations)

### "Node should be deleted but still appears"

Tombstone might have lower EventId than a later add:
```javascript
// Writer A: addNode at lamport=5
// Writer B: removeNode at lamport=3
// Result: node is VISIBLE (5 > 3, add wins)
```

Solution: Ensure tombstones have higher lamport than adds.

## Performance Tips

1. **Batch operations** - Group related changes into single patches
2. **Checkpoint regularly** - Use `checkpointPolicy: { every: 500 }` for automatic checkpointing, or call `createCheckpoint()` manually
3. **Use incremental materialization** - `materializeAt()` vs `materialize()`
4. **Limit concurrent writers** - More writers = more merge overhead

## Ref Layout

WARP uses this Git ref structure:

```text
refs/empty-graph/<graph>/
├── writers/
│   ├── alice          # Alice's patch chain tip
│   ├── bob            # Bob's patch chain tip
│   └── ...
├── checkpoints/
│   └── head           # Latest checkpoint
└── coverage/
    └── head           # Octopus anchor (optional)
```

## Further Reading

- [WARP Technical Specification](./WARP-TECH-SPEC-ROADMAP.md) - Full protocol details
- [Architecture](../ARCHITECTURE.md) - System design, Durability, and Anchoring
