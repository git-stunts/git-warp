---
id: OWN_materialize-controller-god-object
blocked_by: []
blocks: []
feature: merge-strands-worldlines
---

# MaterializeController is a god object (~1009 LOC)

**Effort:** L

`MaterializeController.js` handles full materialization, incremental
materialization, coordinate materialization, strand materialization,
seek, adjacency building, index management, and state caching. That
is 5+ distinct reasons to change.

## What's wrong

- **S violation**: Multiple responsibilities packed into one class.
- Difficult to reason about which methods affect which state.
- Seek logic is entangled with materialization logic.

## Suggested fix

Extract into focused services:
- `SeekService` — seek + seek-diff operations
- `AdjacencyBuilder` — index-backed adjacency construction
- `IndexCacheManager` — index tree caching and restoration
- `MaterializeController` remains as orchestrator, delegates to above.
