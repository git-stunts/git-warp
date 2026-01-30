# Interactive Demo

EmptyGraph includes a comprehensive interactive demo that runs in Docker. It demonstrates a real-world e-commerce event store.

## Quick Start

```bash
# 1. Setup the demo environment
npm run demo:setup

# 2. Run the interactive explorer
npm run demo:explore

# 3. Inspect the bitmap index distribution
npm run demo:inspect
```

## What the Demo Shows

### 1. Event Replay
The explorer walks backwards through the event history, demonstrating `graph.traversal.ancestors()`.

### 2. State Projection
Replays events through a reducer to rebuild current application state (Users, Carts, Orders).

### 3. Branching & Timelines
Demonstrates how Git branches represent alternate timelines (e.g., a "Cancelled Order" scenario).

### 4. Advanced Traversal
- **Shortest Path:** Bidirectional BFS finding the shortest route between events.
- **Topological Sort:** Kahn's algorithm ensuring events are processed in dependency order.

## Manual Exploration

You can drop into the demo container to run raw Git commands against the "Invisible" database:

```bash
npm run demo
# Now inside the container
git log --oneline --graph --all
```

See the [WALKTHROUGH.md](https://github.com/git-stunts/empty-graph/blob/main/examples/WALKTHROUGH.md) for a detailed step-by-step guide.
