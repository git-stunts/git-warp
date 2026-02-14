# Git Warp

## The Core Idea

git-warp is a graph database that doesn't need a database server. It stores all its data inside a Git repository by abusing a clever trick: every piece of data is a Git commit that points to the **empty tree** — a special object that exists in every Git repo. Because the commits don't reference any actual files, they're completely invisible to normal Git operations like `git log`, `git diff`, or `git status`. Your codebase stays untouched, but there's a full graph database living alongside it.

## What's a Graph Database?

Instead of rows and columns (like a spreadsheet or SQL database), a graph database stores **nodes** (things) and **edges** (relationships between things). So you might have nodes like `user:alice` and `user:bob`, connected by an edge labeled `manages`. Nodes and edges can both carry properties — key/value pairs like `name: "Alice"` or `since: "2024"`.

## The Multi-Writer Problem (and How It's Solved)

This is where it gets interesting. Multiple people (or machines, or processes) can write to the same graph **simultaneously, without any coordination**. There's no central server, no locking, no "wait your turn."

Each writer maintains their own independent chain of **patches** — atomic batches of operations like "add this node, set this property, create this edge." These patches are stored as Git commits under refs like `refs/warp/myGraph/writers/alice`.

When you want to read the graph, you **materialize** — which means replaying all patches from all writers and merging them into a single consistent view. The merge uses CRDTs (Conflict-free Replicated Data Types), which are mathematical structures that guarantee deterministic convergence regardless of what order the patches arrive in.

The specific CRDT rules are:

- **Nodes and edges** use an OR-Set (Observed-Remove Set). If Alice adds a node and Bob concurrently deletes it, the add wins — unless Bob's delete specifically observed Alice's add. This is the "add wins over concurrent remove" principle.
- **Properties** use LWW (Last-Writer-Wins) registers. If two writers set the same property at the same time, the one with the higher Lamport timestamp wins. Ties are broken by writer ID (lexicographic), then by patch SHA.
- **Version vectors** track causality across writers so the system knows which operations are concurrent vs. causally ordered.

Every operation gets a unique EventId — `(lamport, writerId, patchSha, opIndex)` — which creates a total ordering that makes merge results identical no matter which machine runs them.

## Syncing

Since the data lives in Git, syncing can be as simple as `git push` and `git pull`. But there's also a built-in HTTP sync protocol and a direct in-process sync for when two graph instances are running in the same application. The sync protocol works by comparing frontiers (each side's latest patch SHAs per writer), then shipping over whatever the other side is missing. It supports HMAC-SHA256 authentication, retries with exponential backoff, and abort signals.

## Querying

Once materialized, you get a fluent query builder:

```javascript
graph.query()
  .match('user:*')
  .where({ role: 'admin' })
  .outgoing('manages', { depth: [1, 3] })
  .aggregate({ count: true, avg: 'props.salary' })
  .run();
```

There's also full graph traversal — BFS, DFS, shortest path (bidirectional BFS), weighted shortest path (Dijkstra), A* search, topological sort, and connected components. All traversals support depth limits, abort signals, and direction control.

## Checkpoints and Performance

Materialization replays every patch, which gets expensive as the graph grows. **Checkpoints** snapshot the current state so future materializations only replay patches created after the checkpoint. You can configure auto-checkpointing (e.g., every 500 patches) and it handles this transparently.

For large graphs, there's a **bitmap index** system using Roaring bitmaps that enables O(1) neighbor lookups instead of scanning. The index is sharded by SHA prefix for lazy loading — cold start is near-zero memory, and a full index for a million nodes runs about 150–200 MB.

## Time Travel

The `seek` system lets you navigate to any point in the graph's history by Lamport tick. You can jump to an absolute tick, step forward/backward, save named bookmarks, and return to the present. Previously visited ticks are cached as content-addressed blobs for near-instant restoration. When a seek cursor is active, all queries and reads automatically show state at that tick.

## Advanced Features

**Observer Views** project the graph through filtered lenses — you define a match pattern and optionally redact sensitive properties. This gives you access control and data minimization without modifying the underlying graph. You can even measure the **translation cost** between two observers (how much information is lost going from one perspective to another), using Minimum Description Length theory.

**Temporal Queries** implement CTL*-style operators over history. `always()` checks if a predicate held at every tick, `eventually()` checks if it held at any tick. These let you ask questions like "was this PR ever merged?" or "was this user always active?"

**Forks** create a divergent copy of a graph at a specific point in a writer's history, with Git's content-addressing automatically deduplicating shared history.

**Wormholes** compress a contiguous range of patches into a single edge while preserving provenance — and two consecutive wormholes can be composed (they form a monoid).

**Audit Receipts** create a tamper-evident chain of records for every data commit — each receipt captures the operation outcomes, is CBOR-encoded into a Git tree, and is linked to the previous receipt via parent pointers. Mutating any receipt invalidates the entire chain downstream.

**Garbage Collection** compacts tombstoned entries from the OR-Sets, but only entries that all known writers have observed — so it never removes information an unsynced writer might still need.

## Architecture

The codebase follows hexagonal architecture (ports and adapters). **Ports** are abstract interfaces — `GraphPersistencePort`, `IndexStoragePort`, `LoggerPort`, `ClockPort`, `CryptoPort`, `CodecPort`. **Adapters** implement them for specific runtimes — there are adapters for Node.js, Deno, Bun, and browsers. The domain layer has zero direct Node.js imports, making it genuinely portable.

