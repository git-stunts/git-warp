# @git-stunts/git-warp

[![CI](https://github.com/git-stunts/git-warp/actions/workflows/ci.yml/badge.svg)](https://github.com/git-stunts/git-warp/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![npm version](https://badge.fury.io/js/%40git-stunts%2Fgit-warp.svg)](https://www.npmjs.com/package/@git-stunts/git-warp)

<p align="center">
  <img src="docs/images/hero.gif" alt="git-warp CLI demo" width="600">
</p>

## The Core Idea

**git-warp** is a graph database that doesn't need a database server. It stores all its data inside a Git repository by abusing a clever trick: every piece of data is a Git commit that points to the **empty tree** — a special object that exists in every Git repo. Because the commits don't reference any actual files, they're completely invisible to normal Git operations like `git log`, `git diff`, or `git status`. Your codebase stays untouched, but there's a full graph database living alongside it.

Writers collaborate without coordination using CRDTs (Conflict-free Replicated Data Types) that guarantee deterministic convergence regardless of what order the patches arrive in.

```bash
npm install @git-stunts/git-warp @git-stunts/plumbing
```

For a comprehensive walkthrough — from setup to advanced features — see the [Guide](docs/GUIDE.md).

## Quick Start

```javascript
import GitPlumbing from '@git-stunts/plumbing';
import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';

const plumbing = new GitPlumbing({ cwd: './my-repo' });
const persistence = new GitGraphAdapter({ plumbing });

const graph = await WarpGraph.open({
  persistence,
  graphName: 'demo',
  writerId: 'writer-1',
});

// Write data — single await with graph.patch()
await graph.patch(p => {
  p.addNode('user:alice')
    .setProperty('user:alice', 'name', 'Alice')
    .setProperty('user:alice', 'role', 'admin')
    .addNode('user:bob')
    .setProperty('user:bob', 'name', 'Bob')
    .addEdge('user:alice', 'user:bob', 'manages')
    .setEdgeProperty('user:alice', 'user:bob', 'manages', 'since', '2024');
});

// Query the graph
const result = await graph.query()
  .match('user:*')
  .outgoing('manages')
  .run();
```

## How It Works

### The Multi-Writer Problem (and How It's Solved)

Multiple people (or machines, or processes) can write to the same graph **simultaneously, without any coordination**. There's no central server, no locking, no "wait your turn."

Each writer maintains their own independent chain of **patches** — atomic batches of operations like "add this node, set this property, create this edge." These patches are stored as Git commits under refs like `refs/warp/<graphName>/writers/<writerId>`.

When you want to read the graph, you **materialize** — which means replaying all patches from all writers and merging them into a single consistent view. The specific CRDT rules are:

- **Nodes and edges** use an OR-Set (Observed-Remove Set). If Alice adds a node and Bob concurrently deletes it, the add wins — unless Bob's delete specifically observed Alice's add. This is the "add wins over concurrent remove" principle.
- **Properties** use LWW (Last-Writer-Wins) registers. If two writers set the same property at the same time, the one with the higher Lamport timestamp wins. Ties are broken by writer ID (lexicographic), then by patch SHA.
- **Version vectors** track causality across writers so the system knows which operations are concurrent vs. causally ordered.

Every operation gets a unique **EventId** — `(lamport, writerId, patchSha, opIndex)` — which creates a total ordering that makes merge results identical no matter which machine runs them.

**Checkpoints** snapshot the materialized state into a single commit for fast incremental recovery. Subsequent materializations only need to replay patches created after the checkpoint.

## Multi-Writer Collaboration

Writers operate independently on the same Git repository. Sync happens through standard Git transport (push/pull) or the built-in HTTP sync protocol.

```javascript
// Writer A (on machine A)
const graphA = await WarpGraph.open({
  persistence: persistenceA,
  graphName: 'shared',
  writerId: 'alice',
});

await graphA.patch(p => {
  p.addNode('doc:1').setProperty('doc:1', 'title', 'Draft');
});

// Writer B (on machine B)
const graphB = await WarpGraph.open({
  persistence: persistenceB,
  graphName: 'shared',
  writerId: 'bob',
});

await graphB.patch(p => {
  p.addNode('doc:2').setProperty('doc:2', 'title', 'Notes');
});

// After git push/pull, materialize merges both writers
const state = await graphA.materialize();
await graphA.hasNode('doc:1'); // true
await graphA.hasNode('doc:2'); // true
```

### HTTP Sync

```javascript
// Start a sync server
const server = await graphB.serve({ port: 3000 });

// Sync from another instance
await graphA.syncWith('http://localhost:3000/sync');

await server.close();
```

### Direct Sync

```javascript
// Sync two in-process instances directly
await graphA.syncWith(graphB);
```

## Querying

Query methods auto-materialize by default. Just open a graph and start querying:

### Simple Queries

```javascript
await graph.getNodes();                              // ['user:alice', 'user:bob']
await graph.hasNode('user:alice');                   // true
await graph.getNodeProps('user:alice');              // Map { 'name' => 'Alice', 'role' => 'admin' }
await graph.neighbors('user:alice', 'outgoing');    // [{ nodeId: 'user:bob', label: 'manages', direction: 'outgoing' }]
await graph.getEdges();                              // [{ from: 'user:alice', to: 'user:bob', label: 'manages', props: {} }]
await graph.getEdgeProps('user:alice', 'user:bob', 'manages');  // { weight: 0.9 } or null
```

### Fluent Query Builder

```javascript
const result = await graph.query()
  .match('user:*')           // glob pattern matching
  .outgoing('manages')       // traverse outgoing edges with label
  .select(['id', 'props'])   // select fields
  .run();
```

#### Object shorthand in `where()`

Filter nodes by property equality using plain objects. Multiple properties = AND semantics.

```javascript
// Object shorthand — strict equality on primitive values
const admins = await graph.query()
  .match('user:*')
  .where({ role: 'admin', active: true })
  .run();

// Chain object and function filters
const seniorAdmins = await graph.query()
  .match('user:*')
  .where({ role: 'admin' })
  .where(({ props }) => props.age >= 30)
  .run();
```

#### Multi-hop traversal

Traverse multiple hops in a single call with `depth`. Default is `[1, 1]` (single hop).

```javascript
// Depth 2: return only hop-2 neighbors
const grandchildren = await graph.query()
  .match('org:root')
  .outgoing('child', { depth: 2 })
  .run();

// Range [1, 3]: return neighbors at hops 1, 2, and 3
const reachable = await graph.query()
  .match('node:a')
  .outgoing('next', { depth: [1, 3] })
  .run();

// Depth [0, 2]: include the start set (self) plus hops 1 and 2
const selfAndNeighbors = await graph.query()
  .match('node:a')
  .outgoing('next', { depth: [0, 2] })
  .run();

// Incoming edges work the same way
const ancestors = await graph.query()
  .match('node:leaf')
  .incoming('child', { depth: [1, 5] })
  .run();
```

#### Aggregation

Compute count, sum, avg, min, max over matched nodes. This is a terminal operation — `select()`, `outgoing()`, and `incoming()` cannot follow `aggregate()`.

```javascript
const stats = await graph.query()
  .match('order:*')
  .where({ status: 'paid' })
  .aggregate({ count: true, sum: 'props.total', avg: 'props.total' })
  .run();

// stats = { stateHash: '...', count: 12, sum: 1450, avg: 120.83 }
```

Non-numeric property values are silently skipped during aggregation.

### Path Finding

```javascript
const result = await graph.traverse.shortestPath('user:alice', 'user:bob', {
  dir: 'outgoing',
  labelFilter: 'manages',
  maxDepth: 10,
});

if (result.found) {
  console.log(result.path);   // ['user:alice', 'user:bob']
  console.log(result.length); // 1
}
```

## Subscriptions & Reactivity

React to graph changes without polling. Handlers are called after `materialize()` when state has changed.

### Subscribe to All Changes

```javascript
const { unsubscribe } = graph.subscribe({
  onChange: (diff) => {
    console.log('Nodes added:', diff.nodes.added);
    console.log('Nodes removed:', diff.nodes.removed);
    console.log('Edges added:', diff.edges.added);
    console.log('Props changed:', diff.props.set);
  },
  onError: (err) => console.error('Handler error:', err),
  replay: true,  // immediately fire with current state
});

// Make changes and materialize to trigger handlers
await (await graph.createPatch()).addNode('user:charlie').commit();
await graph.materialize();  // onChange fires with the diff

unsubscribe();  // stop receiving updates
```

### Watch with Pattern Filtering

Only receive changes for nodes matching a glob pattern:

```javascript
const { unsubscribe } = graph.watch('user:*', {
  onChange: (diff) => {
    // Only includes user:* nodes, their edges, and their properties
    console.log('User changes:', diff);
  },
  poll: 5000,  // optional: check for remote changes every 5s
});
```

When `poll` is set, the watcher periodically calls `hasFrontierChanged()` and auto-materializes if remote changes are detected.

## Observer Views

Project the graph through filtered lenses for access control, data minimization, or multi-tenant isolation (Paper IV).

```javascript
// Create an observer that only sees user:* nodes, with sensitive fields hidden
const view = await graph.observer('publicApi', {
  match: 'user:*',
  redact: ['ssn', 'password'],
});

const users = await view.getNodes();                // only user:* nodes
const props = await view.getNodeProps('user:alice'); // Map without ssn/password
const result = await view.query().match('user:*').where({ role: 'admin' }).run();

// Measure information loss between two observer perspectives
const { cost, breakdown } = await graph.translationCost(
  { match: '*' },                         // full view
  { match: 'user:*', redact: ['ssn'] },   // restricted view
);
// cost ∈ [0, 1] — 0 = identical views, 1 = completely disjoint
```

## Temporal Queries

CTL*-style temporal operators over patch history (Paper IV).

```javascript
// Was this node always in 'active' status?
const alwaysActive = await graph.temporal.always(
  'user:alice',
  (snapshot) => snapshot.props.status === 'active',
  { since: 0 },
);

// Was this PR ever merged?
const wasMerged = await graph.temporal.eventually(
  'pr:42',
  (snapshot) => snapshot.props.status === 'merged',
);
```

## Patch Operations

The patch builder supports seven operations:

```javascript
const sha = await (await graph.createPatch())
  .addNode('n1')                                    // create a node
  .removeNode('n1')                                 // tombstone a node
  .addEdge('n1', 'n2', 'label')                    // create a directed edge
  .removeEdge('n1', 'n2', 'label')                 // tombstone an edge
  .setProperty('n1', 'key', 'value')               // set a node property (LWW)
  .setEdgeProperty('n1', 'n2', 'label', 'weight', 0.8)  // set an edge property (LWW)
  .commit();                                        // commit as a single atomic patch
```

Each `commit()` creates one Git commit containing all the operations, advances the writer's Lamport clock, and updates the writer's ref via compare-and-swap.

### Writer API

For repeated writes, the Writer API is more convenient:

```javascript
const writer = await graph.writer();

await writer.commitPatch(p => {
  p.addNode('item:1');
  p.setProperty('item:1', 'status', 'active');
});
```

## Checkpoints and Garbage Collection

```javascript
// Checkpoint current state for fast future materialization
await graph.materialize();
await graph.createCheckpoint();

// GC removes tombstones when safe
const metrics = graph.getGCMetrics();
const { ran, result } = graph.maybeRunGC();

// Or configure automatic checkpointing
const graph = await WarpGraph.open({
  persistence,
  graphName: 'demo',
  writerId: 'writer-1',
  checkpointPolicy: { every: 500 },  // auto-checkpoint every 500 patches
});
```

## Observability

```javascript
// Operational health snapshot (does not trigger materialization)
const status = await graph.status();
// {
//   cachedState: 'fresh',          // 'fresh' | 'stale' | 'none'
//   patchesSinceCheckpoint: 12,
//   tombstoneRatio: 0.03,
//   writers: 2,
//   frontier: { alice: 'abc...', bob: 'def...' },
// }

// Tick receipts: see exactly what happened during materialization
const { state, receipts } = await graph.materialize({ receipts: true });
for (const receipt of receipts) {
  for (const op of receipt.ops) {
    if (op.result === 'superseded') {
      console.log(`${op.op} on ${op.target}: ${op.reason}`);
    }
  }
}
```

Core operations (`materialize()`, `syncWith()`, `createCheckpoint()`, `runGC()`) emit structured timing logs via `LoggerPort` when a logger is injected.

## CLI

The CLI is available as `warp-graph` or as a Git subcommand `git warp`.

```bash
# Install the git subcommand
npm run install:git-warp

# List graphs in a repo
git warp info

# Query nodes by pattern
git warp query --match 'user:*' --outgoing manages --json

# Find shortest path between nodes
git warp path --from user:alice --to user:bob --dir out

# Show patch history for a writer
git warp history --writer alice

# Check graph health, status, and GC metrics
git warp check

# Time-travel: step through graph history
git warp seek --tick 3                  # jump to Lamport tick 3
git warp seek --tick=+1                 # step forward one tick
git warp seek --tick=-1                 # step backward one tick
git warp seek --save before-refactor    # bookmark current position
git warp seek --load before-refactor    # restore bookmark
git warp seek --latest                  # return to present
git warp seek --clear-cache             # purge persistent seek cache
git warp seek --no-persistent-cache --tick 5  # skip cache for one invocation

# Visualize query results (ascii output by default)
git warp query --match 'user:*' --outgoing manages --view
```

All commands accept `--repo <path>` to target a specific Git repository, `--json` for machine-readable output, and `--view [mode]` for visual output (ascii by default, or browser, svg:FILE, html:FILE).

When a seek cursor is active, `query`, `info`, `materialize`, and `history` automatically show state at the selected tick.

<p align="center">
  <img src="docs/seek-demo.gif" alt="git warp seek time-travel demo" width="600">
</p>

## Architecture

The codebase follows hexagonal architecture with ports and adapters:

**Ports** define abstract interfaces for infrastructure:
- `GraphPersistencePort` -- Git operations (composite of CommitPort, BlobPort, TreePort, RefPort, ConfigPort)
- `CommitPort` / `BlobPort` / `TreePort` / `RefPort` / `ConfigPort` -- focused persistence interfaces
- `IndexStoragePort` -- bitmap index storage
- `CodecPort` -- encode/decode operations
- `CryptoPort` -- hash/HMAC operations
- `LoggerPort` -- structured logging
- `ClockPort` -- time measurement
- `SeekCachePort` -- persistent seek materialization cache

**Adapters** implement the ports:
- `GitGraphAdapter` -- wraps `@git-stunts/plumbing` for Git operations
- `ClockAdapter` -- unified clock (factory: `ClockAdapter.node()`, `ClockAdapter.global()`)
- `NodeCryptoAdapter` -- cryptographic operations via `node:crypto`
- `WebCryptoAdapter` -- cryptographic operations via Web Crypto API (browsers, Deno, Bun, Node 22+)
- `NodeHttpAdapter` / `BunHttpAdapter` / `DenoHttpAdapter` -- HTTP server per runtime
- `ConsoleLogger` / `NoOpLogger` -- logging implementations
- `CborCodec` -- CBOR serialization for patches
- `CasSeekCacheAdapter` -- persistent seek cache via `@git-stunts/git-cas`

**Domain** contains the core logic:
- `WarpGraph` -- public API facade
- `Writer` / `PatchSession` -- patch creation and commit
- `JoinReducer` -- CRDT-based state materialization
- `QueryBuilder` -- fluent query construction
- `LogicalTraversal` -- graph traversal over materialized state
- `SyncProtocol` -- multi-writer synchronization
- `CheckpointService` -- state snapshot creation and loading
- `ObserverView` -- read-only filtered graph projections
- `TemporalQuery` -- CTL* temporal operators over history
- `TranslationCost` -- MDL cost estimation between observer views
- `BitmapIndexBuilder` / `BitmapIndexReader` -- roaring bitmap indexes
- `VersionVector` / `ORSet` / `LWW` -- CRDT primitives

## Dependencies

| Package | Purpose |
|---------|---------|
| `@git-stunts/plumbing` | Low-level Git operations |
| `@git-stunts/alfred` | Retry with exponential backoff |
| `@git-stunts/trailer-codec` | Git trailer encoding |
| `cbor-x` | CBOR binary serialization |
| `roaring` | Roaring bitmap indexes (native C++ bindings) |
| `zod` | Schema validation |

## Testing

```bash
npm test                # unit tests (vitest, Docker)
npm run test:local      # unit tests without Docker
npm run lint            # eslint

# Multi-runtime test matrix (Docker)
npm run test:node22     # Node 22: unit + integration + BATS CLI
npm run test:bun        # Bun: API integration tests
npm run test:deno       # Deno: API integration tests
npm run test:matrix     # All runtimes in parallel
```

## When git-warp is Most Useful

- **Distributed configuration management.** A fleet of servers each writing their own state into a shared graph without a central database.
- **Offline-first field applications.** Collecting data in the field with no connectivity; merging cleanly when back online.
- **Collaborative knowledge bases.** Researchers curating nodes and relationships independently.
- **Git-native issue/project tracking.** Embedding a full project graph directly in the repo.
- **Audit-critical systems.** Tamper-evident records with cryptographic proof (via Audit Receipts).
- **IoT sensor networks.** Sensors logging readings and relationships, syncing when bandwidth allows.
- **Game world state.** Modders independently adding content that composes without a central manager.

## When NOT to Use It

- **High-throughput transactional workloads.** If you need thousands of writes per second with immediate consistency, use Postgres or Redis.
- **Large binary or blob storage.** Data lives in Git commit messages (default cap 1 MB). Use object storage for images or videos.
- **Sub-millisecond read latency.** Materialization has overhead. Use an in-memory database for real-time gaming physics or HFT.
- **Simple key-value storage.** If you don't have relationships or need traversals, a graph database is overkill.
- **Non-Git environments.** The value proposition depends on Git infrastructure (push/pull, content-addressing).

## AIΩN Foundations Series

This package is the reference implementation of WARP (Worldline Algebra for Recursive Provenance) graphs as described in the AIΩN Foundations Series. The papers formalize the graph as a minimal recursive state object ([Paper I](https://doi.org/10.5281/zenodo.17908005)), equip it with deterministic tick-based semantics ([Paper II](https://doi.org/10.5281/zenodo.17934512)), develop computational holography and provenance payloads ([Paper III](https://doi.org/10.5281/zenodo.17963669)), and introduce observer geometry with the translation cost metric ([Paper IV](https://doi.org/10.5281/zenodo.18038297)).

## License

Apache-2.0

---

<p align="center">
<sub>Built by <a href="https://github.com/flyingrobots">FLYING ROBOTS</a></sub>
</p>
