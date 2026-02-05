# Git Warp Demo Walkthrough

Welcome to the git-warp interactive demo! This guide walks you through using Git as an event store - one of the most powerful applications of the "invisible database" pattern.

By the end of this walkthrough, you'll understand:
- How Git commits become event records
- How to replay events to rebuild state
- How branching enables "what-if" scenarios
- How graph traversal algorithms query your event history

Let's dive in!

---

## Prerequisites

- Docker and Docker Compose installed
- Node.js 20+ (for local development)
- About 10 minutes of your time

---

## Step 1: Start the Demo Environment

From the `git-warp` project root, run:

```bash
npm run demo:setup
```

This command:
1. Builds a Docker container with Node.js and Git
2. Initializes a fresh Git repository
3. Creates sample e-commerce events (more on this below)
4. Builds a bitmap index for fast traversal

You should see output like:

```text
🚀 git-warp Demo Setup

📁 Initializing git repo...
Initialized empty Git repository in /demo/.git/

📝 Creating sample events...

  ✅ UserCreated          → 9c1e81dd
  ✅ CartCreated          → 89fa5ad1
  ✅ ItemAddedToCart      → 0e051741
  ✅ ItemAddedToCart      → 7b3f2c88
  ✅ OrderPlaced          → 1ca4f0c2
  ✅ PaymentReceived      → d84d8356
  ✅ OrderShipped         → b44d50a1
  ✅ OrderDelivered       → a3a69ce7

🔀 Creating branch: cancelled-order scenario...

  ✅ OrderCancelled       → ad2d0de3 (branched from OrderPlaced)

📊 Building bitmap index...

  Index saved to refs/git-warp/index (f8a2b1c4)

✅ Demo setup complete!
```

Each event is a Git commit. Those 8-character codes? They're SHA hashes - unique identifiers for each event.

---

## Step 2: Explore the Git Repository

Drop into the container shell:

```bash
npm run demo
```

You're now inside the demo container at `/demo`, which is a Git repository. Let's look around.

### View the Event Chain

```bash
git log --oneline main
```

You'll see something like:

```text
a3a69ce OrderDelivered
b44d50a OrderShipped
d84d835 PaymentReceived
1ca4f0c OrderPlaced
7b0a80b ItemAddedToCart
6d8d82d ItemAddedToCart
389ee77 CartCreated
1ea8fce UserCreated
```

This is an e-commerce order lifecycle, stored as Git commits!

### View the Branch Structure

```bash
git log --oneline --all --graph
```

```text
* ad2d0de OrderCancelled        <- cancelled-order branch
| * a3a69ce OrderDelivered      <- main branch continues
| * b44d50a OrderShipped
| * d84d835 PaymentReceived
|/
* 1ca4f0c OrderPlaced           <- branch point
* 7b0a80b ItemAddedToCart
* 6d8d82d ItemAddedToCart
* 389ee77 CartCreated
* 1ea8fce UserCreated
```

Notice the fork! After `OrderPlaced`, there are two possible futures:
- **main**: The order was paid, shipped, and delivered
- **cancelled-order**: The order was cancelled

This is event sourcing with branching - parallel timelines in your data!

### Inspect a Single Event

```bash
git show --format="%B" -s a3a69ce
```

(Use one of your actual SHAs)

```json
{
  "type": "OrderDelivered",
  "payload": {
    "orderId": "order-m4x7k9p2",
    "signature": "A. Smith"
  },
  "correlationId": "order-m4x7k9p2",
  "timestamp": "2026-01-28T21:54:47.488Z",
  "version": 1
}
```

The commit message IS the event payload. No files, no blobs - just pure data in the commit itself.

### Look Under the Hood

```bash
git cat-file -p a3a69ce
```

```text
tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904
parent b44d50a...
author git-warp Demo <demo@git-warp.local> 1706478887 +0000
committer git-warp Demo <demo@git-warp.local> 1706478887 +0000

{
  "type": "OrderDelivered",
  ...
}
```

See that tree hash? `4b825dc642cb6eb9a060e54bf8d69288fbee4904` is the **empty tree** - it's the same for every commit. That's the "stunt" - we're using Git's commit graph without storing any files.

---