The project runs across Node 22+, Bun, and Deno, with a full multi-runtime test matrix in Docker. The CLI is available as `warp-graph` or as a Git subcommand (`git warp`), with ASCII visualization dashboards for queries, health checks, path finding, and time travel.

## The Academic Side

The whole thing is the reference implementation for something called WARP (Worldline Algebra for Recursive Provenance) graphs, described across four papers in the "AIΩN Foundations Series." The papers formalize the graph as a minimal recursive state object, give it deterministic tick-based semantics, develop computational holography and provenance payloads, and introduce the observer geometry with the translation cost metric. The codebase implements all of it.

It's built by a group called FLYING ROBOTS and licensed Apache-2.0.

---
## When git-warp Would Be Most Useful

**1. Distributed configuration management.** A fleet of servers each writing their own state (health, config, version) into a shared graph. No central database needed — each server is a writer, and any node can materialize the full picture after a `git pull`.

**2. Offline-first field applications.** Think geologists, aid workers, or inspectors collecting data on tablets with no connectivity. Each device writes patches locally. When they're back online, everything merges cleanly without conflict resolution meetings.

**3. Collaborative knowledge bases.** A research team where each member curates nodes and relationships (papers, concepts, people, citations) independently. The graph merges their perspectives, and observer views can give each team a filtered lens into just their domain.

**4. Git-native issue/project tracking.** Embedding a full project graph (tasks, dependencies, assignees, statuses) directly in the repo. No external service, no API keys, no vendor lock-in. The tracker lives and dies with the code.

**5. Audit-critical systems.** Anywhere you need a tamper-evident record of every change — regulatory compliance, legal discovery, medical records coordination. The audit receipt chain gives you cryptographic proof of what happened and when.

**6. Multi-team microservice dependency graphs.** Each team maintains their own service nodes and dependency edges. Materialization gives you a live, always-consistent dependency map across the whole org, synced through your existing Git infrastructure.

**7. Decentralized access control modeling.** Storing permission graphs (users, roles, resources, grants) where multiple admins across different regions can make changes independently. The OR-Set semantics mean a permission grant won't be accidentally lost to a concurrent revocation.

**8. IoT sensor networks.** Each sensor or gateway is a writer, logging readings and relationships (sensor → location, sensor → alert-threshold). Sync when bandwidth allows. Checkpoints keep materialization fast even with millions of readings.

**9. Game world state in multiplayer modding.** Modders independently add items, NPCs, quests, and relationships. The CRDT merge means mods compose without a central mod manager resolving conflicts — adds win over concurrent removes, so one mod can't accidentally delete another's content.

**10. Supply chain provenance.** Tracking goods through a supply chain where each participant (manufacturer, shipper, warehouse, retailer) writes their own nodes and edges. Temporal queries let you ask "was this item always in cold storage?" and the graph provides a cryptographically verifiable answer.

## Five Clever Uses

**1. Git repo archaeology as a graph.** Import your actual Git history as nodes and edges, then use git-warp's traversal and temporal queries to ask questions like "what's the shortest path between these two files through shared authors?" — and the whole analysis lives in the same repo it's analyzing.

**2. Personal knowledge graph that syncs like dotfiles.** Keep a `~/.brain` repo with a warp graph of everything you know — concepts, people, books, ideas, connections. It syncs across your machines via your normal dotfile workflow, and `git warp query` from the terminal replaces searching through notes.

**3. Distributed feature flags with rollback.** Each environment (staging, prod-us, prod-eu) is a writer maintaining feature flag states. Temporal queries let you answer "was this flag ever enabled in prod-eu?" and seek lets you roll back the flag graph to any point in time without touching your actual deployment.

**4. Peer-to-peer CRM.** A sales team where each rep tracks their own contacts, deals, and relationships offline. No Salesforce, no subscription fees. The graph merges at standup when everyone pushes, and observer views give management a redacted roll-up without exposing individual pipeline details.

**5. Executable architecture diagrams.** Store your system architecture as a warp graph — services, databases, queues, dependencies — then query it programmatically in CI. "Does any service have more than 3 hops to the auth service?" becomes a shortest-path query, and it's version-controlled with the code it describes.

## When NOT to Use It

**1. High-throughput transactional workloads.** If you need thousands of writes per second with immediate consistency (e-commerce checkout, real-time bidding), git-warp is the wrong tool. Every write is a Git commit, which involves disk I/O and SHA computation. Use Postgres, Redis, or a purpose-built OLTP database.

**2. Large binary or blob storage.** The data lives in Git commit messages, which are not designed for large payloads (default cap is 1 MB). If you're storing images, videos, or large documents as property values, you'll hit limits fast and bloat the Git repo. Use object storage.

**3. When you need real-time, sub-millisecond reads.** Materialization has to replay patches, and even with checkpoints there's overhead. If your application requires microsecond-level read latency (high-frequency trading, real-time gaming physics), use an in-memory database like Redis or a specialized engine.

**4. Simple key-value storage.** If your data model is flat — just keys mapping to values with no relationships — a graph database is overkill. Use a KV store, SQLite, or even a JSON file. The graph structure, CRDT machinery, and materialization overhead buy you nothing if you never traverse edges.

**5. When your team doesn't use Git.** The entire value proposition depends on Git infrastructure — pushing, pulling, refs, content-addressing. If your deployment environment doesn't have Git, or your users aren't comfortable with it, you're fighting the tool instead of leveraging it.
