# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **git-warp CLI** - canonical `git warp` entrypoint (shim + PATH install)
- **Installer scripts** - `scripts/install-git-warp.sh` and `scripts/uninstall-git-warp.sh`
- **Docker bats CLI test** coverage for `git warp` commands
- **Pre-push hook** - runs lint, unit tests, benchmarks, and Docker bats CLI suite
- **`graph.serve()`** - one-line HTTP sync transport for multi-writer graphs
- **`graph.syncWith()`** - sync with HTTP peer or direct graph instance
- **`graph.getWriterPatches(writerId)`** - public API for writer patch history

#### Query API (V7 Task 7)
- **`graph.hasNode(nodeId)`** - Check if node exists in materialized state
- **`graph.getNodeProps(nodeId)`** - Get all properties for a node as Map
- **`graph.neighbors(nodeId, dir?, label?)`** - Get neighbors with direction/label filtering
- **`graph.getNodes()`** - Get all visible node IDs
- **`graph.getEdges()`** - Get all visible edges as `{from, to, label}` array

All query methods operate on `WarpStateV5` (materialized state), never commit DAG topology.

#### WARP State Index (V7 Task 6)
- **`WarpStateIndexBuilder`** - New index builder that indexes WARP logical edges from `edgeAlive` OR-Set
- **`buildWarpStateIndex(state)`** - Convenience function to build and serialize index from state
- Index built from materialized state, not Git commit parents (TECH-SPEC-V7.md compliance)

### Changed
- **Repo ping** now uses `git rev-parse --is-inside-work-tree` for plumbing compatibility
- **CLI imports** avoid eager `index.js` loading to suppress `url.parse` warnings from optional deps
- **v7-guards.test.js** - Added `WarpStateIndexBuilder.js` to required V7 components
- **Benchmarks** now run in non-watch mode for CI/pre-push safety
- **Docker test image** copies hooks/patches before `npm install` to support postinstall
- **Git ref reads** guard missing refs to avoid fatal `show-ref` errors in empty repos

### Documentation
- **`docs/V7_TEST_MAPPING.md`** - Maps TECH-SPEC-V7.md Task 5 requirements to existing test files
  - Documents how existing tests cover WARP contracts (write, materialize, convergence, determinism)
  - Confirms legacy tests deleted (not skipped)
  - Provides verification commands
- Hook docs updated in README/CONTRIBUTING
- Example imports clarified for external consumers

### Tests
- Added `test/unit/domain/WarpGraph.query.test.js` (21 tests) - Query API tests
- Added `test/unit/domain/services/WarpStateIndexBuilder.test.js` (13 tests) - WARP state index tests
- Total test count: 1438

## [6.0.0] - 2026-01-31

### Breaking Changes

#### WARP Unification Complete
- **`WarpGraph` is now the recommended API** for all new projects
- **`EmptyGraph` is now a wrapper** - Implementation moved to `EmptyGraphWrapper.js`, maintains full API compatibility
- **Schema:2 is now the default** for `WarpGraph.open()` and `openMultiWriter()`
- **Legacy EmptyGraph engine removed** - Old implementation frozen in wrapper for compatibility

### Added

#### WARP v5 (OR-Set CRDT)
- **OR-Set CRDTs** - `Dot`, `VersionVector`, `ORSet` for add-wins semantics
- **`JoinReducer`** - CRDT join operation with schema:2 support
- **`PatchBuilderV2`** - Schema:2 patch builder with dot tracking
- **`CheckpointSerializerV5`** - V5 checkpoint format with OR-Set state
- **`SyncProtocol`** - Network sync request/response with frontier comparison
- **`GCPolicy` & `GCMetrics`** - Tombstone garbage collection
- **Backfill rejection** - Graph reachability validation against checkpoint frontier

#### Migration Support
- **`migrateV4toV5()`** - Exported from package root for schema migration
- **Migration boundary validation** - Prevents opening schema:2 with unmigrated v1 history

#### API Status Documentation
- **README API Status section** - Clear guidance on recommended vs deprecated APIs
- **Migration examples** - Code samples for EmptyGraph → WarpGraph migration

### Changed
- `WarpGraph.open()` now defaults to `schema: 2`
- `EmptyGraph.openMultiWriter()` explicitly passes `schema: 2`
- `EmptyGraph` constructor shows deprecation warning (once per process)

### Removed
- `src/legacy/EmptyGraphLegacy.js` - Legacy engine code removed (wrapper preserves API)

