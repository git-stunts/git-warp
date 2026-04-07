# Incremental History Backfill for Git Mirror Use Cases

**Effort:** L

## Idea

Use case: mirroring git history into a warp graph — map each git
commit to an observation (one tick per commit). Works fine for HEAD
snapshots, but backfilling full history is O(commits) and takes
forever for large repos.

The append-only ledger makes incremental backfill hard: you can't
insert ticks at arbitrary points in the causal past. Once the
frontier has advanced, earlier observations can only arrive as new
patches, not as historical insertions.

## Possible approaches

- **Edges as chronological ordering:** Nodes represent commits,
  edges encode Lamport-ordered relationships between them. Backfill
  adds nodes + edges in reverse chronological order. Each batch is
  a new patch at the current frontier, but the edge structure
  encodes the historical timeline. The graph's materialized state
  shows the full DAG even though the patches arrived out of order.

- **Checkpoint-based seeding:** Snapshot HEAD as a checkpoint
  (fast). Then backfill historical commits as patches that add
  nodes/edges the snapshot doesn't cover. The checkpoint provides
  the "current state" instantly; backfill adds provenance depth
  incrementally.

- **Wormhole compression:** Paper III wormholes compress multi-tick
  segments into single edges carrying sub-payloads. A "history
  import" wormhole could represent N git commits as a single
  compressed segment, expandable on demand.

- **Lazy materialization with continuation tokens:** Don't backfill
  eagerly. Instead, when a query touches a node that references
  unmaterialized history, fetch and materialize on demand. The
  continuation token marks how far back the graph has been
  materialized.

## Why it matters

Git-warp-as-git-mirror is a compelling use case for the Inspector
and for agent collaboration. But any repo with >10K commits makes
naive tick-per-commit infeasible. The solution probably involves
separating "current state" (fast) from "historical provenance"
(incremental, lazy, or compressed).

## Source

James Ross, 2026-04-05. Raw idea during cycle 0009 session.
