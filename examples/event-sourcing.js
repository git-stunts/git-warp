#!/usr/bin/env node
/**
 * Event Sourcing with EmptyGraph
 *
 * This file explains the concept. For a working interactive demo, run:
 *
 *   npm run demo:setup   # Creates container with sample data
 *   npm run demo         # Drops you into the container
 *   node explore.js      # Run the interactive explorer
 *
 * Or manually:
 *   cd examples
 *   docker compose up -d
 *   docker compose exec demo bash
 *   node setup.js        # Initialize sample data
 *   node explore.js      # Explore the graph
 */

console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                     EVENT SOURCING WITH EMPTYGRAPH                            ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  EmptyGraph turns Git into an event store. Each event is a commit pointing   ║
║  to the empty tree, with the event payload as the commit message.            ║
║                                                                               ║
║  Why this works:                                                              ║
║  ┌─────────────────────────────────┬─────────────────────────────────────┐   ║
║  │ Event Sourcing Requirement      │ Git Provides                        │   ║
║  ├─────────────────────────────────┼─────────────────────────────────────┤   ║
║  │ Append-only log                 │ Commits are immutable               │   ║
║  │ Unique event IDs                │ SHA = content-addressed ID          │   ║
║  │ Ordered sequence                │ Parent pointers = ordering          │   ║
║  │ Audit trail                     │ git log                             │   ║
║  │ Replication                     │ git push / git pull                 │   ║
║  │ Integrity verification          │ SHA checksums                       │   ║
║  │ Point-in-time recovery          │ git checkout <sha>                  │   ║
║  │ Branching (what-if scenarios)   │ git branch                          │   ║
║  └─────────────────────────────────┴─────────────────────────────────────┘   ║
║                                                                               ║
║  To try it yourself:                                                          ║
║                                                                               ║
║    npm run demo:setup    # Spin up container + create sample events          ║
║    npm run demo          # Drop into the container shell                     ║
║    node explore.js       # Interactive exploration of the event graph        ║
║                                                                               ║
║  Inside the container you can also run:                                       ║
║                                                                               ║
║    git log --oneline --all --graph   # Visualize the event DAG              ║
║    git show <sha>                    # View raw event data                  ║
║    git diff main cancelled-order     # Compare alternate timelines          ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

console.log('Run "npm run demo:setup" to get started!\n');
