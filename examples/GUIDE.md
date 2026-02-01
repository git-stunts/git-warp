# WarpGraph Examples Guide

This guide explains each example slowly and clearly. Each example has two moving parts:

- Git DAG: the commit history of patches. This is the storage layer.
- WARP graph: the materialized state created by reducing patches. This is the query layer.

If you open the HTML files in `examples/html/`, you will see a Git DAG diagram on the left and a WARP graph diagram on the right.

---

## How to read the diagrams

1. The Git DAG diagram shows commits only. Each commit is a patch.
2. The direction of the arrows shows commit order (older -> newer).
3. Writers have separate chains. They do not merge in git.
4. The WARP graph diagram shows nodes and edges after CRDT reduction.
5. The WARP graph diagram ignores commit order. It only shows the current state.

---

## 1) setup.js

Purpose: Create a tiny graph and materialize it.

Step-by-step (slow):

1. Initialize a git repo if it does not exist.
2. Open WarpGraph with graphName "demo" and writerId "writer-1".
3. Create Patch 1. Add node user:alice and set her properties.
4. Commit Patch 1. This becomes the first git commit on the writer ref.
5. Create Patch 2. Add node user:bob and edge user:alice -> user:bob.
6. Commit Patch 2. The Git DAG now has two commits in a chain.
7. Create Patch 3. Add node post:1 and edge user:alice -> post:1.
8. Commit Patch 3. The Git DAG now has three commits in a chain.
9. Call materialize(). The reducer loads all patches and builds the CRDT state.
10. Query nodes and properties from the materialized state.

What is happening in the Git DAG:

- Three commits are created under refs/empty-graph/demo/writers/writer-1.
- Each commit stores a patch payload.
- The history is linear.

What is happening in the WARP graph:

- Nodes user:alice, user:bob, post:1 are visible.
- Edges follows and authored are visible.
- Properties are attached to user:alice and post:1.

---

## 2) explore.js

Purpose: Read and query the materialized graph.

Step-by-step (slow):

1. Open the same graphName "demo" with a new writerId.
2. Call materialize() to build a cached state.
3. Call getNodes() to list visible node IDs.
4. For each node, call getNodeProps() to read properties.
5. Call neighbors("user:alice", "both") to list connected nodes.
6. Call discoverWriters() to list writer IDs.
7. Call getFrontier() to read the latest patch per writer.

What is happening in the Git DAG:

- No new commits are created.
- The script only reads the existing patch chain.

What is happening in the WARP graph:

- The graph is identical to setup.js.
- The script uses the query helpers to inspect it.

---

## 3) multi-writer.js

Purpose: Show concurrent writers converging on one state.

Step-by-step (slow):

1. Open graphName "shared" as writerId "alice".
2. Open the same graphName "shared" as writerId "bob".
3. Alice commits a patch that adds her user and project.
4. Bob commits a patch that adds his user and project.
5. Alice commits another patch to add a task.
6. Bob commits another patch to add a task.
7. Call materialize() from Alice. The reducer loads both writer chains.
8. Call materialize() from Bob. The reducer loads the same combined patches.
9. Bob commits a new patch that links to Alice's project.
10. Materialize again to see the merged state.

What is happening in the Git DAG:

- There are two independent commit chains under two writer refs.
- No git merge is required. The history is separate by writer.

What is happening in the WARP graph:

- Both writers' patches are reduced into one graph.
- Nodes and edges from both writers are visible together.
- The graph converges even though the commit history is separate.

---

## 4) event-sourcing.js

Purpose: Explain the event-sourcing model.

Step-by-step (slow):

1. Treat each patch commit as an event record.
2. Store events as an append-only commit history.
3. Materialize when you need a state view.
4. Query the state instead of scanning commits directly.
5. Use checkpoints for faster recovery.

What is happening in the Git DAG:

- The DAG is the event log.
- Every commit is an immutable event.

What is happening in the WARP graph:

- The graph is a projection of the event log.
- The projection is deterministic and conflict-free.

---

## 5) lagrangian-path.js

Purpose: Run weighted shortest-path algorithms on the graph.

Step-by-step (slow):

1. Open a new graphName for the demo.
2. Create a patch that adds nodes A through G.
3. Add edges and store CPU and memory metrics as properties.
4. Commit the patch. The Git DAG has a single commit.
5. Materialize the graph to build state.
6. Build an adjacency list from getEdges().
7. Compute weights from CPU and memory metrics.
8. Run Dijkstra to find the minimum-cost path.
9. Run A* with a heuristic and compare results.

What is happening in the Git DAG:

- There is one commit containing the entire demo graph.
- The DAG is trivial but still stores the full patch.

What is happening in the WARP graph:

- The graph has multiple paths between A and G.
- Weighted costs select the most efficient route.

---

## 6) traversal-benchmark.js

Purpose: Benchmark Dijkstra and A* on different graph shapes.

Step-by-step (slow):

1. Choose a graph size (100, 500, 1000, ...).
2. Create a linear graph by adding nodes in a chain.
3. Commit patches in batches to reduce commit count.
4. Materialize and build adjacency from edges.
5. Run Dijkstra and A* multiple times.
6. Record median times and nodes explored.
7. Repeat with a diamond graph shape.
8. Compare results between shapes.

What is happening in the Git DAG:

- Patch commits are grouped into batches.
- The DAG is linear within a writer ref.

What is happening in the WARP graph:

- Linear graphs have one path; diamonds have multiple paths.
- A* can explore fewer nodes when the heuristic helps.

---

## 7) streaming-benchmark.js

Purpose: Stress-test materialization at scale.

Step-by-step (slow):

1. Open a new graphName for the benchmark run.
2. Add a long chain of nodes (for example 100,000 nodes).
3. Commit patches every N nodes to keep commits manageable.
4. Measure the time to create all patches.
5. Materialize the graph and measure time.
6. Compare memory usage before and after materialization.

What is happening in the Git DAG:

- Many patch commits represent batches of nodes.
- The DAG grows in length but remains linear.

What is happening in the WARP graph:

- The graph is a long chain of nodes.
- Materialize reconstructs the full chain into memory.

---

## 8) inspect-index.js

Purpose: Inspect checkpoint blobs and frontier state.

Step-by-step (slow):

1. Materialize the graph to compute the full CRDT state.
2. Create a checkpoint commit that writes state blobs to a tree.
3. Update refs/empty-graph/<graph>/checkpoints/head.
4. Read the checkpoint commit and list its tree entries.
5. Read frontier.cbor to see writer tips.
6. Use the checkpoint to resume materialization later.

What is happening in the Git DAG:

- Patch commits are still the source of truth.
- A checkpoint commit points to a tree of state blobs.

What is happening in the WARP graph:

- The checkpoint encodes the same state the reducer would build.
- It is a faster starting point for materialize().