## [4.0.0] - 2026-01-31

### Added

#### Multi-Writer Support (WARP Protocol v4)
- **`EmptyGraph.openMultiWriter()`** - New static factory for creating multi-writer graphs with deterministic convergence
- **`WarpGraph`** - Main API class for WARP multi-writer graph operations
- **`PatchBuilder`** - Fluent API for constructing graph mutations as atomic patches
  - `.addNode(nodeId)` - Add a node
  - `.removeNode(nodeId)` - Tombstone a node
  - `.addEdge(from, to, label)` - Add an edge
  - `.removeEdge(from, to, label)` - Tombstone an edge
  - `.setProperty(nodeId, key, value)` - Set a property
  - `.commit()` - Commit the patch atomically

#### State Materialization
- **`graph.materialize()`** - Reduces all patches from all writers to current state
- **`graph.materializeAt(checkpointSha)`** - Incremental materialization from checkpoint
- **`graph.discoverWriters()`** - List all writers who have contributed to the graph

#### Checkpoints
- **`CheckpointService`** - Create, load, and incrementally rebuild from checkpoints
- **`graph.createCheckpoint()`** - Snapshot current state for fast recovery
- Checkpoint format: `state.cbor`, `frontier.cbor` in Git tree

#### Coverage & Sync
- **`graph.syncCoverage()`** - Create octopus anchor ensuring all writers reachable from single ref

#### CRDT Foundation
- **`LWW` (Last-Writer-Wins)** - Register type for conflict resolution
- **`EventId`** - Total ordering tuple `(lamport, writerId, patchSha, opIndex)`
- **`Reducer`** - Deterministic fold algorithm with LWW semantics
- **`Frontier`** - Writer progress tracking `Map<writerId, lastPatchSha>`
- **`StateSerializer`** - Canonical state hashing for determinism verification

#### Infrastructure
- **`WarpMessageCodec`** - Encode/decode patch, checkpoint, and anchor commit messages with Git trailers
- **`CborCodec`** - Canonical CBOR encoding for deterministic serialization
- **`RefLayout`** - Ref path builders and validators for WARP ref structure
- **`LegacyAnchorDetector`** - Backward compatibility for v3 JSON anchors

#### GitGraphAdapter Extensions
- **`commitNodeWithTree()`** - Create commits pointing to custom trees (for patch attachments)
- **`listRefs(prefix)`** - List refs under a prefix (for writer discovery)

### Performance
- 10K patches reduce in ~100ms (50x faster than 5s requirement)
- Memory usage ~35MB for 10K patches (well under 500MB limit)
- Incremental materialization from checkpoints for O(new patches) recovery

### Documentation
- Added "Multi-Writer API (WARP v4)" section to README
- Created `docs/MULTI-WRITER-GUIDE.md` - Comprehensive user guide
- Created `docs/WARP-TECH-SPEC-ROADMAP.md` - Full protocol specification
- Created `docs/WARP-V5-HANDOFF.md` - Handoff notes for v5 implementation

### Testing
- Determinism tests: verify `reduce([A,B]) === reduce([B,A])`
- Tombstone stability tests: concurrent add/tombstone/property scenarios
- Performance benchmarks: 1K, 5K, 10K, 25K patch scaling
- v3 backward compatibility tests: legacy anchor detection
- Integration tests: real Git operations with multiple writers

## [3.0.0] - 2025-01-30

### Added

#### Managed Mode & Durability
- **`EmptyGraph.open()`** - New static factory for creating managed graphs with automatic durability guarantees
- **Anchor commits** - Automatic creation of anchor commits to prevent GC of disconnected subgraphs
- **`graph.sync(sha)`** - Manual ref synchronization for `autoSync: 'manual'` mode
- **`graph.anchor(ref, shas)`** - Power user method for explicit anchor creation

#### Batching API
- **`graph.beginBatch()`** - Start a batch for efficient bulk writes
- **`GraphBatch.createNode()`** - Create nodes without per-write ref updates
- **`GraphBatch.commit()`** - Single octopus anchor for all batch nodes
- **`graph.compactAnchors()`** - Utility to compact anchor chains into single octopus

#### Validation & Error Handling
- **`EmptyMessageError`** - New error type for empty message validation (code: `EMPTY_MESSAGE`)
- Empty messages now rejected at write time (prevents "ghost nodes")

