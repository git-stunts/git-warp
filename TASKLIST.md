# Empty Graph Task List

> Last updated: 2026-01-18

## Project Status: ~85% Complete

The write path is solid. **The index query path is now complete.** Test coverage is strong (65 tests).

### Recent Progress (2026-01-18)
- Fixed fundamental bitmap design flaw (per-prefix → per-node)
- Implemented O(1) query API: `getParents()`, `getChildren()`
- Added 61 new tests (GraphNode: 24, BitmapIndexService: 37)
- Wired index loading to EmptyGraph facade

---

## 🔴 P0 - Critical Path (Blocking v1.0 Release)

### ✅ Index Query API (COMPLETED 2026-01-18)
~~The `BitmapIndexService` can **build** indexes but there's no exposed API to **query** them.~~

- [x] Add `getParents(sha)` → O(1) reverse edge lookup
- [x] Add `getChildren(sha)` → O(1) forward edge lookup
- [x] Wire `CacheRebuildService.load()` to the `EmptyGraph` facade
- [x] Add `readTreeOids()` to `GraphPersistencePort`

**Note:** Fixed a fundamental design flaw - bitmaps were keyed by prefix (shared), now keyed by full SHA (per-node). See GIT_STUNTS_MATERIAL.md for details.

### ✅ Test Coverage - Domain Layer (COMPLETED 2026-01-18)
- [x] `BitmapIndexService.test.js` - 37 tests covering sharding, serialize/deserialize, query methods
- [x] `GraphNode.test.js` - 24 tests covering validation, immutability, edge cases

---

## 🟡 P1 - Important (Quality & Completeness)

### Test Coverage - Edge Cases
- [ ] `GraphService` - error handling, malformed log output, empty graphs
- [ ] `CacheRebuildService` - large graphs, empty graphs, circular refs
- [ ] Ref validation edge cases (unicode, control chars, path traversal)

### Benchmark Suite
- [ ] Replace stub `test/benchmark/graph.bench.js` with real benchmarks
- [ ] Benchmark: createNode throughput
- [ ] Benchmark: iterateNodes memory profile
- [ ] Benchmark: bitmap index build time vs graph size
- [ ] Benchmark: O(1) lookup vs O(N) scan comparison

### Documentation
- [ ] Add `rebuildIndex()` and `loadIndex()` to README API reference
- [ ] Document the index tree structure in ARCHITECTURE.md
- [ ] Add sequence diagrams for index rebuild flow

---

## 🟢 P2 - Nice to Have (Polish)

### Developer Experience
- [ ] Add TypeScript declarations (`.d.ts` files)
- [ ] Add examples/ directory with runnable demos
- [ ] Integration test suite (runs in Docker against real Git)

### Performance Optimizations
- [ ] Shard the global `ids.json` map for >10M nodes (noted in ARCHITECTURE.md)
- [ ] Lazy shard loading benchmarks
- [ ] Consider LRU cache for loaded shards

### API Enhancements
- [ ] `graph.getNode(sha)` returning full `GraphNode` (not just message)
- [ ] `graph.hasNode(sha)` existence check
- [ ] `graph.countNodes(ref)` without loading all nodes
- [ ] Batch operations: `createNodes([...])` for bulk inserts

---

## 🔵 P3 - Future / Research

### Advanced Features
- [ ] Incremental index updates (don't rebuild from scratch)
- [ ] Index versioning / migrations
- [ ] Distributed index sync (index travels with `git push`)
- [ ] CRDT-style merge for concurrent graph writes

### Alternative Storage Backends
- [ ] Abstract the bitmap storage (not just Git trees)
- [ ] SQLite adapter for hybrid use cases
- [ ] In-memory adapter for testing without mocks

### Ecosystem
- [ ] CLI tool: `empty-graph init`, `empty-graph query`, etc.
- [ ] GraphQL adapter
- [ ] Cypher query language subset

---

## 📝 Notes & Ideas

### Architectural Observations
- The hex arch pays off: domain layer is 100% testable without Git
- Roaring bitmap WASM bindings "just work" - no node-gyp hell
- ASCII Record Separator (`\x1E`) was a great choice for log parsing
- **Sharding ≠ Keying**: The original bitmap design conflated storage partitioning with lookup keying. Fixed by using full SHA as key, prefix only for file grouping.

### Blog Material Candidates
- The "invisible database" concept (commits to Empty Tree)
- Streaming 10M nodes with async generators
- Security-first ref validation pattern
- "Stealing the soul" of git-mind's C architecture

### Open Questions
- Should index tree OID be stored in a Git ref? (e.g., `refs/empty-graph/index`)
- How to handle index invalidation on new writes?
- Worth adding Zod validation at the port boundary?

---

## Done ✅

- [x] Core hexagonal architecture
- [x] `GraphNode` entity (immutable, validated)
- [x] `GraphService` (create, read, list, iterate)
- [x] `BitmapIndexService` (sharding, serialize)
- [x] `CacheRebuildService` (build index from graph)
- [x] `GitGraphAdapter` implementation
- [x] `GraphPersistencePort` interface
- [x] `EmptyGraph` facade
- [x] Async generator streaming
- [x] Security hardening (ref validation)
- [x] Docker test setup
- [x] README with API docs
- [x] ARCHITECTURE.md
- [x] THE_STUNT.md
- [x] D3.js benchmark visualization