## Step 3: Run the Interactive Explorer

Still in the container, run:

```bash
node /app/examples/explore.js
```

Or from your host machine:

```bash
npm run demo:explore
```

This script demonstrates git-warp's traversal capabilities.

### Section 1: Event Replay

The explorer walks backwards through all ancestors of HEAD, collecting events:

```text
═══════════════════════════════════════════════════════════════
1. REPLAY ALL EVENTS (ancestors of HEAD)
═══════════════════════════════════════════════════════════════

[1ea8fce1] UserCreated
           {"userId":"user-alice-001","email":"alice@example.com","name":"Alice"}

[389ee773] CartCreated
           {"userId":"user-alice-001","cartId":"cart-001"}

[6d8d82dd] ItemAddedToCart
           {"cartId":"cart-001","sku":"WIDGET-001","qty":2,"price":29.99}

[7b0a80bb] ItemAddedToCart
           {"cartId":"cart-001","sku":"GADGET-002","qty":1,"price":149.99}

[1ca4f0c2] OrderPlaced
           {"orderId":"order-m4x7k9p2","cartId":"cart-001","total":209.97}

[d84d8356] PaymentReceived
           {"orderId":"order-m4x7k9p2","amount":209.97,"method":"card"}

[b44d50a1] OrderShipped
           {"orderId":"order-m4x7k9p2","carrier":"FastShip","tracking":"FS123456789"}

[a3a69ce7] OrderDelivered
           {"orderId":"order-m4x7k9p2","signature":"A. Smith"}
```

This is `graph.traversal.ancestors()` in action - O(1) lookups thanks to the bitmap index.

### Section 2: State Projection

The explorer replays events through a reducer to rebuild current state:

```text
═══════════════════════════════════════════════════════════════
2. REBUILD STATE (event sourcing projection)
═══════════════════════════════════════════════════════════════

Projected state:
{
  "users": {
    "user-alice-001": {
      "userId": "user-alice-001",
      "email": "alice@example.com",
      "name": "Alice",
      "createdAt": "2026-01-28T21:54:47.123Z"
    }
  },
  "carts": {
    "cart-001": {
      "userId": "user-alice-001",
      "items": [
        { "sku": "WIDGET-001", "qty": 2, "price": 29.99 },
        { "sku": "GADGET-002", "qty": 1, "price": 149.99 }
      ]
    }
  },
  "orders": {
    "order-m4x7k9p2": {
      "cartId": "cart-001",
      "total": 209.97,
      "status": "delivered",
      "payment": { "orderId": "order-m4x7k9p2", "amount": 209.97, "method": "card" },
      "shipping": { "orderId": "order-m4x7k9p2", "carrier": "FastShip", "tracking": "FS123456789" }
    }
  }
}
```

No database queries - just replay the events to get current state. This is the heart of event sourcing.

### Section 3: Branch Comparison

The explorer finds where the main and cancelled-order branches diverge:

```text
═══════════════════════════════════════════════════════════════
3. COMPARE BRANCHES (main vs cancelled-order)
═══════════════════════════════════════════════════════════════

Branch point: [1ca4f0c2] OrderPlaced

Main branch continued with:
  → PaymentReceived
  → OrderShipped
  → OrderDelivered

Cancelled branch has:
  → OrderCancelled
```

This demonstrates how branching enables "what-if" scenarios. Both timelines share the same history up to `OrderPlaced`, then diverge.

### Section 4: Path Finding

The explorer finds the shortest path between two events:

```text
═══════════════════════════════════════════════════════════════
4. PATH FINDING
═══════════════════════════════════════════════════════════════

Shortest path from first to last event: 8 hops
Path: 1ea8fce1 → 389ee773 → 6d8d82dd → 7b0a80bb → 1ca4f0c2 → d84d8356 → b44d50a1 → a3a69ce7
```

This uses bidirectional BFS - the same algorithm used in social network "degrees of separation" queries.

### Section 5: Topological Sort

Events in dependency order:

```text
═══════════════════════════════════════════════════════════════
5. TOPOLOGICAL ORDER
═══════════════════════════════════════════════════════════════

Events in dependency order:
  1. UserCreated
  2. CartCreated
  3. ItemAddedToCart
  4. ItemAddedToCart
  5. OrderPlaced
  6. PaymentReceived
  7. OrderShipped
  8. OrderDelivered
```

