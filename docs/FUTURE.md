# Future Work

Ideas and enhancements not yet implemented.

## Performance

- [ ] Shard the global `ids.json` map for >10M nodes

## Index Improvements

- [ ] Incremental index updates (don't rebuild from scratch)
- [ ] Index versioning / migrations
- [ ] Distributed index sync (index travels with `git push`)

## Alternative Storage Backends

- [ ] Abstract the bitmap storage (not just Git trees)
- [ ] SQLite adapter for hybrid use cases
- [ ] In-memory adapter for testing without mocks

## Ecosystem

- [ ] CLI tool: `warp-graph init`, `warp-graph query`, etc.
- [ ] GraphQL adapter
- [ ] Cypher query language subset