#### Index Improvements
- **Canonical JSON checksums** - Deterministic checksums for cross-engine compatibility
- **Shard version 2** - New format with backward compatibility for v1
- **`SUPPORTED_SHARD_VERSIONS`** - Reader accepts both v1 and v2 shards

#### Performance
- **`isAncestor()`** - New method on GitGraphAdapter for ancestry checking
- **Fast-forward detection** - `syncHead()` skips anchor creation for linear history
- **Octopus anchoring** - Batch.commit() creates single anchor with N parents

#### Cancellation
- AbortSignal propagation added to all TraversalService methods
- AbortSignal support in StreamingBitmapIndexBuilder finalization

#### Node Query API
- **`getNode(sha)`** - Returns full GraphNode with all metadata (sha, author, date, message, parents)
- **`hasNode(sha)`** - Boolean existence check without loading full node data
- **`countNodes(ref)`** - Count nodes reachable from a ref without loading all nodes into memory

#### Batch Operations
- **`createNodes(nodes)`** - Create multiple nodes in a single operation with placeholder parent refs

#### Caching & Resilience
- **LRU Cache** - Loaded shards now use an LRU cache to bound memory usage
- **Retry Logic** - `GitGraphAdapter` now retries transient Git failures with exponential backoff and decorrelated jitter
  - Uses `@git-stunts/alfred` resilience library
  - Retries on: "cannot lock ref", "resource temporarily unavailable", "connection timed out"
  - Configurable via `retryOptions` constructor parameter
- **CachedValue Utility** - Reusable TTL-based caching utility in `src/domain/utils/CachedValue.js`
- **Memory Warning** - `BitmapIndexReader` logs a warning when ID-to-SHA cache exceeds 1M entries (~40MB)

### Changed
- `SHARD_VERSION` bumped from 1 to 2 (v1 still readable)
- **TraversalService** - Refactored path reconstruction into unified `_walkPredecessors()` and `_walkSuccessors()` helpers
- **HealthCheckService** - Now uses `CachedValue` utility instead of inline caching logic

### Fixed
- **Durability bug** - Nodes created via `createNode()` were not reachable from any ref, making them vulnerable to Git GC
- **Ghost nodes** - Empty messages allowed at write time but rejected during iteration

### Documentation
- Added `SEMANTICS.md` - Durability contract and anchor commit semantics
- Updated `README.md` - Durability warning, mode selection guide, new API docs
- Added **Memory Considerations** section documenting memory requirements for large graphs

## [2.5.0] - 2026-01-29

### Added
- **Git Hooks**: Custom pre-commit hook runs ESLint on staged files (`npm run setup:hooks` to enable)
- **Cancellation Support**: Abort long-running operations with `AbortSignal`
  - `checkAborted(signal, operation)` - Throws `OperationAbortedError` if aborted
  - `createTimeoutSignal(ms)` - Creates auto-aborting signal for timeouts
  - Added `signal` parameter to `iterateNodes()` and `rebuildIndex()`
  - Demo scripts now use 60-second timeout to prevent indefinite hangs
- **Dijkstra's Algorithm**: `weightedShortestPath()` with custom weight provider
  - Supports async weight functions for Lagrangian cost calculations
  - Returns `{ path, totalCost }`
- **A* Search**: `aStarSearch()` with heuristic guidance
  - Supports both `weightProvider` and `heuristicProvider` callbacks
  - Tie-breaking favors higher g(n) for efficiency
  - Returns `{ path, totalCost, nodesExplored }`
- **Bidirectional A***: `bidirectionalAStar()` - meets in the middle from both ends
  - Separate forward/backward heuristics
  - Optimal path finding with potentially fewer explored nodes
- **MinHeap Utility**: `src/domain/utils/MinHeap.js` for priority queue operations
  - Methods: `insert()`, `extractMin()`, `peekPriority()`, `isEmpty()`, `size()`
- **Lagrangian Demo**: `npm run demo:lagrangian` - Resource-aware pathfinding
  - Event payloads now include `metrics: { cpu, mem }` for weight calculations
  - Demonstrates Dijkstra, A*, and cost optimization concepts
- **Streaming Benchmark**: `npm run demo:bench-streaming` - Memory profile for 100K+ nodes
  - Verifies constant memory overhead during iteration (~7% variance)
  - Measures stream throughput (~24K nodes/sec)