Kahn's algorithm ensures dependencies come before dependents - essential for correct replay.

---

## Step 4: Experiment!

You're in a real Git repo. Try these:

### Add Your Own Event

```bash
# Create a new event (note: this uses git commit-tree directly)
git commit-tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904 \
  -p $(git rev-parse main) \
  -m '{"type":"RefundIssued","payload":{"orderId":"order-m4x7k9p2","amount":50}}'
```

This returns a new SHA. To make it visible, update a ref:

```bash
git update-ref refs/heads/main <new-sha>
```

### Compare Timelines

```bash
# What's different between main and cancelled-order?
git log main --not cancelled-order --oneline
git log cancelled-order --not main --oneline
```

### Time Travel

```bash
# What was the state after OrderPlaced but before payment?
git log --oneline main~3  # Go back 3 commits from HEAD
```

### Rebuild the Index

If you add events, rebuild the index to include them:

```bash
node -e "
// Note: This script reflects the v2.5.0 API. Check index.js exports if API has changed.
const { default: WarpGraph, GitGraphAdapter } = await import('/app/index.js');
const GitPlumbing = (await import('@git-stunts/plumbing')).default;

const plumbing = new GitPlumbing({ cwd: process.cwd() });
const adapter = new GitGraphAdapter({ plumbing });
const graph = new WarpGraph({ persistence: adapter });

const indexOid = await graph.rebuildIndex('main');
await graph.saveIndex();
console.log('Index rebuilt:', indexOid.slice(0, 8));
"
```

---

## Step 5: Clean Up

Exit the container:

```bash
exit
```

Tear down the demo environment:

```bash
npm run demo:down
```

This removes the container and volumes. Run `demo:setup` again anytime to start fresh.

---

## What You Just Learned

1. **Git commits are events** - The commit message holds the payload, parent pointers define ordering
2. **The empty tree trick** - Every commit points to the same empty tree (`4b825dc...`) - no files stored
3. **Branching = parallel timelines** - Model "what-if" scenarios naturally
4. **Bitmap indexes enable fast traversal** - O(1) parent/child lookups via Roaring Bitmaps
5. **Standard graph algorithms work** - BFS, DFS, shortest path, topological sort

---

## Next Steps

- Read the [ARCHITECTURE.md](../ARCHITECTURE.md) for a technical deep-dive into index sharding and hexagonal design
- Check out the [README.md](../README.md) for the full API reference
- Look at the source in `src/domain/services/TraversalService.js` to see how algorithms are implemented
- Explore [examples/explore.js](./explore.js) to understand the event projection pattern
- Try building your own event-sourced application!

---

## Troubleshooting

### "Cannot find module" errors

```bash
# Inside container, reinstall deps
cd /app && npm install
```

### "No index found" errors

```bash
# Rebuild the index
npm run demo:setup
```

### Container won't start

```bash
# Full reset
npm run demo:down
docker volume prune -f
npm run demo:setup
```

### Permission errors on macOS

```bash
# Docker Desktop may need permissions for the mounted volume
# Check Docker Desktop > Settings > Resources > File sharing
```

---

## How the Demo Works

For the curious, here's what happens behind the scenes:

1. **`npm run demo:setup`** runs `docker compose up -d` in the `examples/` directory, then executes `setup.js` inside the container.

2. **`setup.js`** initializes a git repo at `/demo`, creates a chain of event commits using `graph.createNode()`, branches off at `OrderPlaced` to create an alternate timeline, and builds the bitmap index.

3. **`explore.js`** loads the index, then demonstrates:
   - `graph.traversal.ancestors()` for event replay
   - Event projection (reducer pattern)
   - `graph.traversal.descendants()` for branch comparison
   - `graph.traversal.shortestPath()` for path finding
   - `graph.traversal.topologicalSort()` for dependency ordering

4. **The bitmap index** is stored as a Git tree at `refs/git-warp/index`. It contains sharded JSON files with Roaring Bitmaps that enable O(1) relationship lookups.

---

Happy event sourcing!
