# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