- **Traversal Benchmark**: `npm run demo:bench-traversal` - Weighted pathfinding at scale
  - Tests Dijkstra, A*, Bidirectional A* on linear and diamond graphs (100-5000 nodes)
  - Compares algorithm performance characteristics
- **OperationAbortedError**: New error class for cancellation scenarios

### Changed
- **Cancellation**: `createTimeoutSignal()` now uses native `AbortSignal.timeout()` for cleaner implementation
- **BitmapIndexReader**: Non-strict mode now caches empty shards on validation/parse failures to avoid repeated I/O
- **BitmapIndexReader**: Refactored for reduced complexity with extracted helper methods (`_validateShard`, `_parseAndValidateShard`, `_loadShardBuffer`, `_getEdges`)
- **StreamingBitmapIndexBuilder**: Parallel shard writes using `Promise.all` for improved performance during flush and finalize operations
- **TraversalService**: `findPath()` now accepts `maxNodes` parameter for consistency with `bfs`/`dfs`
- **index.js**: `loadIndex()` now resets cached `_traversal` so subsequent access uses the new index
- **Async Weight Providers**: `weightProvider` callbacks now properly awaited in all algorithms
  - Fixes bug where async weight functions returned Promises instead of numbers
- **README**: Reorganized sections for better flow - moved Use Cases up, improved navigation

### Fixed
- **Constructor Validation**: All services now fail fast with clear error messages when required dependencies are missing
  - `BitmapIndexReader` requires `storage`
  - `IndexRebuildService` requires `graphService` and `storage`
  - `StreamingBitmapIndexBuilder` requires positive `maxMemoryBytes`
  - `GraphService` requires `persistence`, positive `maxMessageBytes`, and string `message`
  - `TraversalService` requires `indexReader`
- **Examples**: Improved robustness across demo scripts
  - `lagrangian-path.js`: handles empty graphs and malformed JSON gracefully
  - `explore.js`: guards against empty events, removes unused import, adds curly braces, adds eslint overrides, wraps all JSON.parse calls
  - `setup.js`: clears timeout to allow immediate process exit
  - `streaming-benchmark.js`: handles divide-by-zero and -Infinity edge cases when no heap samples
  - `traversal-benchmark.js`: catches JSON parse errors in weight provider, refactored deep nesting
  - `inspect-index.js`: renamed misleading `totalEdges` to `totalEdgeLists`
  - `event-sourcing.js`: removed unused eslint-disable directives
- **ESLint Code Style**: Comprehensive cleanup across all example scripts
  - Added curly braces to all single-line if/else blocks
  - Converted string concatenation to template literals
  - Split multi-variable declarations (one-var rule)
  - Refactored deeply nested blocks to reduce max-depth violations
  - Converted 4-parameter functions to options objects (max-params rule)
  - Removed unused variables and redundant eslint-disable directives
- **Error Classes**: Removed redundant `Error.captureStackTrace` calls in `ShardValidationError` and `ShardCorruptionError`
- **GitLogParser**: Removed `trim()` from final record to preserve message content exactly
- **BitmapIndexReader**: `_validateShard` now guards against missing/invalid `envelope.data` before computing checksum
- **StreamingBitmapIndexBuilder**: `_mergeChunks` wraps JSON parse, bitmap deserialize, and serialization errors in `ShardCorruptionError`
- **Cancellation**: `checkAborted` now passes `'unknown'` as fallback when operation is undefined
- **TraversalService**: Path reconstruction methods now guard against undefined predecessors to prevent infinite loops
- **TraversalService**: `_reconstructBidirectionalPath` guards fixed to check `undefined` instead of `null`
- **Tests**: Improved test stability and resilience
  - NoOpLogger performance test uses generous threshold for CI environments
  - BitmapIndexBuilder tests use hex-like SHAs for realism
  - Streaming index tests store raw buffers and use resilient assertions
  - GraphService test uses idiomatic `expect().rejects.toThrow()` pattern
  - StreamingBitmapIndexBuilder test mock uses SHA-256 checksums matching production
  - logging.integration test properly invokes async IIFE for `.rejects` matcher
  - Weight provider not awaited in `weightedShortestPath`, `aStarSearch`, and `bidirectionalAStar`

