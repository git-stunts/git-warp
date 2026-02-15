#!/usr/bin/env node
/**
 * Event Sourcing with WarpGraph
 *
 * This file explains the concept. For working examples, run:
 *
 *   node setup.js         # Basic WarpGraph workflow
 *   node multi-writer.js  # Multi-writer convergence demo
 *
 * Or with Docker:
 *   cd examples
 *   docker compose up -d
 *   docker compose exec demo bash
 *   node setup.js         # Initialize sample data
 */

console.log(`
========================================================================
                    EVENT SOURCING WITH WARPGRAPH
========================================================================

WarpGraph turns Git into a multi-writer graph database. Each patch is
a commit containing CRDT operations for nodes, edges, and properties.

Why this works:
+-----------------------------------+--------------------------------------+
| Event Sourcing Requirement        | Git + WarpGraph Provides             |
+-----------------------------------+--------------------------------------+
| Append-only log                   | Commits are immutable                |
| Unique event IDs                  | SHA = content-addressed ID           |
| Multi-writer support              | Each writer has own ref chain        |
| Conflict-free merging             | CRDT semantics (OR-Set, LWW)         |
| Ordered sequence                  | Lamport timestamps + parent pointers |
| Audit trail                       | git log                              |
| Replication                       | git push / git pull                  |
| Integrity verification            | SHA checksums                        |
| Point-in-time recovery            | Checkpoints + materializeAt()        |
+-----------------------------------+--------------------------------------+

To try it yourself:

  node setup.js           # Basic workflow: open, patch, materialize
  node multi-writer.js    # Two writers with concurrent changes

Inside the repo you can also run:

  git for-each-ref refs/warp/   # See all graph refs
  git log --oneline <writer-ref>       # View a writer's patch chain
  git show <sha>                       # View raw commit data

========================================================================
`);

console.log('Run "node setup.js" to get started!\n');
