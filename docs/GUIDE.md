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
- `PropSet` - Set a property value

```javascript
await graph.createPatch()
  .addNode('user:alice')
  .setProperty('user:alice', 'email', 'alice@example.com')
  .addEdge('user:alice', 'org:acme', 'works-at')
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
import { WarpGraph, GitGraphAdapter } from 'empty-graph';
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

1. Create checkpoints periodically
2. Use `materializeAt(checkpointSha)` for incremental recovery
3. Consider reducing patch frequency (batch operations)

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
2. **Checkpoint regularly** - Every 500-1000 patches
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