### Docs
- README: Added `text` language specifier to output code blocks
- TASKLIST: Fixed table formatting and grammar
- ARCHITECTURE: Fixed table separator spacing, renamed CacheRebuildService to IndexRebuildService
- WALKTHROUGH: Added language specifiers, converted bold to headings, fixed deleted demo-adapter.js reference
- **TypeScript**: Comprehensive type declaration updates
  - Added `OperationAbortedError`, `IndexError`, `ShardLoadError`, `ShardCorruptionError`, `ShardValidationError`, `StorageError` classes
  - Added `checkAborted` and `createTimeoutSignal` function declarations
  - Added `signal` parameter to `IterateNodesOptions` and `RebuildOptions`
  - Added `maxMemoryBytes`, `onFlush`, `onProgress` to `RebuildOptions`
  - Added `maxNodes` to `PathOptions`
  - Added `weightedShortestPath`, `aStarSearch`, `bidirectionalAStar` method declarations
  - Added `throwOnCycle` to `TopologicalSortOptions`

## [2.4.0] - 2026-01-29

### Added
- **Interactive Docker Demo**: Production-ready demo using real `GitGraphAdapter` with plumbing
  - `npm run demo:setup` - Creates container with sample e-commerce event graph (idempotent)
  - `npm run demo` - Drops into container shell for exploration
  - `npm run demo:explore` - Runs interactive graph explorer demonstrating traversal, projections, and path finding
  - `npm run demo:inspect` - Visualizes sharded bitmap index with ASCII distribution charts
- **Idempotent Demo Setup**: `setup.js` now detects existing demo data and cleans up before re-running
- **Performance Telemetry**: `explore.js` includes high-resolution timing comparing O(1) bitmap lookups vs git log (with speedup factors)
- **Index Inspector**: New `inspect-index.js` script pretty-prints shard distribution, node counts, and memory estimates

### Changed
- **Plumbing Upgrade**: Upgraded `@git-stunts/plumbing` from `^2.7.0` to `^2.8.0`
  - Version 2.8.0 adds `log` and `show` to the command whitelist
- **NUL Byte Handling**: `GitGraphAdapter.logNodesStream()` now strips NUL bytes from format strings
  - The `-z` flag handles NUL termination automatically
  - Node.js `child_process` rejects args containing null bytes

### Removed
- **Demo Adapter Hack**: Deleted `examples/demo-adapter.js` bypass adapter
  - Demo scripts now use production `GitGraphAdapter` directly

### Fixed
- **Demo Scripts**: `examples/setup.js` and `examples/explore.js` now use proper plumbing integration

## [2.3.0] - 2026-01-18

### Added
- **OID Validation**: New `_validateOid()` method in `GitGraphAdapter` validates all Git object IDs before use
- **DEFAULT_INDEX_REF Export**: The default index ref constant is now exported for TypeScript consumers
- **Benchmark Environment Notes**: Added reproducibility information to THE_STUNT.md

### Changed
- **Configurable Rebuild Limit**: `CacheRebuildService.rebuild()` now accepts an optional `{ limit }` parameter (default: 10M)
- **Docker Compose v2**: CI workflow updated to use `docker compose` (space-separated) instead of legacy `docker-compose`
- **Robust Parent Parsing**: Added `.filter(Boolean)` to handle empty parent lines from root commits
- **UTF-8 Streaming**: `TextDecoder` now uses `{ stream: true }` option to correctly handle multibyte characters split across chunks

### Security
- **OID Injection Prevention**: All OIDs validated against `/^[0-9a-fA-F]{4,64}$/` pattern
- **OID Length Limits**: OIDs cannot exceed 64 characters
- **Format Parameter Guard**: `logNodes`/`logNodesStream` now conditionally add `--format` flag to prevent `--format=undefined`

### Fixed
- **UTF-8 Chunk Boundaries**: Commit messages with multibyte UTF-8 characters no longer corrupted when split across stream chunks
- **Empty Parent Arrays**: Root commits now correctly return `[]` instead of `['']` for parents

### Tests
- **Stronger Assertions**: `CacheRebuildService.test.js` now verifies `writeBlob` call count
- **End-to-End Coverage**: Enabled `getParents`/`getChildren` assertions in integration tests
- **Public API Usage**: Benchmarks now use public `registerNode()` instead of private `_getOrCreateId()`

## [2.2.0] - 2026-01-08

### Added
- **Comprehensive Audit Fixes**: Completed three-phase audit (DX, Production Readiness, Documentation)
- **iterateNodes to Facade**: Added `iterateNodes()` async generator method to EmptyGraph facade for first-class streaming support
- **JSDoc Examples**: Added @example tags to all facade methods (createNode, readNode, listNodes, iterateNodes, rebuildIndex)
- **Input Validation**: GraphNode constructor now validates sha, message, and parents parameters
- **Limit Validation**: iterateNodes validates limit parameter (1 to 10,000,000) to prevent DoS attacks
- **Graceful Degradation**: BitmapIndexService._getOrLoadShard now handles corrupt/missing shards gracefully with try-catch
- **RECORD_SEPARATOR Constant**: Documented magic string '\x1E' with Wikipedia link explaining delimiter choice
- **Error Handling Guide**: Added comprehensive Error Handling section to README with common errors and solutions
- **"Choosing the Right Method" Guide**: Added decision table for listNodes vs iterateNodes vs readNode

### Changed
- **API Consistency**: Standardized readNode signature from `readNode({ sha })` to `readNode(sha)` for consistency
- **Ref Validation**: Added 1024-character length limit to prevent buffer overflow attacks
- **Error Messages**: Enhanced error messages with documentation links (#ref-validation, #security)
- **Code Quality**: Refactored GitGraphAdapter.commitNode to use declarative array construction (flatMap, spread)
- **README Examples**: Fixed all code examples to match actual API signatures (readNode, await keywords)

### Security
- **Length Validation**: Refs cannot exceed 1024 characters
- **DoS Prevention**: iterateNodes limit capped at 10 million nodes
- **Input Validation**: GraphNode constructor enforces type checking on all parameters
- **Better Error Context**: Validation errors now include links to documentation

### Documentation
- **JSDoc Complete**: All facade methods now have @param, @returns, @throws, and @example tags
- **README Accuracy**: All code examples verified against actual implementation
- **Error Scenarios**: Documented common error patterns with solutions
- **Usage Guidance**: Added decision tree for choosing appropriate methods

### Technical Debt Reduced
- Eliminated magic string (RECORD_SEPARATOR now a documented constant)
- Improved code readability with declarative programming (flatMap vs forEach)
- Enhanced robustness with graceful degradation patterns

### Audit Results
- **DX Score**: 8/10 → 9/10 (API consistency improved)
- **IQ Score**: 9/10 → 9.5/10 (code quality improvements)
- **Combined Health Score**: 8.5/10 → 9.5/10
- **Ship Readiness**: YES - All critical and high-priority issues resolved

## [2.1.0] - 2026-01-08

### Added
- **Ref Validation**: Added `_validateRef()` method in `GitGraphAdapter` to prevent command injection attacks
- **Production Files**: Added LICENSE, NOTICE, SECURITY.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md
- **CI Pipeline**: GitHub Actions workflow for linting and testing
- **Enhanced README**: Comprehensive API documentation, validation rules, performance characteristics, and architecture diagrams
- **npm Metadata**: Full repository URLs, keywords, engines specification, and files array

### Changed
- **Dependency Management**: Switched from `file:../plumbing` to npm version `@git-stunts/plumbing: ^2.7.0`
- **Description**: Enhanced package description with feature highlights
- **Delimiter**: Confirmed use of ASCII Record Separator (`\x1E`) for robust parsing

### Security
- **Ref Pattern Validation**: All refs validated against `/^[a-zA-Z0-9_/-]+(\^|\~|\.\.|\.)*$/`
- **Injection Prevention**: Refs cannot start with `-` or `--` to prevent option injection
- **Command Whitelisting**: Only safe Git plumbing commands permitted through adapter layer

## [2.0.0] - 2026-01-07

### Added
- **Roaring Bitmap Indexing**: Implemented a sharded index architecture inspired by `git-mind` for O(1) graph lookups.
- **CacheRebuildService**: New service to scan Git history and build/persist the bitmap index as a Git Tree.
- **Streaming Log Parser**: Refactored `listNodes` to use async generators (`iterateNodes`), supporting graphs with millions of nodes without OOM.
- **Docker-Only Safety**: Integrated `pretest` guards to prevent accidental host execution.
- **Performance Benchmarks**: Added a comprehensive benchmark suite and D3.js visualization.

### Changed
- **Hexagonal Architecture**: Full refactor into domain entities and infrastructure adapters.
- **Local Linking**: Switched to `file:../plumbing` for explicit local-first development.
- **Delimiter Hardening**: Moved to a Null Byte separator for robust `git log` parsing.

## [1.0.0] - 2025-10-15

### Added
- Initial release with basic "Empty Tree" commit support.
