# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [14.4.0] — 2026-03-15

### Added

- **Expanded `git warp debug` into a fuller TTD command family** — Added `debug coordinate` to inspect the resolved observation position, visible frontier, and tick-local receipt summary, and `debug timeline` to inspect a cross-writer causal patch timeline with entity/writer/Lamport-window filters. Together with `debug conflicts`, `debug provenance`, and `debug receipts`, the CLI now exposes a coherent five-topic time-travel debugger surface for operators and LLM agents.
- **Shared time-travel CLI helpers across `seek` and `debug`** — Extracted common frontier/tick helper logic so `seek` and the new debugger topics reuse the same coordinate and receipt computations instead of carrying duplicate substrate math in separate command adapters.

### Changed

- **TTD documentation now covers the full v1 debugger family** — Updated `README.md`, `ARCHITECTURE.md`, `docs/TTD.md`, `docs/GUIDE.md`, and `docs/CLI_GUIDE.md` so the debugger boundary, command map, and full flag surface are documented from one consistent time-travel-debugger story instead of lagging behind the CLI implementation.

## [14.3.0] — 2026-03-15

### Added

- **Expanded `git warp debug` command family** — Added `debug provenance` for causal patch provenance by entity ID and `debug receipts` for reducer/tick-receipt inspection, while keeping `debug conflicts` as the conflict-analysis entrypoint. The debug family now presents a coherent CLI-first time-travel debugger surface for operators and LLM agents.
- **Dedicated Time Travel Debugger documentation** — Added `docs/TTD.md` and updated `ARCHITECTURE.md`, `README.md`, `docs/GUIDE.md`, and `docs/CLI_GUIDE.md` so the debugger boundary, command map, and layering are documented in one canonical path rather than scattered across feature notes.

### Changed

- **Retired built-in browser/TUI viewer surfaces from the supported CLI story** — Removed the legacy `git warp view` command, removed the browser-viewer `git warp serve` command and its WebSocket/static-serving runtime stack, and trimmed the package surface so git-warp remains substrate plus thin debug CLI rather than a human-facing application shell.
- **Refactored debug CLI adapters into topic modules** — The `debug` command is now split into thin topic-specific adapters (`conflicts`, `provenance`, `receipts`) with shared cursor/materialization helpers and shared text/JSON rendering contracts, keeping the CLI aligned with hexagonal boundaries instead of accumulating one-off logic in a monolithic command file.

## [14.2.0] — 2026-03-15

### Added

- **Read-only conflict analyzer API** — Added `WarpGraph.analyzeConflicts()` as a deterministic substrate analyzer over patch history, reducer receipts, and resolved state. The new public surface returns explicit analysis coordinates, canonical target identities, deterministic `conflictId` / `analysisSnapshotHash` values, per-loser conflict participants, structured diagnostics, and zero durable writes during analysis.
- **Conflict analyzer type surface and regression fixtures** — Exported the new conflict-analysis types (`ConflictAnalysis`, `ConflictTrace`, `ConflictParticipant`, `ConflictTarget`, and related helpers) in the public declaration surface, added consumer/surface contract coverage, and introduced focused unit fixtures that lock down supersession, redundancy, eventual override, deterministic filtering, and truncation behavior.

### Changed

- **`@git-stunts/git-cas` floor raised to `^5.3.1`** — The declared minimum dependency now requires the `5.3.1` bugfix release, and the checked-in lockfile has been refreshed so local and release builds actually exercise the fixed CAS behavior instead of the prior `5.3.0` resolution.
- **Conflict analyzer v1 plan frozen in docs** — The active counterfactual/conflict-provenance direction now lives under `docs/plans/conflict-analyzer-v1.md`, with earlier draft specs archived so contributor guidance points at one canonical implementation target.
- **GitHub Actions runtime refresh** — Workflow actions now use Node-24-capable majors (`actions/checkout@v6`, `actions/setup-node@v6`, `actions/github-script@v8`), while the repo jobs themselves continue to run on Node 22. The release workflow now treats GitHub Releases and registry versions as immutable: if a tagged version already exists, it emits a warning and skips the repeated publish/update instead of mutating the existing release or retrying a republish.

### Fixed

- **Release preflight pack gate under `pipefail`** — `scripts/release-preflight.sh` now captures `npm pack --dry-run` output before checking for the tarball summary. Previously the `grep -q` pipeline could report a false failure because `set -o pipefail` treated the successful early-exit grep as a broken `npm pack` pipe.

## [14.1.0] — 2026-03-14

### Added

- **Content attachment metadata API** — `attachContent()` and `attachEdgeContent()` now accept optional `{ mime, size }` metadata hints, persist logical content byte size alongside the `_content` OID, and expose `getContentMeta()` / `getEdgeContentMeta()` for structured `{ oid, mime, size }` reads without manual `_content.*` property handling. Metadata reads stay aligned with the current `_content` attachment instead of inheriting stale sibling props from later manual rewrites.
- **Streaming transitive closure traversal** — Added `transitiveClosureStream()` to the traversal stack so callers can consume reachability edges lazily as an `AsyncGenerator<{ from, to }>` without materializing the full closure array. The existing `transitiveClosure()` API remains and now collects from the stream for backward compatibility.
- **First-class sync trust configuration** — `WarpGraph.open({ trust })` and `graph.syncWith(..., { trust })` now expose an explicit public trust-config surface for sync evaluation instead of relying on hidden controller wiring alone.
- **Fluent `WarpStateV5` test builder** — Added `createStateBuilder()` in `test/helpers/stateBuilder.js` so state-heavy tests can seed nodes, edges, removals, properties, frontier state, and graph materialization through one fluent helper instead of ad hoc OR-Set/LWW mutation.
- **Seeded tree-construction determinism fuzzer** — Added property-based coverage for patch and checkpoint tree construction, proving stable tree OIDs across internal content-anchor permutations in `PatchBuilderV2` and shuffled content-property insertion order in `CheckpointService.createV5()`.
- **Focused markdownlint gate** — Added `npm run lint:md` backed by `markdownlint-cli` and a repo config that enforces fenced code-block languages (`MD040`) across Markdown files.
- **Markdown JS/TS code-sample linter** — Added `npm run lint:md:code`, which scans fenced JavaScript and TypeScript blocks in Markdown and syntax-checks them with the TypeScript parser for file/line-accurate diagnostics.
- **Pre-push hook regression harness** — Added a focused Vitest behavioral harness for `scripts/hooks/pre-push` that exercises the real shell hook with stubbed commands, proves quick mode skips Gate 8, and verifies Gate 1–8 failure labels at runtime.

### Changed

- **Release audit override for transitive `tar`** — Added an npm `overrides` pin for `tar@7.5.11` so the published/runtime dependency tree can resolve past the `tar@<=7.5.10` high-severity advisory blocking the `v14.1.0` release audit.
- **Content metadata review follow-ups** — `ContentMeta` and `ContentAttachmentOptions` are now exported as public type-only symbols, the consumer smoke test imports them directly, and the git-cas adapter docs now explicitly note that MIME/size hints are accepted for CRDT metadata but are not embedded in CAS manifests.
- **Content metadata surface manifest follow-up** — the declaration contract manifest now matches the shipped API: `attachContent()` / `attachEdgeContent()` include the optional metadata parameter for both patch builders and patch sessions, and `WarpGraph` exports `getContentMeta()` / `getEdgeContentMeta()` in the tracked public surface.
- **Backlog expanded for roaring runtime evaluation** — `ROADMAP.md` now tracks `B170`, a dedicated benchmark slice for native `roaring` versus `roaring-wasm` across the bitmap-heavy hot paths used by the index builders and readers.
- **Roadmap reconciled after PR #69 merge** — `ROADMAP.md` now reflects the merged issue-45 content metadata work on `main`, records that the GitHub issue queue is empty, and keeps `B88` as the next tracked backlog slice.
- **Roadmap reconciled after PR #67 / #68 merges** — `ROADMAP.md` and `docs/ROADMAP/COMPLETED.md` now reflect the merged pre-push gate regression work (`B168`) and the current `main` baseline before the issue-45 slice branches off.
- **Large-graph traversal memory profile** — `topologicalSort()` now has a lightweight mode that avoids retaining discovery adjacency when callers do not need it. `levels()` and `transitiveReduction()` were refactored to re-fetch neighbors on demand instead of pinning full topo adjacency in memory, reducing steady-state large-graph working sets.
- **Roadmap reconciled after B87 merge** — `ROADMAP.md` now treats the Markdown code-sample linter as merged work on `main`, advances the CI/tooling wave to start at `B88`, and records the follow-up backlog items for pre-push gate-message regression coverage (`B168`) and archived-doc status guardrails (`B169`).
- **Surface validation accounting** — The declaration surface checker now distinguishes runtime-backed exports from type-only manifest entries and understands namespace declarations, which makes the type-surface contract tighter without forcing runtime exports for pure types.
- **Local push firewall now matches CI surface and docs checks** — `scripts/hooks/pre-push` now runs `npm run typecheck:surface`, `npm run lint:md`, and `npm run lint:md:code` alongside lint, strict typecheck, policy, and consumer surface checks before unit tests, so declaration-surface drift and Markdown sample regressions are blocked locally instead of waiting for CI.
- **Trust test infrastructure deduplicated** — The TrustRecordService suites now share a single in-memory ref/blob/tree/commit fixture and JSON codec via `test/helpers/trustTestUtils.js`, eliminating the four forked mock implementations that had started to drift.
- **Explicit type-only export manifest section** — `type-surface.m8.json` now separates runtime `exports` from declaration-only `typeExports`, and the surface checker now fails on misplaced or duplicate entries across those sections.
- **Constructor option-bag defaults made explicit** — Added an ESLint rule banning `constructor({ ... } = {})` in source files and rewrote the remaining constructors to destructure an explicit `options` bag inside the constructor body. This avoids accidentally marking required constructor params optional in JSDoc and strict type checking.
- **Checkpoint content-anchor batching** — `CheckpointService.createV5()` now folds content blob OIDs into sorted anchor entries in batches instead of building one monolithic `Set` before tree serialization. Added direct checkpoint coverage for anchor dedupe, deterministic ordering, and load-path indifference to `_content_*` anchor entries.
- **CI gate dedupe** — Folded the duplicate `lint` workflow job into `type-firewall` and carried forward the advisory runtime `npm audit` step there, leaving one authoritative lint/type gate in the main CI workflow.
- **Markdown fence labeling sweep** — Unlabeled Markdown code fences now declare a language such as `text`, letting the new markdown gate verify docs/examples without broad style-rule churn.
- **Docs static firewall extended** — The CI fast gate now runs both markdown fence-language checks and JavaScript/TypeScript code-sample syntax validation before the runtime matrix jobs.

### Fixed

- **Missing content blob OIDs now throw instead of reading as empty bytes** — `GitGraphAdapter.readBlob()` now disambiguates real zero-byte blobs from swallowed missing-object reads by checking object existence when a blob stream collects to zero bytes. Corrupted `_content` / edge-content references now surface `PersistenceError(E_MISSING_OBJECT)` through `getContent()` / `getEdgeContent()` instead of returning a truthy empty buffer.
- **Deno CI resolver drift** — The Deno test image now imports a Node 22 npm toolchain from `node:22-slim`, installs dependencies with `npm ci`, and runs tests with `--node-modules-dir=manual`, avoiding runtime npm re-resolution of `cbor-extract` optional platform packages while keeping the container on the repo’s supported Node engine line.
- **Markdown code-sample linter edge cases** — The Markdown JS/TS sample linter now recognizes fenced code blocks indented by up to three spaces, rejects malformed mixed-marker fences, fails on unterminated JS/TS fences, and parses snippets with the repository’s configured TypeScript target from `tsconfig.base.json`.
- **B87 review follow-ups** — Clarified the ADR folds snippet as a wholly proposed `graph.view()` sketch, corrected the pre-push quick-mode gate label to Gate 8, aligned the local hook’s gate numbers with CI for faster failure triage, and removed the self-expiring `pending merge` wording from the completed-roadmap archive entry.
- **Signed trust verification now performs real crypto checks** — Trust evaluation now verifies Ed25519 signatures and key fingerprints during evidence processing instead of stopping at envelope/shape validation.
- **Browser/WebSocket serve payload parity for edge properties** — `WarpServeService` state payloads now include edge properties, so served graph views no longer drop part of the graph model.
- **`attachContent()` / `attachEdgeContent()` orphan blob writes** — Content attachment now validates the target node/edge before writing blob content, preventing orphaned blob storage on invalid mutations.
- **`NodeWsAdapter` cleanup contracts** — Failed startup paths now clean up partial internal state, and shutdown is idempotent instead of leaving stale listener/server state behind.
- **Public export surface drift** — `WarpServeService` and `WebSocketServerPort` are exported from `index.js`, bringing runtime exports back into alignment with the declared public surface.
- **Type-policy false positives from declaration comments** — `ts-policy-check` now ignores inline declaration comments instead of flagging `any` mentions that exist only inside explanatory comments.
- **Trust/canonical property coverage** — Added property-based determinism coverage for `canonicalStringify()` and trust-schema canonical parse behavior, and tightened the trust property generators to avoid invalid whitespace-only `writerId` counterexamples.

## [14.0.0] — 2026-03-08

### Fixed

- **`_readPatchBlob` null-guard** — `readBlob()` returning null (corrupt/missing blob) now throws `PersistenceError` with `E_MISSING_OBJECT` instead of passing null to the CBOR decoder.
- **`browser.d.ts` missing exports** — Added `WarpError`, `createVersionVector`, and `generateWriterId` type declarations to match `browser.js` runtime exports. Fixed `WarpGraph` re-export from default to named.
- **`package.json` files array missing type declarations** — Added `browser.d.ts` and `sha1sync.d.ts` to the `files` array so npm consumers receive browser/sha1sync type definitions.
- **`isLoopback()` wildcard address documentation** — Added JSDoc and test coverage to explicitly document that wildcard bind addresses (`0.0.0.0`, `::`, `0:0:0:0:0:0:0:0`) are not treated as loopback and require `--expose`.
- **Browser and sha1sync subpath exports missing `types` field** — `package.json` `"./browser"` and `"./sha1sync"` exports now include `"types"` entries pointing to `browser.d.ts` and `sha1sync.d.ts`, enabling TypeScript resolution for subpath consumers.
- **`jsr.json` missing `browser.js` in publish.include** — JSR consumers importing `@git-stunts/git-warp/browser` now receive the file.
- **`git warp serve` help text missing `--port`, `--host`, `--expose` flags** — All serve-specific options now appear in `--help` output.
- **`WarpServeService` non-integer seek ceiling** — Fractional ceilings (e.g. `3.5`) are now rejected with `E_INVALID_PAYLOAD`. `Infinity` is intentionally accepted (treated as head).
- **`WarpServeService` oversized message guard** — Messages exceeding 1 MiB are rejected with `E_MESSAGE_TOO_LARGE` before `JSON.parse`, preventing OOM on malicious payloads.
- **`WarpServeService` oversized property value guard** — Wildcard-typed mutation args exceeding 64 KiB are rejected with `E_INVALID_ARGS`.
- **`SyncProtocol` / `WormholeService` null blob guard** — `readBlob()` / `retrieve()` results are now null-checked, throwing `PersistenceError(E_MISSING_OBJECT)` instead of passing `null` to the codec.
- **`hexDecode` regex replaced with charCode loop** — Direct character code validation avoids regex backtracking on large inputs.
- **WS adapter pre-handler message buffering** — Messages arriving before `onMessage(handler)` is called are now buffered and flushed when the handler is set. Prevents message loss in all WS adapters (Node, Bun, Deno) when connection setup is asynchronous.
- **NodeWsAdapter `onError` callback** — Constructor now accepts an optional `onError` callback that surfaces runtime server errors instead of silently swallowing them.
- **`wsAdapterUtils.messageToString()` TextDecoder reuse** — Hoisted `TextDecoder` to module level, avoiding per-call allocation.
- **Static file handler response objects frozen** — `FORBIDDEN` and `NOT_FOUND` response constants are now `Object.freeze()`d to prevent accidental mutation.
- **`sha1sync` comment clarification** — Updated misleading comment about the `>= 0x20000000` guard to explain it ensures `msg.length * 8` fits in uint32.
- **`_broadcastDiff` Set mutation during iteration** — Deleting dead clients from `this._clients` mid-`for...of` could skip the next entry. Dead connections are now collected and evicted after the loop completes.
- **Double-SIGINT re-entrancy in `serve` shutdown** — Rapid Ctrl+C fired `shutdown()` concurrently twice, racing `close()` and `process.exit()`. Added a `closing` guard.
- **Catch-all error envelope double-parsing** — The last-resort `.catch()` on `_onMessage` re-parsed the raw JSON to extract the correlation `id`. The ID is now extracted before the async call, avoiding double-parse and ensuring availability even if the raw message was consumed.
- **`WarpServeService` bare `Function` types** — Replaced loose `Function` JSDoc types in `resolveGraph`, constructor, and `_applyMutateOps` with a typed `GraphHandle` typedef carrying specific method signatures.
- **`jsr.json` missing `./browser` and `./sha1sync` exports** — Subpath exports added to `package.json` were not mirrored in `jsr.json`. JSR consumers can now import both.
- **`CasBlobAdapter` JSDoc `Buffer|Uint8Array`** — Narrowed `encryptionKey` type to `Uint8Array` per project convention.
- **`WarpServeService.listen()` double-call guard** — Calling `listen()` twice no longer silently creates duplicate subscriptions. Second call throws `"Server is already listening"`.
- **`WarpServeService.close()` dangling sockets** — Active WebSocket connections are now closed during shutdown instead of being silently abandoned.
- **`WarpServeService._handleOpen()` premature openGraphs add** — Graph is now marked as open only after materialization succeeds, preventing stale entries on failure.
- **`WarpServeService._applyMutateOps()` interleaved validation** — All ops in a batch are validated before `createPatch()` is called, avoiding wasted patch allocations on invalid input.
- **`base64Decode` silent garbage acceptance** — Malformed base64 input now throws `RangeError` instead of silently decoding to wrong output.
- **`NodeWsAdapter` state leak on failed start** — `listen()` failures now reset internal state (`_wss`, `_httpServer`), unblocking subsequent retry attempts.
- **`isLoopback()` incomplete range** — Now recognizes the full `127.0.0.0/8` range, not just `127.0.0.1`.
- **`buildSeekCacheKey` outside try/catch** — Cache key generation failure (e.g., crypto unavailable) is now caught and treated as a cache miss instead of breaking materialization.
- **`BunWsAdapter` test `globalThis.Bun` leak** — Tests now save and restore the original `globalThis.Bun` instead of deleting it unconditionally.
- **`vi.waitFor()` boolean callbacks in serve tests** — Replaced 22 boolean-returning callbacks with assertion-based ones to prevent premature resolution.
- **`WarpServeService.listen()` leaked subscriptions on bind failure** — If `server.listen()` rejected (e.g., EADDRINUSE), graph subscriptions were already registered and never cleaned up, causing ghost broadcast handlers. `listen()` now defers `_server` assignment and subscription registration until bind succeeds, and cleans up on failure.
- **`_onConnection` catch leaked internal error details** — The last-resort catch handler sent raw `err.message` (which could contain file paths, stack traces, etc.) to untrusted WebSocket clients. Now sends a generic `"Internal error"` message.
- **`git warp serve` silent blob data loss** — Mutation ops like `attachContent` and `attachEdgeContent` are async (they write blobs), but `_applyMutateOps` was not awaiting them. `patch.commit()` could fire before the blob write completed. Now all ops are awaited.
- **DenoWsAdapter port-0 resolution** — When binding to port 0 (OS-assigned), `onListen` resolved with the requested port (0) instead of the actual assigned port. Now reads `server.addr.port`, matching Node and Bun adapter behavior.
- **Static file handler symlink traversal** — A symlink inside `staticDir` pointing outside the root could bypass `safePath()` and serve arbitrary files. `tryReadFile` now resolves symlinks with `realpath()` and re-checks the prefix before reading.
- **`base64Encode` / `base64Decode` memory overhead** — Replaced intermediate binary string approach (`String.fromCharCode` / `charCodeAt` via `btoa`/`atob`) with direct table-based base64 encoding/decoding, eliminating memory spikes on large buffers (e.g., StreamingBitmapIndexBuilder shards).
- **Static file handler null-byte bypass** — `safePath()` now re-checks for `\0` after `decodeURIComponent()` (prevents `%00` bypass) and catches malformed percent-encoding (e.g., `%ZZ`) instead of throwing.
- **`git warp serve` writerId validation** — The auto-generated writerId (`serve:host:port`) contained colons, which are not allowed by `validateWriterId`. Now sanitizes to `serve-host-port` by replacing invalid characters with dashes.
- **`git warp serve` port-0 writerId collision** — When binding to port 0 (OS-assigned ephemeral port), every invocation produced the same writerId `serve-127.0.0.1-0`. Now includes a timestamp and PID component (`ephemeral-<base36>-<pid>`) to prevent collisions even across concurrent invocations in the same millisecond.
- **`git warp serve` IPv6 URL bracketing** — IPv6 addresses like `::1` are now bracketed in WebSocket and HTTP URLs (`ws://[::1]:3000`) per RFC 3986.
- **Inspector WebSocket default URL** — Hardcoded `ws://localhost:3000` replaced with `window.location`-derived URL, so `--static` serving on any port connects correctly without needing `?server=` param.
- **JSDoc type annotations** — Resolved 39 pre-existing `tsc --noEmit` strict-mode errors across 17 source files. Added missing `encrypted`, `blobStorage`, and `patchBlobStorage` fields to JSDoc `@param`/`@typedef` types; created `WarpGraphWithMixins` typedef for mixin methods calling `_readPatchBlob`; installed `@types/ws` for Node WebSocket adapter; fixed `Uint8Array<ArrayBufferLike>` assignability issues; narrowed `chunking.strategy` literal types for CAS adapters; added type annotations to callback parameters in WS adapters.
- **Inspector: "Go live" after time-travel** — `setCeiling(Infinity)` now calls `socket.open()` to re-materialize at head instead of sending `seek` with no ceiling. The server also now accepts `Infinity` as a ceiling value (treating it as "materialize at head") for robustness.
- **Inspector: localStorage persistence timing** — Server URL is now persisted to `localStorage` only after a successful connection, preventing a bad URL from locking users into a reconnect loop on reload.
- **CasBlobAdapter error propagation** — `retrieve()` now uses `CasError.code` (`MANIFEST_NOT_FOUND`, `GIT_ERROR`) from `@git-stunts/git-cas` to identify legacy blob fallback cases, with message-based matching as a fallback for non-CasError exceptions. Previously used brittle string matching on all error messages.
- **Dead `writerIds` code removed** — `WarpServeService` no longer stores per-session `writerIds` from `open` messages. The field was populated but never consumed — all mutations use the server's writer identity.
- **`_broadcastDiff` dead-client resilience** — A single dead WebSocket connection in `_broadcastDiff` could abort the loop, preventing remaining subscribed clients from receiving the diff. Each `send()` is now wrapped in try/catch; dead connections are evicted.
- **`attachContent`/`attachEdgeContent` wire validation** — Mutation arg validation now requires string content for `attachContent` and `attachEdgeContent` over WebSocket JSON. Previously accepted any type via wildcard (`*`), but `Uint8Array` cannot survive JSON serialization.
- **BunWsAdapter `close()` fire-and-forget** — `BunWsAdapter.close()` used `void server.stop()` and returned immediately. Now awaits the `stop()` promise, ensuring graceful shutdown.
- **EncryptionError unused `code` option** — Removed `code` from the constructor options typedef. The error code is always `E_ENCRYPTED_PATCH`; the option was dead.
- **CasBlobAdapter `Buffer.from` → `TextEncoder`** — Replaced `Buffer.from(content, 'utf8')` with `new TextEncoder().encode(content)` for consistency with the Uint8Array domain boundary.
- **Crypto adapter hmac wrapping** — Replaced `new Uint8Array(result.buffer, result.byteOffset, result.byteLength)` with `new Uint8Array(result)` in both `defaultCrypto` and `NodeCryptoAdapter.hmac()`, preventing shared ArrayBuffer pool aliasing.
- **Test `Buffer` usage cleanup** — Replaced `Buffer.from()` in type-check consumer test and `Buffer.from(result.buffer)` in CasSeekCacheAdapter test with `TextEncoder`/`TextDecoder`.
- **Duplicate `open()` in encryption test** — Consolidated redundant second `WarpGraph.open()` call in `WarpGraph.encryption.test.js` into a second assertion on the same promise.

### Changed

- **BREAKING: Uint8Array migration** — All domain-layer and port contract types narrowed from `Buffer|Uint8Array` to `Uint8Array`. Return types of `readBlob()`, `hmac()`, `serialize()`, `getContent()`, `getEdgeContent()`, and all bitmap index methods now return `Uint8Array` instead of `Buffer`. Downstream TypeScript consumers using Buffer-specific APIs (`.toString('hex')`, `.equals()`) on return values must migrate to `hexEncode()`/`textDecode()` from `domain/utils/bytes.js` and standard comparison operators. Buffer is now confined to infrastructure adapters only.
- **`TrustCrypto` re-export shim deleted** — `src/domain/trust/TrustCrypto.js` (which re-exported from infrastructure) has been removed. Import directly from `src/infrastructure/adapters/TrustCryptoAdapter.js`. The domain layer no longer contains any infrastructure imports.
- **`buildSeekCacheKey` is now async** — Replaced direct `node:crypto` import with domain-local `defaultCrypto.hash()`, eliminating a hexagonal boundary violation. Both call sites were already async.
- **`process.stdout.columns` removed from visualization layer** — Terminal width is now injected from the CLI presenter (composition root). The visualization layer no longer references Node-only globals.
- **HTTP adapter DRY cleanup** — Shared `toPortRequest()`, error body constants, and pre-encoded byte arrays extracted into `httpAdapterUtils.js`. BunHttpAdapter and DenoHttpAdapter now import from the shared module.
- **Lazy CAS init extracted** — The duplicated lazy-promise-with-error-reset pattern in `CasBlobAdapter._getCas()` and `CasSeekCacheAdapter._getCas()` replaced with shared `createLazyCas()` factory in `lazyCasInit.js`.
- **`computeRecordId()` and `verifyRecordId()` are now async** — These functions in `TrustCanonical.js` now use the injected `CryptoPort` instead of importing `node:crypto` directly. Callers must `await` the result.
- **`hmac()` returns `Uint8Array`** — `NodeCryptoAdapter.hmac()`, `WebCryptoAdapter.hmac()`, and `defaultCrypto.hmac()` now return `Uint8Array` instead of `Buffer`. The raw HMAC digest bytes are identical; only the wrapper type changed.
- **`@git-stunts/git-cas` v3.0.0 → v5.3.0** — Two major version jump. New capabilities now available: `ObservabilityPort` (replaces EventEmitter), streaming restore, CDC chunking (98.4% chunk reuse), envelope encryption (DEK/KEK), key rotation, memory restore guards, encrypt-then-chunk dedup warnings, orphaned blob tracking, and constructor validation. No breaking changes for git-warp's usage — `CasSeekCacheAdapter` and `CasBlobAdapter` continue to work as-is.
- **CDC chunking for seek cache** — `CasSeekCacheAdapter` now uses content-defined chunking (`CdcChunker`) instead of fixed-size chunking. Consecutive seek snapshots share most content; CDC's rolling-hash boundaries yield ~98.4% chunk reuse on incremental edits, significantly reducing Git object storage for the seek cache.
- **Encrypted seek cache** — `CasSeekCacheAdapter` accepts an optional `encryptionKey` constructor param. When set, cached state snapshots are encrypted at rest using AES-256-GCM via git-cas.
- **CAS observability bridge** — New `LoggerObservabilityBridge` adapter translates git-cas `ObservabilityPort` calls (metric, log, span) into git-warp `LoggerPort` calls. `CasSeekCacheAdapter` accepts an optional `logger` param to surface CAS operations through git-warp's structured logging.
- **Blob attachments via CAS (B160)** — New `BlobStoragePort` and `CasBlobAdapter` provide a hexagonal abstraction for content blob storage. When `blobStorage` is injected, `attachContent()`/`attachEdgeContent()` store blobs via git-cas (CDC-chunked, optionally encrypted) instead of raw Git blobs. `getContent()`/`getEdgeContent()` retrieve via CAS with automatic fallback to raw Git blobs for backward compatibility with pre-CAS content.
- **Streaming seek cache restore (B163)** — `CasSeekCacheAdapter.get()` now prefers `cas.restoreStream()` (git-cas v4+) for I/O pipelining — chunk reads overlap with buffer accumulation. Falls back to `cas.restore()` for older git-cas versions.
- **Graph encryption at rest (B164)** — New `patchBlobStorage` option on `WarpGraph.open()`. When a `BlobStoragePort` (e.g. `CasBlobAdapter` with encryption key) is injected, patch CBOR is encrypted before writing to Git and decrypted on read. An `eg-encrypted: true` commit trailer marks encrypted patches. All 6 patch read sites and the write path are threaded. `EncryptionError` is thrown when attempting to read encrypted patches without a key. Mixed encrypted and unencrypted patches are fully supported — plain patches read via `persistence.readBlob()`, encrypted via `patchBlobStorage.retrieve()`.

### Added

- **`--writer-id` flag for `git warp serve`** — Allows setting an explicit, stable writer identity instead of the auto-derived `serve-<host>-<port>` value. Useful for reproducible testing and multi-instance orchestration where deterministic writer identities are needed.
- **`src/domain/utils/bytes.js`** — Portable byte-manipulation utilities replacing Node.js Buffer methods: `hexEncode`, `hexDecode`, `base64Encode`, `base64Decode`, `concatBytes`, `textEncode`, `textDecode`. Works identically on Node, Bun, Deno, and browsers.
- **ESLint `no-restricted-globals` for Buffer** — `Buffer` is now banned in `src/domain/**/*.js` via ESLint. Future regressions are caught at lint time.
- **`git warp serve --expose` flag** — Binding to a non-loopback address now requires `--expose` to prevent accidental network exposure. Without the flag, the command exits with a usage error.
- **`wsAdapterUtils.js`** — Shared utilities for WebSocket adapters (`normalizeHost`, `assertNotListening`, `messageToString`), following the `httpAdapterUtils.js` pattern. All three WS adapters (Bun, Deno, Node) now use these instead of duplicating host normalization, listen guards, and message decoding.
- **Inspector: architecture pivot to WebSocket** — Rewired the Vue app from in-memory `WarpGraph` instances to a live WebSocket connection via `WarpSocket`. The browser now connects to `git warp serve` and views/edits a real Git-backed graph. Replaced the 4-viewport multi-writer demo with a single-viewport, single-connection model. All mutations go through `socket.mutate()` and state updates arrive via server-pushed diffs.
- **Bun + Deno WebSocket adapters** — `git warp serve` now auto-detects the runtime and uses native WebSocket APIs on all three platforms. `BunWsAdapter` uses `Bun.serve()` with the `websocket` handler option; `DenoWsAdapter` uses `Deno.serve()` + `Deno.upgradeWebSocket()`. The `serve` CLI command dynamically imports only the relevant adapter via `createWsAdapter()`, so the `ws` npm package is never loaded on Bun/Deno.
- **Static file serving** — `git warp serve --static <dir>` serves a built SPA (or any static directory) over HTTP on the same port as the WebSocket server. Supports SPA client-side routing fallback, correct MIME types for common web assets, and path traversal protection.
- **Browser-compatible `InMemoryGraphAdapter`** — Replaced hard `node:crypto` and `node:stream` imports with lazy-loaded fallbacks. A new `hash` constructor option lets callers inject a synchronous SHA-1 function for environments where `node:crypto` is unavailable (e.g. browsers). `node:stream` is now dynamically imported only in `logNodesStream()`.
- **Browser-safe `defaultCrypto`** — The domain-level crypto default now lazy-loads `node:crypto` via top-level `await import()` with a try/catch, so importing `WarpGraph` in a browser no longer crashes at module evaluation time. Callers must inject a CryptoPort explicitly when `node:crypto` is unavailable.
- **`sha1sync` utility** (`@git-stunts/git-warp/sha1sync`) — Minimal synchronous SHA-1 implementation (~110 LOC) for browser content addressing with `InMemoryGraphAdapter`. Not for security — only for Git object ID computation.
- **`browser.js` entry point** (`@git-stunts/git-warp/browser`) — Curated re-export of browser-safe code: `WarpGraph`, `InMemoryGraphAdapter`, `WebCryptoAdapter`, CRDT primitives, errors, and `generateWriterId`. No `node:` imports in the critical path.
- **Documentation enhancements in README.md** — Added a high-level Documentation Map, a detailed Graph Traversal Directory, an expanded Time-Travel (Seek) guide, and updated Runtime Compatibility information (Node.js, Bun, Deno).
- **Local-First Applications use-case** — Added git-warp as a backend for LoFi software.

### Removed

- **Inspector extracted to standalone repo** — The Git WARP Inspector (formerly `demo/browsa/`) has been extracted to [git-stunts/git-warp-web-inspector](https://github.com/git-stunts/git-warp-web-inspector). The `demo/` directory, `test/unit/browsa/`, and `TASKS.md` have been removed from this repository.
- **Inspector: scenario runner** — Removed `ScenarioPanel.vue` and all scenario infrastructure. Multi-writer scenarios don't apply to the single-connection WebSocket model.
- **Inspector: in-memory sync** — Removed `InProcessSyncBus.js` and `InsecureCryptoAdapter.js`. No in-memory sync or browser-side crypto needed with the server-backed architecture.
- **Inspector: multi-viewport grid** — Removed 4-viewport layout, sync buttons, and online/offline toggles. Multiple browser windows serve the multi-writer use case instead.
- **Inspector: Vite stubs** — Removed `src/stubs/` directory (empty.js, node-crypto.js, node-stream.js, node-module.js), `trailerCodecBufferShim()` plugin, and all resolve aliases. The browser no longer imports git-warp — it communicates via WebSocket only.

### Security

- **WebSocket mutation op allowlist** — `WarpServeService._handleMutate` now validates mutation ops against `ALLOWED_MUTATE_OPS` (`addNode`, `removeNode`, `addEdge`, `removeEdge`, `setProperty`, `setEdgeProperty`, `attachContent`, `attachEdgeContent`). Previously, any method on the `PatchBuilderV2` prototype could be invoked by a WebSocket client, including internal methods.
- **WebSocket mutation arg validation** — `WarpServeService._applyMutateOps` now validates argument count and types per-op before calling `patch[op](...args)`. Untrusted JSON args with wrong types or counts are rejected with `E_INVALID_ARGS`.
- **Protocol payload validation** — All `WarpServeService` message handlers (`open`, `mutate`, `inspect`, `seek`) now validate incoming payloads for required fields and correct types before processing. Invalid payloads receive `E_INVALID_PAYLOAD` error envelopes.
- **`hexDecode` input validation** — `hexDecode()` now throws `RangeError` on odd-length or non-hex input instead of silently coercing invalid characters to `0x00`.
- **WarpSocket request timeout** — `WarpSocket._request()` now enforces a configurable timeout (default 30s). Pending requests that receive no server response reject with a timeout error instead of leaking forever.
- **Vite `allowedHosts` scoped** — Inspector dev server no longer sets `allowedHosts: true`. Restricted to `localhost` and `127.0.0.1` to prevent DNS rebinding.

### Documentation

- **README `git warp serve` flags** — Added `--expose` and `--writer-id` to the CLI usage example.

## [13.1.0] - 2026-03-04

### Added

- **5 new graph algorithms in `GraphTraversal`** — `levels()` (longest-path level assignment for DAGs), `transitiveReduction()` (minimal edge set preserving reachability), `transitiveClosure()` (all implied reachability edges with `maxEdges` safety), `rootAncestors()` (find all in-degree-0 ancestors via backward BFS). All methods respect `NeighborProviderPort` abstraction, support `AbortSignal` cancellation, and produce deterministic output. Corresponding `LogicalTraversal` facade methods added. New error code: `E_MAX_EDGES_EXCEEDED`.
- **4 new test fixtures** — `F15_WIDE_DAG_FOR_LEVELS`, `F16_TRANSITIVE_REDUCTION`, `F17_MULTI_ROOT_DAG`, `F18_TRANSITIVE_CLOSURE_CHAIN` in the canonical fixture DSL.
- **BFS reverse reachability verification tests** — confirms `bfs(node, { direction: 'in' })` correctly discovers all backward-reachable ancestors.
- **`roaring-wasm` WASM fallback for Bun/Deno bitmap indexes** — `initRoaring()` now has a three-tier fallback chain: (1) ESM `import('roaring')`, (2) CJS `createRequire('roaring')`, (3) `import('roaring-wasm')` with WASM initialization. The WASM tier activates automatically when native V8 bindings are unavailable (Bun's JSC, Deno). Bitmap index tests (`materializedView`, `materialize.checkpointIndex.notStale`) are no longer excluded from the Bun test suite. Serialization formats are wire-compatible — portable bitmaps produced by native and WASM are byte-identical.

### Fixed

- **Roaring native module loading under Bun** — `initRoaring()` now catches dynamic `import('roaring')` failures and falls back to `createRequire()` for direct `.node` binary loading.
- **Stale `nativeAvailability` cache on `initRoaring()` reinit** — `getNativeRoaringAvailable()` now returns the correct value after swapping roaring implementations via `initRoaring(mod)`. Previously, the cached availability from the old module was returned.
- **Lost root causes on roaring load failure** — when all three tiers (native ESM, CJS require, WASM) fail, `initRoaring()` now throws `AggregateError` with per-tier errors instead of a plain `Error`, preserving diagnostic detail.

### Changed

- **ROADMAP priority triage** — 45 standalone items sorted into 6 priority tiers (P0–P6) with wave-based execution order and dependency chain mapping. Replaced flat Near-Term table with priority-grouped sub-tables. All milestones (M10–M14) marked complete. Inventory corrected to 133 total tracked items.
- **Vitest 2.1.9 → 4.0.18** — major test framework upgrade. Migrated deprecated `test(name, fn, { timeout })` signatures to `test(name, { timeout }, fn)` across 7 test files (40 call sites). Fixed `vi.fn().mockImplementation()` constructor mocks to use `function` expressions per Vitest 4 requirements. Resolves 5 remaining moderate-severity npm audit advisories (`esbuild` [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99), `vite`, `@vitest/mocker`, `vite-node`, `vitest`). **`npm audit` now reports 0 vulnerabilities.**

## [13.0.1] — 2026-03-03

### Fixed

- **Dev dependency security updates** — resolved 4 high-severity advisories in transitive dev dependencies: `tar` 7.5.2 → 7.5.9 ([GHSA-r6q2-hw4h-h46w](https://github.com/advisories/GHSA-r6q2-hw4h-h46w), [GHSA-34x7-hfp2-rc4v](https://github.com/advisories/GHSA-34x7-hfp2-rc4v), [GHSA-8qq5-rm4j-mr97](https://github.com/advisories/GHSA-8qq5-rm4j-mr97), [GHSA-83g3-92jg-28cx](https://github.com/advisories/GHSA-83g3-92jg-28cx)), `rollup` 4.55.1 → 4.59.0 ([GHSA-mw96-cpmx-2vgc](https://github.com/advisories/GHSA-mw96-cpmx-2vgc)), `minimatch` 3.1.2/9.0.5/10.1.1 → 3.1.5/9.0.9/10.2.4 ([GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26), [GHSA-7r86-cg39-jmmj](https://github.com/advisories/GHSA-7r86-cg39-jmmj), [GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74)), `@isaacs/brace-expansion` 5.0.0 replaced by `brace-expansion` 5.0.4 ([GHSA-7h2j-956f-4vf2](https://github.com/advisories/GHSA-7h2j-956f-4vf2)). No runtime dependencies affected.

## [13.0.0] — 2026-03-03

### Added

- **Observer API stabilized (B3)** — `subscribe()` and `watch()` promoted to `@stability stable` with `@since 13.0.0` annotations. Fixed `onError` callback type from `(error: Error)` to `(error: unknown)` to match runtime catch semantics. `watch()` pattern param now correctly typed as `string | string[]` in `_wiredMethods.d.ts`.
- **`graph.patchMany()` batch patch API (B11)** — applies multiple patch callbacks sequentially. Each callback sees state from prior commits. Returns array of commit SHAs. Inherits reentrancy guard from `graph.patch()`.
- **Causality bisect (B2)** — `BisectService` performs binary search over a writer's patch chain to find the first bad patch. CLI: `git warp bisect --good <sha> --bad <sha> --test <cmd> --writer <id>`. O(log N) materializations. Exit codes: 0=found, 1=usage, 2=range error, 3=internal.

### Changed

- **BREAKING: `getNodeProps()` returns `Record<string, unknown>` instead of `Map<string, unknown>` (B100)** — aligns with `getEdgeProps()` which already returns a plain object. Callers must replace `.get('key')` with `.key` or `['key']`, `.has('key')` with `'key' in props`, and `.size` with `Object.keys(props).length`. `ObserverView.getNodeProps()` follows the same change.
- **GraphPersistencePort narrowing (B145)** — domain services now declare focused port intersections (`CommitPort & BlobPort`, etc.) in JSDoc instead of the 23-method composite `GraphPersistencePort`. Removed `ConfigPort` from the composite (23 → 21 methods); adapters still implement `configGet`/`configSet` on their prototypes. Zero behavioral change.
- **Codec trailer validation extraction (B134, B138)** — created `TrailerValidation.js` with `requireTrailer()`, `parsePositiveIntTrailer()`, `validateKindDiscriminator()`. All 4 message codec decoders now use shared helpers exclusively. Patch and Checkpoint decoders now also perform semantic field validation (graph name, writer ID, OID, SHA-256) matching the Audit decoder pattern. Internal refactor for valid inputs, with stricter rejection of malformed messages.
- **HTTP adapter shared utilities (B135)** — created `httpAdapterUtils.js` with `MAX_BODY_BYTES`, `readStreamBody()`, `noopLogger`. Eliminates duplication across Node/Bun/Deno HTTP adapters. Internal refactor, no behavioral change.
- **Bitmap checksum extraction (B136)** — moved duplicated `computeChecksum()` from both bitmap builders to `checksumUtils.js`. Internal refactor, no behavioral change.
- **BitmapNeighborProvider lazy validation (B141)** — constructor no longer throws when neither `indexReader` nor `logicalIndex` is provided. Validation moved to `getNeighbors()`/`hasNode()` method entry.

### Removed

- **BREAKING: `PerformanceClockAdapter` and `GlobalClockAdapter` exports (B140)** — both were deprecated re-exports of `ClockAdapter`. Deleted shim files, removed from `index.js`, `index.d.ts`, and `type-surface.m8.json`. Use `ClockAdapter` directly.

### Fixed

- **Test hardening (B130)** — replaced private field access (`_idToShaCache`, `_snapshotState`, `_cachedState`) with behavioral assertions in `BitmapIndexReader.test.js`, `PatchBuilderV2.snapshot.test.js`, and `WarpGraph.timing.test.js`.
- **Fake timer lifecycle (B131)** — moved `vi.useFakeTimers()` from `beforeAll` to `beforeEach` and `vi.useRealTimers()` into `afterEach` in `WarpGraph.watch.test.js`.
- **Test determinism (B132)** — seeded `Math.random()` in benchmarks with Mulberry32 RNG (`0xDEADBEEF`), added `seed: 42` to all fast-check property tests, replaced random delays in stress test with deterministic values.
- **Global mutation documentation (B133)** — documented intentional `globalThis.Buffer` mutation in `noBufferGlobal.test.js` and `crypto.randomUUID()` usage in `SyncAuthService.test.js`.
- **Code review fixes (B148):**
  - **CLI hardening** — added `--writer` validation to bisect, SHA format regex on `--good`/`--bad`, rethrow ENOENT/EACCES from test command runner instead of swallowing.
  - **BisectService cleanup** — removed dead code, added invariant comment, replaced `BisectResult` interface with discriminated union type, fixed exit code constant.
  - **Prototype-pollution hardening** — `Object.create(null)` for property bags in `getNodeProps`, `getEdgeProps`, `getEdges`, `buildPropsSnapshot`; fixed indexed-path null masking in `getNodeProps`.
  - **Docs housekeeping** — reconciled ROADMAP inventory counts (24→29 done), fixed M11 sequencing, removed done items from priority tiers, fixed stale test vector counts (6→9), corrected Deno test name, moved B100 to `### Changed`.

## [12.4.1] — 2026-02-28

### Fixed

- **tsconfig.src.json / tsconfig.test.json missing d.ts includes** — added `globals.d.ts` and `_wiredMethods.d.ts` to both split configs; eliminated 113 + 634 false TS2339 errors for WarpGraph wired methods.
- **TestPatch typedef divergence** — `TemporalQuery.checkpoint.test.js` used hand-rolled `TestPatch` that drifted from `PatchV2` (`schema: number` vs `2|3`, `context: Map` vs plain object); replaced with `PatchV2` import.
- **JSR dry-run deno_ast panic** — deduplicated `@git-stunts/alfred` import specifiers in `GitGraphAdapter.js` to work around deno_ast 0.52.0 overlapping text-change bug.
- **`check-dts-surface.js` default-export regex** — `extractJsExports` and `extractDtsExports` captured `class`/`function` keywords instead of identifier names for `export default class Foo` / `export default function Foo` patterns.

### Changed

- **`@param {Object}` → inline typed shapes (190 sites, 72 files)** — every `@param {Object} foo` + `@param {type} foo.bar` sub-property group collapsed to `@param {{ bar: type }} foo`.
- **`@property {Object}` → typed shapes (6 sites)** — `StateDiffResult`, `HealthResult`, `TrustAssessment`, `PatchEntry`.
- **`{Function}` → typed signatures (4 sites)** — `NodeHttpAdapter`, `BunHttpAdapter`, `DenoHttpAdapter` handler/logger params.
- **`{Object}` → `Record<string, unknown>` (1 site)** — `defaultCodec.js` constructor guard cast.
- **`{Buffer}` → `{Uint8Array}` across ports/adapters** — multi-runtime alignment (Node/Bun/Deno).
- **`globals.d.ts` augmented** — added `declare var Bun` / `declare var Deno` for `globalThis.*` access.
- **`parseCommandArgs` generic return** — `@template T` + `ZodType<T>` so callers get schema-inferred types.
- **JoinReducer typed shapes** — added `OpLike`/`PatchLike` typedefs; replaced 10 `{Object}` params.
- **GitGraphAdapter typed shapes** — added `GitPlumbingLike`/`CollectableStream` typedefs; extracted `RetryOptions` typedef to deduplicate import specifiers.
- **`onError` callback type widened** — `subscribe.methods.js` `onError` param changed from `Error` to `unknown` to match runtime catch semantics.
- **`WriterId.resolveWriterId` param type** — `explicitWriterId` widened from `string|undefined` to `string|null|undefined` to match defensive null check.
- **`ConsoleLogger` level param type** — widened from `number` to `number|string` to match string-based `LEVEL_NAMES` lookup.
- **`StateSerializerV5` typedef extraction** — `StateHashOptions` typedef replaces duplicated inline type on `computeStateHashV5`.
- **`StreamingBitmapIndexBuilder.onFlush` type** — replaced `Function|undefined` with precise callback signature.
- **`HealthCheckService._computeHealth` return type** — narrowed `status: string` to `'healthy'|'degraded'|'unhealthy'`.
- **`DagTraversal`/`DagTopology` constructors** — removed redundant inline type casts (JSDoc `@param` suffices).
- **`parseCursorBlob` examples** — replaced `Buffer.from()` with `TextEncoder.encode()` to match `Uint8Array` param type.

## [12.4.0] — 2026-02-28

### Added

- **Reserved graph name validation (B78)** — `validateGraphName()` rejects ref-layout keywords (`writers`, `checkpoints`, `coverage`, etc.) as graph name segments.
- **`listRefs()` limit parameter (B77)** — optional `{ limit }` options bag; `GitGraphAdapter` passes `--count=N`, `InMemoryGraphAdapter` slices.
- **`WARP_QUICK_PUSH` env var (B82)** — pre-push hook skips unit tests when set to `1` or `true`.
- **`--quiet` flag for surface validator (B84)** — suppresses stdout; stderr (errors/warnings) always flows.
- **`PersistenceError` with typed error codes (B120)** — `E_MISSING_OBJECT`, `E_REF_NOT_FOUND`, `E_REF_IO` replace brittle `message.includes()` checks.
- **`createCircular(n)` / `createDiamond()` test topology helpers (B121)** — reusable graph fixtures for traversal tests.
- **Checkpoint validation edge-case tests (B122)** — 21 tests covering schema mismatch, empty state, missing frontier.
- **Surface validator unit tests (B92)** — 34 tests for `parseExportBlock`, `extractJsExports`, `extractDtsExports`.
- **Type surface manifest completeness** — 85 type/interface/class exports added; 0 errors, 0 warnings.

### Changed

- **STANK audit relocated** — moved `STANK.md` to `docs/audits/2026-02-complexity-audit.md` and reconciled all 46 items with v12.2.1 disposition statuses (45 fixed, 1 deferred to M13).
- **`MIGRATION_PROBLEM.md` relocated (N3)** — moved to `docs/design/MIGRATION_PROBLEM.md`.
- **ROADMAP format (N2)** — normalized B46/B47/B26/B71/B126 done markers to `~~**X**~~ — **DONE.**` style.
- **`no-empty` rule annotated (N1)** — added comment documenting B126 intent (rule already active via `eslint:recommended`).
- **ROADMAP inventory table (R2)** — moved B26/B46/B47/B71/B126 from Standalone to Standalone (done); counts reconciled.
- **MIGRATION_PROBLEM.md fenced code block** — added `text` language tag (MD040).

### Refactored

- **`parseExportBlock()` extracted as shared helper (B93)** — accepts block body; reused by JS and `.d.ts` extractors.
- **`GitAdapterError` → `PersistenceError` (B120)** — domain error class is now adapter-agnostic.

### Fixed

- **`listRefs` error wrapping (review)** — `GitGraphAdapter.listRefs()` now wraps Git errors via `wrapGitError`, consistent with all other adapter methods.
- **Error classifier exit-code guards (review)** — `isRefNotFoundError` and `isRefIoError` now gate on exit codes 128/1, preventing broad pattern matches from misclassifying non-ref errors.
- **`NodeHttpAdapter.dispatch` handler type (review)** — upgraded from bare `Function` to typed `HttpRequest → HttpResponse` signature.
- **`PersistenceError` constructor redundancy (review)** — removed duplicate `code` param from `super()` options.
- **JSDoc wildcards `{[x: string]: *}` → `unknown` in TickReceipt (B52)** — replaced non-standard JSDoc wildcard with `unknown`.
- **SyncAuthService `keys` param documented as required (B52)** — constructor JSDoc corrected.
- **Misleading `= {}` constructor defaults removed (B51)** — `DagTraversal`, `DagPathFinding`, `DagTopology`, `BitmapIndexReader` no longer suggest optional dependencies.
- **Surface validator regexes now match `export declare interface/type` (B91)** — `.d.ts` exports no longer missed.
- **`extractJsExports` now matches `export class` (B94)** — class exports included in surface extraction.
- **HttpServerPort request/response types upgraded (B55)** — `Object` → proper typedefs.
- **`skippedWriters` added to `syncWith` manifest return type (B50)** — type surface now reflects actual return shape.
- **`new Date()` and `Date()` banned in domain code (M2)** — added `NewExpression[callee.name='Date']` and `CallExpression[callee.name='Date']` ESLint selectors; three legitimate call sites annotated with `eslint-disable`.
- **Writer logger fallback (L1)** — `Writer._logger` defaults to `nullLogger` instead of `undefined`, preventing downstream NPE when no logger is injected.
- **PatchBuilderV2 logger type (L2)** — `@param`/`@type` narrowed from `{ warn: Function }` to `LoggerPort`.
- **Delete-guard test used `console.warn` spy (M1)** — replaced stale `console.warn` spy with injected mock logger; `child()` now returns self.
- **Fork name random suffix (L4)** — `.padEnd(8, '0')` guarantees 8-char suffix from `Math.random().toString(36)`.
- **ORSet error message em dash (L5)** — replaced `—` with `--` for ASCII-safe error messages.

## [12.3.0] — 2026-02-28

### Added

- **M13 internal canonicalization (ADR 1)** — edge property operations are now semantically honest internally. The reducer, receipts, provenance, and builder all operate on canonical `NodePropSet`/`EdgePropSet` ops. Legacy raw `PropSet` is normalized at reducer entry points and lowered back at write time.
- **OpNormalizer** — new `normalizeRawOp()` / `lowerCanonicalOp()` boundary conversion module (`src/domain/services/OpNormalizer.js`).
- **Raw/canonical op set split** — `RAW_KNOWN_OPS` (6 wire types), `CANONICAL_KNOWN_OPS` (8 types), `isKnownRawOp()`, `isKnownCanonicalOp()` exported from JoinReducer. `isKnownOp()` deprecated as alias for `isKnownRawOp()`.
- **Reserved-byte validation** — `PatchBuilderV2._assertNoReservedBytes()` rejects `\0` in identifiers and `\x01` prefix in node IDs on new writes.
- **Version namespace separation** — `PATCH_SCHEMA_V2`/`PATCH_SCHEMA_V3` constants in MessageSchemaDetector (re-exported from WarpMessageCodec). `CHECKPOINT_SCHEMA_STANDARD`/`CHECKPOINT_SCHEMA_INDEX_TREE` constants in CheckpointService.
- **TickReceipt canonical types** — `OP_TYPES` expanded with `NodePropSet` and `EdgePropSet`; receipts use canonical type names.
- **ADR governance** — ADR 1 (internal canonicalization), ADR 2 (wire-format deferral), ADR 3 (readiness gates for future cutover) in `adr/`.
- **ADR 2 tripwire tests** — `SyncProtocol.wireGate.test.js` (5 tests) and `JoinReducer.opSets.test.js` (17 tests) prove canonical ops are rejected on the wire.
- **GitHub issue template** — `adr-2-readiness-review.yml` for ADR 3 gate reviews.
- **Go/no-go checklist** — `docs/checklists/adr-2-go-no-go-checklist.md` for ADR 3 enforcement.
- **PR template** — `.github/pull_request_template.md` with ADR safety checks.

### Fixed

- **Sync wire gate accepted canonical-only ops** — `SyncProtocol.applySyncResponse()` now uses `isKnownRawOp()` instead of `isKnownOp()`, rejecting `NodePropSet`/`EdgePropSet` on the wire before ADR 2 capability cutover.

### Changed

- **ROADMAP updated** — M13 internal canonicalization marked DONE; wire-format half deferred by ADR 3. M11 COMPASS II marked NEXT (unblocked).

## [12.2.1] — 2026-02-28

### Fixed

- **`readRef` double I/O (J3)** — single `rev-parse --verify --quiet` replacing redundant `refExists` + `rev-parse` two-call pattern.
- **`readTree` sequential blob reads (J4)** — pooled concurrent reads with batch size 16 via `Promise.all`.
- **`findAttachedData` O(E+P) scan (J6)** — string prefix/infix checks instead of split+compare on every edge key.
- **Schema version recomputed per write (J7)** — `_hasEdgeProps` boolean cache set once in `setEdgeProperty()`.
- **Checkpoint load swallows corruption (J14)** — now catches only "not found" conditions; decode/corruption errors propagate.
- **Receipt-path removal O(N\*M) (B67/T1)** — `nodeRemoveOutcome`/`edgeRemoveOutcome` now use `buildDotToElement` reverse index.
- **`orsetClone` via empty join (B73/T2)** — dedicated `orsetClone()` function replacing `orsetJoin(x, empty)` pattern.
- **`orsetJoin` inconsistent cloning (T11)** — b-branch now clones dots via `new Set()` matching a-branch pattern.
- **`orsetSerialize` O(N log N) decodes (T37)** — pre-decodes all dots before sorting, reducing decode calls from O(N log N) to O(N).
- **`canonicalStringify` stack overflow on cycles (T18)** — added `WeakSet`-based cycle detection; throws `TypeError` on circular references. Stack-based tracking allows valid shared (non-circular) references.
- **`matchGlob` unbounded regex cache (T19)** — cache now clears when exceeding 1000 entries.
- **`commitNode`/`commitNodeWithTree` duplication (T6)** — extracted shared logic into `_createCommit` helper.
- **`PatchSession` generic Error on post-commit ops (T33)** — now throws `WriterError` with code `SESSION_COMMITTED`.
- **`schemas.js` Infinity/NaN validation (T28)** — added `Number.isFinite` refinement to all `z.coerce.number()` chains.
- **`SyncProtocol` scattered Map↔Object conversions (T23)** — extracted `frontierToObject`/`objectToFrontier` helpers.
- **`IncrementalIndexUpdater` O(L) max-ID loop (T35)** — cached `_nextLabelId` for O(1) per new label.

### Documentation

- **`_hasSchema1Patches` tip-only semantics (J16)** — JSDoc clarifying heuristic checks writer tips only, not full history.
- **`vvDeserialize` zero-counter elision (B75/T9)** — JSDoc + debug assertion in `vvSerialize`.
- **Writer `_commitInProgress` guard (B74/T32)** — JSDoc documenting reentrancy safety and finally-block reset.
- **TSK TSK documentation batch** — 20+ JSDoc/comment additions across CheckpointService (T4, T25, T26), GitGraphAdapter (T5, T7), CborCodec (T8), LWW (T10), EventId (T12), Dot (T22), VersionVector (T38), LRUCache (T20), RefLayout (T31), QueryBuilder (T13), MaterializedViewService (T14, T34), WriterError (T16), StorageError (T17, T29), SyncProtocol (T24), infrastructure (T27), JoinReducer (T3), IncrementalIndexUpdater (T36).

### Refactored

- **`MaterializedViewService` DRY (T15)** — extracted `PROPS_PREFIX` constant.
- **`IncrementalIndexUpdater` stale `_nextLabelId` (CR-1)** — reset cached label ID on each `computeDirtyShards` call so freshly-loaded labels don't collide with prior state.
- **`matchGlob` cache eviction boundary (CR-2)** — insert before evict + `>=` threshold so just-compiled regex survives the clear.
- **`MaterializedViewService` import ordering (CR-3)** — moved `PROPS_PREFIX` constant below all imports.
- **`canonicalStringify` shared-reference false positive (CR-R1)** — cycle detection now uses stack-based tracking (try/finally delete) instead of ever-growing seen set, so valid DAG structures with shared references are not rejected.
- **`nodeRemoveOutcome`/`edgeRemoveOutcome` iterate normalized Set (CR-R2)** — effectiveness loop now iterates `targetDots` (the normalized Set) instead of raw `op.observedDots` for consistency with the reverse-index lookup.

- **`join()` overwrites merged state (S1)** — `join()` now installs the merged state as canonical (`_stateDirty = false`) with synchronous adjacency build, instead of setting `_stateDirty = true` which caused `_ensureFreshState()` to throw `E_STALE_STATE` or trigger a full `materialize()` that discarded the merge result. Version vector is cloned from the merged frontier. (B108)
- **`_cachedViewHash` leak in dirty paths** — `_onPatchCommitted` fallback path and `_maybeRunGC` frontier-changed path now clear `_cachedViewHash` when setting `_stateDirty = true`, maintaining the coherence invariant. (B108)
- **Sync stale-read after apply (C1)** — `applySyncResponse` now routes through `_setMaterializedState()` instead of raw `_cachedState` assignment, rebuilding adjacency, indexes, and view. Previously queries after sync could return stale index/provider data. (B105)
- **Sync bookkeeping race on install failure** — `applySyncResponse` now defers `_lastFrontier`/`_patchesSinceGC` mutations until after `_setMaterializedState` succeeds, preventing inconsistent bookkeeping if state install throws. (CR-50)
- **Unknown sync ops silently dropped (C2)** — `applySyncResponse` in `SyncProtocol` now validates every op against `isKnownOp()` before `join()`. Unknown ops throw `SchemaUnsupportedError` (fail closed) instead of being silently ignored. (B106)
- **Sync divergence exception-as-control-flow (S3)** — `processSyncRequest` now performs an `isAncestor()` pre-check (when available on persistence) to detect diverged writers without the expensive chain walk. Falls back to `loadPatchRange` throw for adapters without `isAncestor`. (B107)
- **Diff-aware eager post-commit path (B114)** — `_onPatchCommitted` now uses `applyWithDiff()` on the non-audit eager path and passes the resulting patch diff through `_setMaterializedState(..., { diff })`, enabling incremental index updates instead of forcing full rebuild work on every clean-cache commit.
- **Checkpoint ancestry validation complexity (B115)** — `_loadPatchesSince()` now validates `_validatePatchAgainstCheckpoint()` once per writer tip (not once per patch), reducing repeated ancestry walks on long patch chains.
- **`_setMaterializedState` diff arg compatibility** — state install now accepts both legacy positional diff calls (`_setMaterializedState(state, diff)`) and the new options form (`_setMaterializedState(state, { diff })`) to prevent silent fallback to full index rebuilds at older call sites.
- **Incremental index re-add restore scan (S5)** — `IncrementalIndexUpdater` now separates genuinely-new nodes from re-added nodes and restores implicit edges via an endpoint adjacency cache keyed by `state.edgeAlive`, avoiding full alive-edge rescans on re-add paths. (B66)
- **`_purgeNodeEdges` bitmap churn (S6)** — dead-node row purge now deserializes once, mutates in place (`bitmap.clear()`), and serializes once for both forward and reverse owner-row loops. (B113)
- **Incremental adjacency cache coherency on reused updater instances** — once initialized, `IncrementalIndexUpdater` now reconciles `_edgeAdjacencyCache` on every diff (including non-readd diffs), preventing stale edge restoration candidates after edge membership changes. (PR-52 follow-up)

### Changed

- **`syncWith()` returns `skippedWriters`** — callers can now observe which writers were skipped during sync (e.g. due to divergence) via `result.skippedWriters`. (B105)
- **Removed `_invalidateDerivedCaches()`** — replaced by canonical `_setMaterializedState()` path; derived caches are now rebuilt rather than nulled. (B105)

### Types

- **`index.d.ts` — `skippedWriters` on sync types** — added `skippedWriters` to `SyncResponse`, `ApplySyncResult`, and `syncWith()` return type to match runtime behavior. (H1)
- **`SyncController.syncWith` JSDoc** — widened `@returns` to include full `skippedWriters` shape with `localSha`/`remoteSha`; made non-optional. (M2/M3)
- **Replaced bare `Function` type** — `SyncProtocol` `isAncestor` check now uses `(...args: unknown[]) => unknown` instead of `Function`. (L3)

### Tests

- **`_onPatchCommitted` dirty-path assertion** — coverage gap test now also asserts `_stateDirty === true`. (L1)
- **`_setMaterializedState` rejection-path test** — verifies `applySyncResponse` does not advance `_lastFrontier`/`_patchesSinceGC` when state install fails. (CR-50)
- **Eager diff passthrough regressions** — added unit coverage verifying `_onPatchCommitted` forwards a real diff in non-audit mode and `{ diff: null }` in audit mode.
- **State install diff-call compatibility regressions** — added tests proving `_setMaterializedState` preserves incremental behavior for both positional and object diff arguments.
- **Tip-only checkpoint validation regression** — added `_loadPatchesSince` test asserting one ancestry validation per non-empty writer chain using the writer tip SHA.
- **IncrementalIndexUpdater performance regressions** — added coverage for new-node add path (no re-add edge restoration side effects) and node-removal purge behavior across forward/reverse edge rows. (B66/B113)
- **IncrementalIndexUpdater cache-coherency regression** — added a reused-instance multi-diff sequence ensuring node re-add restoration reflects current `edgeAlive` membership after intermediate edge add/remove diffs. (PR-52 follow-up)

## [12.2.0] — 2026-02-27

### Changed

- **`topologicalSort` O(N log N) MinHeap** — replaced O(N²) sorted-array merge with MinHeap-backed ready queue in Kahn's algorithm. Removed dead `_insertSorted` method. (B68)
- **`QueryBuilder` bounded concurrency + props memo** — `run()` now batches `getNodeProps()` calls in chunks of 100 via `batchMap()` and caches results in a per-run `propsMemo` Map, eliminating redundant property fetches across where-clauses, result building, and aggregation. (B69)
- **Checkpoint `visible.cbor` removed** — checkpoints no longer write the redundant visible-projection blob. `loadCheckpoint()` never used it for resume (state.cbor is authoritative). Saves one blob write + serialize per checkpoint. (J5)

### Added

- **Fast-return materialization guard** — `_materializeGraph()` now returns cached result immediately when `!_stateDirty && _materializedGraph`, skipping a full `materialize()` round-trip for callers like QueryBuilder and LogicalTraversal. (S9)
- **`_indexDegraded` flag** — WarpGraph now tracks whether the bitmap index build failed. Set `true` on `_buildView()` catch, `false` on success. Purely additive — no behavioral change yet. (J11)
- **PatchBuilderV2 snapshot tests (C4)** — 4 tests verifying lazy snapshot capture, stability after mutation, null state handling, and no-capture for add operations.
- **JoinReducer validation tests (C2/C3)** — 7 tests documenting unknown-op-type silent ignore (forward-compat baseline), empty ops/patches safety, and malformed-op crash behavior on both fast and receipt paths.
- **BATS trust-sync tests** — `cli-trust-sync.bats` (4 tests) + `seed-trust-sync.js` helper exercising trust evaluation with multiple writers: enforce+untrusted exit 4, warn exit 0, JSON shape with evaluatedWriters/untrustedWriters, trusted-only pass.

### Fixed

- **Poll validation hardened** — `watch()` now rejects `NaN` and `Infinity` via `Number.isFinite()` and uses `poll !== undefined` instead of truthiness gating to prevent silent no-ops.
- **Empty array pattern rejection** — `observer()`, `watch()`, and `translationCost()` now reject empty arrays (`[]`) as match patterns instead of silently creating no-op watchers.
- **JSDoc type consistency** — `translationCost()` param types updated from `{string}` to `{string|string[]}` and `watch()` `@throws` updated to reflect array support.

## [12.1.0] — 2026-02-25

### Added

- **Multi-pattern glob support** — `graph.observer()`, `query().match()`, and `translationCost()` now accept an array of glob patterns (e.g. `['campaign:*', 'milestone:*']`). Nodes matching _any_ pattern in the array are included (OR semantics).
- **Centralized `matchGlob` utility** (`src/domain/utils/matchGlob.js`) — unified glob matching logic with regex caching and support for array-based multi-pattern matching.
- **Release preflight** — `npm run release:preflight` runs a 10-check local gate before tagging. CI (`release.yml`) now also enforces CHANGELOG and README checks on tag push.

### Fixed

- **Type declarations for multi-pattern glob** — `index.d.ts` `QueryBuilder.match()` and `ObserverConfig.match` now accept `string | string[]`, matching runtime behavior. JSDoc annotations updated in `ObserverView`, `QueryBuilder`, `TranslationCost`, and `query.methods`.

## [12.0.0] — 2026-02-25

### Changed

- **Documentation updated for v12.0.0** — CLAUDE.md, README.md, ARCHITECTURE.md, GUIDE.md, and CLI_GUIDE.md updated to reflect the MaterializedView architecture overhaul: GraphTraversal engine (11 algorithms, `nodeWeightFn`), `graph.traverse` facade, MaterializedViewService, LogicalIndexBuildService/Reader, IncrementalIndexUpdater, NeighborProviderPort abstraction, checkpoint schema 4, and new CLI commands (`verify-index`, `reindex`).
- **`LogicalIndexReader` per-owner edge lookup** — `resolveAllLabels()` previously scanned the entire edge store per node — O(total edges). Added `_edgeByOwnerFwd`/`_edgeByOwnerRev` secondary indexes built during shard decode, reducing unfiltered `getEdges()` to O(degree).
- **`LogicalBitmapIndexBuilder.serialize()` O(N×S) elimination** — meta shard serialization scanned the full `_nodeToGlobal` map for every shard. Added per-shard node list (`_shardNodes`) populated during `registerNode()`/`loadExistingMeta()`, reducing cost to O(N).
- **`ObserverView` batched provider calls** — `buildAdjacencyViaProvider()` now batches `getNeighbors()` calls in chunks of 64 via `Promise.all` instead of sequential awaits.
- **Seek cache buffer contract typing** — `SeekCachePort` and `index.d.ts` now type seek-cache payloads as `Buffer | Uint8Array`, matching runtime adapter behavior from `@git-stunts/git-cas`.
- **Docs/runtime consistency cleanup** — corrected `ARCHITECTURE.md` GraphTraversal method descriptions (BFS/DFS array-returning; BFS-based `shortestPath`) and removed branch-specific ROADMAP header metadata.
- **Backlog reconciliation** — absorbed all 39 BACKLOG.md items into ROADMAP.md with B-numbers B66–B104. Added Milestone 12 (SCALPEL) for algorithmic performance audit fixes. Expanded Standalone Lane from 20 to 52 items across 11 priority tiers. Added cross-reference table and inventory. BACKLOG.md cleared to skeleton.
- **Seek cache contract alignment** — synchronized `ARCHITECTURE.md` and `index.d.ts` `SeekCachePort` signatures with runtime behavior: key-based methods and optional `indexTreeOid` metadata on cache entries.
- **MaterializedView/docs runtime naming alignment** — updated architecture lifecycle docs to reference `build() -> persistIndexTree() -> loadFromOids()` plus incremental `applyDiff()` and `verifyIndex()`, and switched Deno compose `--allow-scripts` to package-name form (`npm:roaring,npm:cbor-extract`) with an explicit sync note to reduce version-drift failures.

### Fixed

- **Bare `Buffer` in MaterializedView domain files** — `LogicalBitmapIndexBuilder`, `LogicalIndexReader`, `PropertyIndexBuilder`, and `IncrementalIndexUpdater` used the Node.js `Buffer` global without importing it. Deno doesn't provide `Buffer` on `globalThis`, causing `_buildView()` to silently fall back to null indexes — the entire O(1) bitmap index subsystem was non-functional in Deno. Replaced all `Buffer.from()` calls with `Uint8Array`-safe `.slice()` and `Uint8Array.from()`. Updated JSDoc types from `Record<string, Buffer>` to `Record<string, Uint8Array>` across builders, readers, and downstream consumers (`MaterializedViewService`, `LogicalIndexBuildService`).
- **`hydrateCheckpointIndex` stale-overwrite bug** — `materialize()` called `hydrateCheckpointIndex()` after `_setMaterializedState()`, overwriting the freshly built bitmap index with the checkpoint's stale one. Removed the function entirely; `_buildView` already builds the correct index.
- **Deterministic node/label ID assignment** — OR-Set iteration order is non-deterministic, causing node globalIds and label IDs to vary across builds of the same state. `LogicalIndexBuildService.build()` now sorts alive nodes and unique edge labels before registration.
- **Deterministic property index output** — `PropertyIndexBuilder.serialize()` now sorts entries by nodeId before CBOR encoding, ensuring identical output regardless of patch arrival order.
- **No-`Buffer` runtime regression coverage** — added a regression test that sets `globalThis.Buffer = undefined` and verifies full index build, index read, and incremental shard updates still succeed.
- **Checkpoint index staleness regression coverage** — added an integration test that creates a schema:4 checkpoint, applies post-checkpoint patches, reopens the graph, and verifies `materialize()` neighbors/index reflect latest state (not stale checkpoint shards).
- **Decoded-byte boundary hardening** — `LogicalIndexReader` now normalizes decoded bitmap/meta byte payloads via `Uint8Array.from(...)` before Roaring deserialization, so Buffer/Uint8Array/number[] decode variants all work reliably.
- **Deno runtime native-addon bootstrap** — `docker/Dockerfile.deno` now bootstraps with a minimal Deno entrypoint that imports only `npm:roaring` and `npm:cbor-extract`, then runs `deno install --node-modules-dir=auto --allow-scripts=...` so lifecycle scripts execute without pulling unrelated npm dev dependencies (which previously caused CI 403 flake failures).
- **Deno native fallback compile reliability** — retained `node-gyp` in `docker/Dockerfile.deno` because Deno/npm lifecycle fallback builds for `roaring`/`cbor-extract` invoke `node-gyp` from `PATH` when prebuilt binaries are unavailable.
- **CLI verify-index error handling** — `verify-index` now safely stringifies non-`Error` throws from `materialize()` instead of assuming `err.message`.
- **Node test image install determinism** — switched `docker/Dockerfile.node20` and `docker/Dockerfile.node22` from `npm install` to `npm ci`, and pinned direct `zod` dependency to `3.24.1` to avoid transient/blocked registry resolution during Dockerized CI builds.
- **Checkpoint resilience when index build fails** — `createCheckpoint()` now logs a warning and still writes a valid checkpoint without embedded index shards if bitmap index construction fails (for example when Roaring native loading is unavailable), preserving correctness over acceleration.
- **Traversal and verification regressions** — fixed `topologicalSort()` false cycle detection when output is truncated by `maxNodes`; `commonAncestors()` now reports aggregate stats across all internal BFS runs instead of only the last run; `verifyIndex()` now flags alive-bit mismatches even for isolated nodes with empty edge signatures.
- **Fixture DSL Lamport fidelity** — `fixtureToState()` now honors explicit `props[].lamport` ticks, preventing fixture-order artifacts in property precedence tests.
- **Determinism/regression test hardening** — added tests ensuring `LogicalBitmapIndexBuilder` does not duplicate shard mappings when re-registering nodes after `loadExistingMeta`, `LogicalIndexReader` unfiltered edges equal filtered-label unions with deterministic `(neighborId, label)` ordering, and `PropertyIndexBuilder` serializes equivalent property sets identically across operation orders.
- **Temporal/query and fixture safety guards** — `TemporalQuery` now clones checkpoint state before replay (preventing cross-query mutation when providers reuse checkpoint objects), `PropertyIndexReader` now throws on malformed non-array shard payloads instead of silently returning empty data, and `makeFixture()` now validates `props` and tombstone references against declared nodes/edges.
- **`TemporalQuery` checkpoint boundary skipped when all patches covered** — `evaluateAlwaysCheckpointBoundary` and `evaluateEventuallyCheckpointBoundary` used `startIdx > 0` to detect checkpoint presence, which failed when the checkpoint covered all patches (`findIndex → -1`, `startIdx = 0`). Changed guard to `checkpointMaxLamport !== since`. Removed the now-unused `startIdx` parameter from both functions.
- **`GraphTraversal` shared mutable stats counters** — `_cacheHits`, `_cacheMisses`, and `_edgesTraversed` were instance fields reset per-run via `_resetStats()`, making concurrent traversals on the same instance share corrupted counters. Replaced with per-run `RunStats` objects threaded through `_getNeighbors()` and all 10 traversal entry points.
- **`computeShardKey` crash on null/undefined input** — `computeShardKey()` now returns `'00'` for null, undefined, or non-string inputs instead of throwing. FNV-1a hashing now operates on UTF-8 bytes (via `TextEncoder`) instead of UTF-16 code units for correct cross-runtime shard placement of non-ASCII node IDs.
- **`MinHeap` constructor crash on null** — `new MinHeap(null)` threw because destructuring defaults (`= {}`) only apply to `undefined`, not `null`. Constructor now uses explicit `options || {}` guard.
- **Cross-provider error comparison for non-Error throws** — `runCrossProvider()` in the fixture DSL now normalizes thrown values via `normalizeError()` before comparing `.name`/`.message`, so non-Error throws (strings, numbers) are correctly detected as mismatches instead of silently comparing `undefined === undefined`.
- **`commonAncestors` error message** — error message now reads `"Node not found: <id>"` (was `"Start node not found"`) with `{ node }` context, since `commonAncestors` accepts multiple nodes, not a single start.
- **`bidirectionalAStar` direction bypass** — no longer routes through `_prepare`/`assertDirection`, which silently accepted a meaningless `dir` parameter. Now validates `from` inline after `_prepareEngine`.
- **Traverse facade: phantom `maxDepth` JSDoc** — removed undocumented `maxDepth` param from `weightedShortestPath` and `aStarSearch` JSDoc and `index.d.ts` types (these methods don't support depth limiting).
- **Traverse facade: `signal` forwarding** — `isReachable`, `weightedShortestPath`, `aStarSearch`, and `bidirectionalAStar` now forward `options.signal` to the `GraphTraversal` engine.
- **`AdjacencyNeighborProvider`: isolated node visibility** — `LogicalTraversal` now passes `aliveNodes` from the materialized OR-Set when constructing the provider, so `hasNode()` correctly reports isolated nodes (no edges) as alive.
- **IncrementalIndexUpdater: overflow guard** — `_handleNodeAdd` now throws `ShardIdOverflowError` when a shard's `nextLocalId` reaches 2^24, matching the full-build path and preventing silent globalId collisions across shards.
- **IncrementalIndexUpdater: undefined label guard** — `_handleEdgeRemove` now returns early when the edge label is not in the label registry, preventing a `"undefined"` bucket from being targeted.
- **GraphTraversal: bidirectional A\* backward weight direction** — `_biAStarExpand` now passes `weightFn(neighborId, current, label)` when expanding backward, correctly reflecting edge direction for asymmetric weight functions.
- **JoinReducer: spurious diff entries for already-dead elements** — `snapshotBeforeOp` now captures alive-ness before `NodeRemove`/`EdgeRemove` ops, and `collectNodeRemovals`/`collectEdgeRemovals` only record transitions from alive → dead, eliminating spurious diff entries for redundant removes.
- **Schema 4 checkpoint support in materialize** — `materialize()` now recognizes schema:4 checkpoints (previously only schema:2/3). When a schema:4 checkpoint includes `indexShardOids`, the bitmap index is hydrated from stored OIDs, avoiding a full rebuild.
- **CLI verify-index/reindex: public API** — CLI commands now use public `verifyIndex()` and `invalidateIndex()` methods instead of accessing private underscore-prefixed properties. Both commands now include proper try/catch error handling.
- **`_buildView` index failure logging** — `_buildView` now logs a warning via `this._logger?.warn()` when the index build fails, instead of silently nulling all index state.
- **`createCheckpoint` index tree cache reuse** — `createCheckpoint()` now reuses `_cachedIndexTree` from a prior `materialize()` instead of unconditionally calling `_viewService.build()`, avoiding a redundant O(N) full rebuild.
- **CheckpointService: codepoint sort** — tree entry sorting now uses codepoint comparison instead of `localeCompare`, matching Git's byte-order requirement.
- **BitmapNeighborProvider: constructor guard** — throws when neither `indexReader` nor `logicalIndex` is provided, preventing silent empty-result misconfiguration.
- **fixtureDsl: complete op fields** — `NodeRemove` ops now include `node` field, `EdgeRemove` ops include `from`, `to`, `label` fields, matching the contract expected by `accumulateOpDiff`.

### Added (MaterializedView architecture & indexing)

- **`nodeWeightFn` option for node-weighted graph algorithms** — `weightedShortestPath`, `aStarSearch`, `bidirectionalAStar`, and `weightedLongestPath` now accept `nodeWeightFn(nodeId) => number` as an alternative to `weightFn`. Weight = cost to enter the destination node. Internally memoized (each node resolved at most once). Mutually exclusive with `weightFn` — providing both throws `E_WEIGHT_FN_CONFLICT`.
- **`graph.traverse` — 7 new facade methods** — `isReachable`, `weightedShortestPath`, `aStarSearch`, `bidirectionalAStar`, `topologicalSort`, `commonAncestors`, and `weightedLongestPath` are now accessible via the public `graph.traverse.*` API, matching the full `GraphTraversal` engine surface. Previously these required constructing `GraphTraversal` + `NeighborProvider` directly.

### Added

- **MaterializedView unification** — Phase 3: single service orchestrating build, persist, and load of the bitmap index + property reader as a coherent materialized view.
  - **`MaterializedViewService`** (`src/domain/services/MaterializedViewService.js`) — three entry points: `build(state)` from WarpStateV5, `persistIndexTree(tree, persistence)` to Git, `loadFromOids(shardOids, storage)` for lazy hydration. In-memory PropertyReader uses path-as-OID trick for zero-copy shard access during build.
  - **`LogicalIndexReader`** (`src/domain/services/LogicalIndexReader.js`) — extracted index hydration from test helpers into production code. Two load paths: `loadFromTree(tree)` (sync, in-memory) and `loadFromOids(shardOids, storage)` (async, lazy). Produces a `LogicalIndex` interface for `BitmapNeighborProvider`.
  - **CheckpointService schema 4** — checkpoints now embed the bitmap index as a Git subtree under `index/`. `createV5()` accepts optional `indexTree` param; `loadCheckpoint()` partitions `index/`-prefixed entries into `indexShardOids` for lazy hydration. Backward-compatible with schema 2/3.
  - **WarpGraph lifecycle wiring** — `_setMaterializedState` builds a `LogicalIndex` + `PropertyReader` and attaches a `BitmapNeighborProvider` to `_materializedGraph`. Index build cached by stateHash, wrapped in try-catch for resilience.
  - **Indexed query fast paths** — `getNodeProps()` and `neighbors()` check the LogicalIndex/PropertyReader/BitmapNeighborProvider for O(1) lookups before falling through to linear scan.
  - **Seek cache index persistence** — `CasSeekCacheAdapter` stores/returns optional `indexTreeOid` alongside the state buffer. `_materializeWithCeiling` persists the index tree to Git and records the OID in cache metadata; on cache hit, restores the index from the stored tree.
  - **ObserverView fast path** — reuses parent graph's `BitmapNeighborProvider` for O(1) adjacency lookups with post-filter glob matching on visible nodes.

- **Logical graph bitmap index** — Phase 2: CBOR-based bitmap index over the logical graph with labeled edges, stable numeric IDs, property indexes, and O(1) label-filtered neighbor lookups.
  - **`fnv1a`** (`src/domain/utils/fnv1a.js`) — FNV-1a 32-bit hash for shard key computation on non-SHA node IDs.
  - **`computeShardKey`** (`src/domain/utils/shardKey.js`) — 2-char hex shard key: SHA prefix for hex IDs, FNV-1a low byte for everything else.
  - **`encodeCanonicalCbor` / `decodeCanonicalCbor`** (`src/domain/utils/canonicalCbor.js`) — canonical CBOR encoding with deterministic key ordering via `defaultCodec`.
  - **`ShardIdOverflowError`** (`src/domain/errors/ShardIdOverflowError.js`) — thrown when a shard exceeds 2^24 local IDs. Code: `E_SHARD_ID_OVERFLOW`.
  - **`LogicalBitmapIndexBuilder`** (`src/domain/services/LogicalBitmapIndexBuilder.js`) — core builder producing CBOR shards: `meta_XX.cbor` (stable nodeId↔globalId, alive bitmap), `labels.cbor` (append-only label registry), `fwd_XX.cbor`/`rev_XX.cbor` (per-label + all Roaring bitmaps), `receipt.cbor`. Supports seeding from prior builds for ID stability across rebuilds.
  - **`PropertyIndexBuilder`** (`src/domain/services/PropertyIndexBuilder.js`) — builds `props_XX.cbor` shards from node properties. Proto-safe array-of-pairs serialization.
  - **`PropertyIndexReader`** (`src/domain/services/PropertyIndexReader.js`) — lazy property reader with LRU shard cache via `IndexStoragePort.readBlob`.
  - **`LogicalIndexBuildService`** (`src/domain/services/LogicalIndexBuildService.js`) — orchestrates full index build from `WarpStateV5`: extracts visible projection, delegates to builder + property builder, returns serialized tree + receipt.
- **Cross-provider equivalence tests** — 18 tests verifying BFS, DFS, shortestPath, Dijkstra, A\*, topologicalSort produce identical results across `AdjacencyNeighborProvider` and `BitmapNeighborProvider`.
  - **Benchmark** (`test/benchmark/logicalIndex.benchmark.js`) — index build time at 1K/10K/100K nodes, single-node `getNeighbors` latency, `getNodeProps` latency.

### Changed (Provider integration & fixtures)

- **`BitmapNeighborProvider`** — dual-mode: commit DAG (`indexReader` param, existing) + logical graph (`logicalIndex` param, new). Logical mode supports per-label bitmap filtering, alive bitmap checks, and `'both'` direction dedup.
- **Contract tests** — added `BitmapNeighborProvider` as third provider to both `contractSuite` (unlabeled) and `labelContractSuite` (labeled). All 44 contract assertions pass.
- **Fixture DSL** — added `makeLogicalBitmapProvider(fixture)`: builds `WarpStateV5` from fixture → `LogicalIndexBuildService` → in-memory `LogicalIndex` adapter → `BitmapNeighborProvider`.

- **`NeighborProviderPort`** (`src/ports/NeighborProviderPort.js`) — abstract interface for neighbor lookups on any graph. Methods: `getNeighbors(nodeId, direction, options)`, `hasNode(nodeId)`, `latencyClass` getter. Direction: `'out' | 'in' | 'both'`. Edges sorted by `(neighborId, label)` via strict codepoint comparison.
- **`AdjacencyNeighborProvider`** (`src/domain/services/AdjacencyNeighborProvider.js`) — in-memory provider wrapping `{ outgoing, incoming }` adjacency maps. Pre-sorts at construction. `latencyClass: 'sync'`. Deduplicates `'both'` direction by `(neighborId, label)`.
- **`GraphTraversal`** (`src/domain/services/GraphTraversal.js`) — unified traversal engine accepting any `NeighborProviderPort`. 11 algorithms: BFS, DFS, shortestPath, isReachable, weightedShortestPath (Dijkstra), aStarSearch, bidirectionalAStar, topologicalSort, connectedComponent, commonAncestors, weightedLongestPath. All methods accept `AbortSignal`, `maxNodes`, `maxDepth`, `hooks`, and return `stats`. Deterministic: BFS level-sorted lex, DFS reverse-push lex, PQ tie-break by lex nodeId, Kahn zero-indegree sorted lex. Equal-cost predecessor update rule enforced.
- **`BitmapNeighborProvider`** (`src/domain/services/BitmapNeighborProvider.js`) — commit DAG provider wrapping `BitmapIndexReader`. Commit DAG edges use `label = ''` (empty string sentinel). `latencyClass: 'async-local'`.
- **`MinHeap` tie-breaking** — optional `tieBreaker` comparator in constructor. Used by Dijkstra/A\* for deterministic lex nodeId ordering on equal priority. Backward compatible.

### Changed (Deprecations)

- **`LogicalTraversal`** — deprecated; now delegates to `GraphTraversal + AdjacencyNeighborProvider` internally. Public API unchanged. New code should use `GraphTraversal` directly.

## [11.5.3] — 2026-02-22 — Mermaid Diagram Migration

### Changed

- **Mermaid diagrams** — replaced 8 Graphviz SVG diagrams with inline Mermaid code blocks in README.md and GUIDE.md; deleted 3 unreferenced diagram pairs from `docs/images/`. Mermaid renders natively on GitHub with zero build step, eliminating transparency/font/scaling issues with the old SVGs. Deleted `docs/diagrams/` (8 `.dot` + 8 `.svg` + `style.dot`), `docs/images/{git-perspective,emptygraph-perspective,bitmap-index}.{dot,svg}`, and `scripts/build-diagrams.sh`.
- **Mermaid diagram detail** — restored information lost during migration: patch anatomy trailers (`eg-state-hash`, `eg-frontier-oid`) and operation parameter signatures, materialization O(P) complexity annotation, data-storage visibility annotations, and ref-layout elision nodes.

## [11.5.1] — 2026-02-22 — M9 PARTITION: Architectural Decomposition

Breaks apart structural DRY violations and extracts encapsulated services
from the WarpGraph god class, without changing any public API surface.

### Added

- **Publication-quality SVG diagrams** — 8 Graphviz diagrams in `docs/diagrams/` covering data storage, two-plane state model, ref layout, patch anatomy, multi-writer convergence, materialization pipeline, checkpoint tree, and hexagonal architecture. Grayscale, transparent-background, serif-font styling matching the AION paper aesthetic.
- **`scripts/build-diagrams.sh`** — compiles all `.dot` files to SVG with transparent-background post-processing.
- **`SyncController`** (`src/domain/services/SyncController.js`) — new class encapsulating all 9 sync methods (`getFrontier`, `hasFrontierChanged`, `status`, `createSyncRequest`, `processSyncRequest`, `applySyncResponse`, `syncNeeded`, `syncWith`, `serve`) and 2 private helpers. Independently unit-testable with a mock host object. 16 new tests.
- **`applyFast()` / `applyWithReceipt()`** — named exported functions in `JoinReducer.js` replacing the duplicated fast/receipt code paths. `join()` is now a 3-line dispatcher. `reduceV5()` calls named functions directly. 4 new tests.
- **`isValidShardOid()`** (`src/domain/utils/validateShardOid.js`) — domain-local hex OID validator (4–64 chars). `BitmapIndexReader.setup()` validates each shard OID: strict mode throws `ShardCorruptionError`, non-strict skips with warning. 13 new tests.
- **Frontier fix verification test** (`SyncController.test.js`) — confirms `applySyncResponse` passes `_lastFrontier` (SHA map), not `observedFrontier` (VersionVector), as 3rd arg.
- **Null-context guard tests** (`JoinReducer.test.js`) — 2 tests verifying `applyFast` handles `undefined` and `null` context gracefully via the `|| {}` fallback.
- **Auto-materialize path tests** (`SyncController.test.js`) — 2 tests for `syncWith`: calls `materialize()` when `_cachedState` is null; returns `state` when `materialize: true`.
- **HTTP sync path tests** (`SyncController.test.js`) — 9 tests covering success, 5xx/4xx status codes, invalid JSON, AbortError, TimeoutError, network error, `shouldRetry` predicate, and auth header forwarding.
- **`serve()` deeper tests** (`SyncController.test.js`) — 3 tests verifying `HttpSyncServer` constructor args, auth config enhancement (crypto + logger injection), and graph host passthrough.

### Changed

- **`sync.methods.js`** — deleted entirely; sync methods now wired via `defineProperty` delegation to `_syncController`.
- **`WarpGraph.js`** — added `_syncController` field instantiation in constructor (+4 LOC, now 422 LOC total — well under the 500 LOC M9 gate).
- **`JoinReducer.join()`** — refactored from inline dual-path to dispatcher over `applyFast` / `applyWithReceipt`. Shared frontier update logic extracted into `updateFrontierFromPatch()` helper.

### Fixed

- **`applySyncResponse` frontier source** — now uses `_lastFrontier` (SHA map) instead of `observedFrontier` (VersionVector) as the 3rd arg to `applySyncResponseImpl`, eliminating a double-cast bug (B56).
- **`syncWith` infinite delegation guard** — `syncWith` now calls `this.createSyncRequest()` / `this.applySyncResponse()` directly instead of `this._host.*`, preventing infinite delegation when the host delegates back to the controller.
- **`BitmapIndexReader` strict default** — changed from `false` to `true`; shard OID validation errors now throw `ShardCorruptionError` by default instead of silently skipping. All existing callers already pass `strict: true` explicitly.
- **`mockServerGraph` asymmetry** — `syncAuth` test helper now mocks on `_syncController.processSyncRequest` (matching `mockClientGraph` pattern) instead of shadowing the prototype with an own-property mock.
- **Stale comment** — `BitmapIndexReader.test.js` comment corrected from "default" to "explicit override" for `strict: false` reader.
- **OID length standardization** — all 25 short 8-char OIDs in `BitmapIndexReader.test.js` extended to 40-char zero-padded hex, matching real Git SHA-1 length and eliminating non-hex characters (`eeffgghh` → `eeff00dd…`).

## [11.5.0] — 2026-02-20 — Content Attachment (Paper I `Atom(p)`)

Implements content attachment — the ability to attach content-addressed blobs
to WARP graph nodes and edges as first-class payloads. A blob OID stored as
a `_content` string property gets CRDT merge (LWW), time-travel, and observer
scoping for free — zero changes to JoinReducer, serialization, or the CRDT layer.

### Added

- **`CONTENT_PROPERTY_KEY`** constant (`'_content'`) exported from `KeyCodec` and `index.js`.
- **`PatchBuilderV2.attachContent(nodeId, content)`** — writes blob to Git object store, sets `_content` property, tracks OID for GC anchoring.
- **`PatchBuilderV2.attachEdgeContent(from, to, label, content)`** — same for edges.
- **`PatchSession.attachContent()`** / **`attachEdgeContent()`** — async pass-through delegates.
- **`WarpGraph.getContent(nodeId)`** — returns `Buffer | null` from the content blob.
- **`WarpGraph.getContentOid(nodeId)`** — returns hex OID or null.
- **`WarpGraph.getEdgeContent(from, to, label)`** / **`getEdgeContentOid(from, to, label)`** — edge variants.
- **Blob anchoring** — content blob OIDs embedded in patch commit tree as `_content_<oid>` entries (self-documenting, unique by construction). Survives `git gc --prune=now`.
- **Type declarations** — all new methods in `index.d.ts`, `type-surface.m8.json`, `consumer.ts`.
- **Integration tests** — 11 tests covering single-writer, LWW, time-travel, deletion, Writer API, GC durability, binary round-trip.
- **Unit tests** — 23 tests for PatchBuilderV2 content ops and WarpGraph query methods.
- **ADR-001 Folds** — design document for future recursive attachments (structural zoom portals). Deferred; documents the path from `Atom(p)` to full `α(v) → WARP` recursion.

### Fixed

- **Checkpoint content anchoring** — `CheckpointService.createV5()` now scans `state.prop` for `_content` values and embeds the referenced blob OIDs in the checkpoint tree as `_content_<oid>` entries. This ensures content survives `git gc` even if patch commits are ever pruned.
- **`GitGraphAdapter.readBlob()`** — Now always returns a real Node `Buffer` (wraps `Uint8Array` from plumbing with `Buffer.from()`). Consumers can call `.toString('utf8')` directly.
- **`observedFrontier` staleness (#43)** — `JoinReducer.join()` now folds the patch's own dot (`{writer, lamport}`) into `observedFrontier`. Previously the frontier only reflected patch context VVs (pre-creation state), lagging by one tick per writer. The graph's `_versionVector` — cloned from `observedFrontier` after materialization — now reflects actual Lamport ticks.

## [11.4.0] — 2026-02-20 — M8 IRONCLAD Phase 3: Declaration Surface Automation

Completes M8 IRONCLAD with automated declaration surface validation and expanded
consumer type tests. All three M8 phases are now DONE.

### Added

- **Declaration surface validator** (`scripts/check-dts-surface.js`) — Cross-checks `contracts/type-surface.m8.json` manifest against `index.js` runtime exports and `index.d.ts` declarations. Catches drift when exports are added or removed without updating the other surfaces. Exits non-zero on any missing declaration.
- **CI Gate 5** — Declaration surface validator wired into the `type-firewall` job in `.github/workflows/ci.yml`. Runs after Gate 4 (ESLint).
- **`typecheck:surface` npm script** — Runs `node scripts/check-dts-surface.js`.

### Changed

- **Consumer type test expansion** (`test/type-check/consumer.ts`) — Coverage expanded from ~60% to full API surface per manifest. All WarpGraph instance methods, standalone functions, class constructors, getters/setters, and 6 negative `@ts-expect-error` cases now covered. See `contracts/type-surface.m8.json` for the complete surface.
- **Release workflow** (`release.yml`) — Trigger changed from `workflow_run` to direct tag push for simpler, more reliable releases.
- **ROADMAP.md** — M8 Phase 1, Phase 2, and Phase 3 statuses updated to `DONE`.

## [11.3.3] — 2026-02-20 — Fix: Lamport Clock Global Max

Fixes a Lamport clock monotonicity bug where `_maxObservedLamport` was not
updated from the frontier during materialization, only from individual patches.
Extracts scan helpers and satisfies TypeScript strict narrowing.

### Fixed

- **Lamport frontier scan** — `scanFrontierForMaxLamport` extracted as a module-private helper in `materialize.methods.js`. Previously the frontier's Lamport values were not scanned when computing the global max, which could cause clock drift in multi-writer scenarios.
- **Lamport patch scan** — `scanPatchesForMaxLamport` extracted alongside the frontier scan, replacing inline loops that pushed `materialize()` past lint complexity (38 vs max 35) and nesting depth (7 vs max 6).
- **TS narrowing for `patch.lamport`** — `patch.lamport` (`number | undefined`) is now extracted to a local `const tick = patch.lamport ?? 0` so TypeScript can narrow the type at the assignment site.
- **PatchBuilderV2 `commit()` non-patch ref crash** — `commit()` unconditionally called `decodePatchMessage()` on the current writer ref, which throws if the ref points to a non-patch commit (e.g. checkpoint). Now calls `detectMessageKind()` first and only decodes when the kind is `'patch'`, matching the existing guard in `_nextLamport()`.

### Changed

- **WarpGraph** — Added `_maxObservedLamport` private field (initialized to `0`); `_nextLamport()` now returns `Math.max(ownTick, _maxObservedLamport) + 1` for globally-monotonic ticks; `_onPatchCommitted()` updates `_maxObservedLamport` after each successful commit. Exposed `_maxObservedLamport` getter for test observability.
- **PatchBuilderV2** — `commit()` / `build()` now read `graph._maxObservedLamport` to seed the Lamport clock, ensuring monotonicity across materialize→write cycles.
- **No-coordination test suite** — Added Lamport monotonicity regression tests in `WarpGraph.noCoordination.test.js`.

### Removed

- **docs/RECONCILIATION.md** — Planning document removed from the repository.

## [11.3.2] — 2026-02-19 — M9 IRONCLAD: Zero Wildcards

Eliminates all 9 remaining wildcards (7 in bitmap index code, 2 in TrustRecordService)
and sets the fence to 0. Fixes two latent bugs in TrustRecordService that would have
failed at runtime against a real GitGraphAdapter.

### Fixed

- **TrustRecordService.writeTree** — Was passing an object `{ 'record.cbor': blobOid }` but TreePort expects mktree-format `string[]`. Fixed to `["100644 blob <oid>\trecord.cbor"]`.
- **TrustRecordService.createCommit** — Was calling non-existent `createCommit()` method. Fixed to `commitNodeWithTree({ treeOid, parents, message })` matching CommitPort.
- **Bitmap serialize portability** — `bitmap.serialize(true).toString('base64')` relied on Node Buffer return type. Wrapped in `Buffer.from()` for explicit Uint8Array→Buffer conversion.

### Changed

- **RoaringBitmapSubset typedef** — New structural typedef in `src/domain/utils/roaring.js` covering `size`, `add`, `has`, `orInPlace`, `serialize`, `toArray`. Replaces 7 `any`/`*` wildcards across `BitmapIndexBuilder`, `StreamingBitmapIndexBuilder`, and `BitmapIndexReader`.
- **BitmapIndexReader shard types** — Internal shard data typed as `Record<string, string | number>` with narrowing casts at call sites (meta shards → `Record<string, number>`, bitmap shards → `Record<string, string>`).
- **TrustRecordService constructor** — `{*}` params replaced with `CommitPort & BlobPort & TreePort & RefPort` and `CodecPort`.
- **any-fence.json** — Wildcard count ratcheted from 9 → 0.

### Review Fixes (post-review cleanup)

- **Stray transcript file** — Removed `2026-02-17-131249-…w.txt` accidentally committed with M9.
- **BitmapIndexReader return types** — `_handleShardError`, `_tryHandleShardError`, and `_getOrLoadShard` return types now include `RoaringBitmapSubset` for the bitmap-format branch.
- **`_tryHandleShardError` guard** — Added `instanceof Error` guard, removing bare `/** @type {Error} */` cast on `unknown` catch variable.
- **Test cast simplification** — Replaced `/** @type {*} */` with structural `{ has: (id: number) => boolean }` in `WarpStateIndexBuilder.test.js`.
- **pre-commit hook** — Added `|| true` to `grep -zE` so non-JS commits don't abort under `set -e`.
- **loadFence robustness** — `loadFence()` in `ts-policy-check.js` now distinguishes ENOENT (returns null) from JSON parse errors (throws). Prevents malformed fence from silently disabling the ratchet.
- **HttpSyncServer authSchema** — Added JSDoc type annotations to `z.custom()` for `crypto` and `logger` so `z.infer<>` preserves port types instead of inferring `unknown`.
- **TrustStateBuilder recordId** — Replaced `/** @type {string} */ (record.recordId) ?? '(unknown)'` with `typeof` guard so the nullish fallback is actually reachable.
- **SyncProtocol types** — `patch: Object` → `patch: DecodedPatch` in `SyncResponse` typedef and `loadPatchRange` return. Added missing `@param` for `{ codec }` on both `processSyncRequest` and `loadPatchRange`.
- **TrustRecordService.readRecords guard** — Added `blobOid` null check before calling `readBlob()`, mirroring the pattern in `_readTip`.
- **CommitDagTraversalService constructor** — Removed `= {}` default so TypeScript enforces the required `indexReader` at compile time.
- **PatchCommitEvent.sha** — Made `sha` property required (was optional but always provided at emission).
- **prepack gate** — Wired `typecheck:consumer` into `prepack` script.
- **JSR publish dry-run panic** — Added `imports` map for `roaring` in `jsr.json` so Deno's rewriter doesn't generate overlapping TextChange entries on duplicate `import('roaring')` references in JSDoc. Also synced `jsr.json` version to 11.3.2.
- **BATS query test flake** — Fixed order-sensitive assertion in test #93 "query returns nodes using builder" — sorted node IDs before comparison.

### Review Fixes (CodeRabbit round 3)

- **type-surface manifest** — Added missing `setSeekCache` method; `syncWith` return type now includes optional `state` property matching `index.d.ts`.
- **HttpSyncServer z.custom types** — Added `z.ZodType<>` annotations to `httpPort` and `graph` in `optionsSchema` so `z.infer` preserves port types. Improved error messages.
- **HttpSyncServer allowedWriters** — Empty array `[]` no longer triggers the "requires auth" validation error (truthy check → length check).
- **HttpSyncServer initAuth JSDoc** — Merged duplicate JSDoc blocks; removed stale `crypto?: *` and `logger?: *` wildcards.
- **WormholeService typeof guards** — Added `typeof` string guards for `fromSha`, `toSha`, `writerId` before JSDoc casts, matching the existing `patchCount` guard pattern.
- **TrustRecordService \_persistRecord** — `record.recordId` and `record.recordType` now use `typeof` guards instead of bare JSDoc casts, preventing `TypeError` on `undefined`.
- **StreamingBitmapIndexBuilder frontier type** — `finalize()` JSDoc changed from `Map<string, number>` to `Map<string, string>` (writerId → tip SHA), matching all callers. Removed double cast in `IndexRebuildService.rebuild()`.
- **BunHttpAdapter stop() typedef** — `BunServer.stop()` return type corrected from `void` to `Promise<void>` in both JSDoc typedef and `globals.d.ts`.
- **ROADMAP.md** — Added `text` language specifier to fenced code block (MD040). Fixed grep acceptance criterion (`-rE` flag + wildcard pattern).

## [11.3.1] — 2026-02-18 — M8 IRONCLAD: Embedded Wildcard Elimination

Completes M8 IRONCLAD by eliminating all remaining embedded wildcards, fixing
behavioral regressions from the initial sweep, and upgrading the policy checker
to prevent regressions.

### Fixed

- **vvSerialize restoration** — Restored `vvSerialize()` call in `PatchBuilderV2.commit()` / `build()` that was accidentally replaced with a type-only cast, preventing Map→Object serialization of version vectors in patch context fields.
- **Constructor JSDoc accuracy** — Reverted 6 constructors (`CommitDagTraversalService`, `DagPathFinding`, `DagTopology`, `DagTraversal`, `IndexRebuildService`, `SyncAuthService`) from falsely optional `[options]` back to required params with typed default casts.
- **serve() JSDoc** — `port` and `httpPort` parameters restored to required (matching runtime validation).

### Changed

- **M8 IRONCLAD Wave 3: cast elimination** — Removed ~107 wildcard casts (`@type {*}` / `@type {any}`) across ~40 files in `src/domain/warp/`, `src/domain/services/`, and `src/infrastructure/adapters/`. All casts replaced with role-specific persistence types, error narrowing helpers (`isError`, `hasErrorCode`, `hasMessage`), and properly typed aliases.
- **Embedded wildcard elimination** — Replaced 48 embedded `*` wildcards (`Array<*>`, `Map<string, *>`, `LWWRegister<*>`, `Promise<{payload: *}>`, etc.) with `unknown` or proper specific types across 31 files.
- **PersistenceReader/Writer/CheckpointPersistence → CorePersistence** — Collapsed three identical type aliases into one honest `CorePersistence` type with documentation noting read/write separation is aspirational.
- **Proper return types** — Added `AuditReceipt` typedef in `AuditVerifierService`, `CasStore` typedef in `CasSeekCacheAdapter`, `WarpGraphInstance` param type in `patch.js`, specific patch shape types.
- **HttpSyncServer** — Constructor now uses Zod schema validation; all four `z.any()` uses replaced with `z.custom()` validators.
- **HookInstaller** — Constructor deps parameter changed from optional to required.
- **SyncAuthService** — `_validateKeys` now typed as assertion function for proper post-validation narrowing.
- **WarpPersistence types** — Added `IndexStorage` typedef (`BlobPort & TreePort & RefPort`).
- **Policy checker upgrade** — `ts-policy-check.js` now enforces 4 rules: (1) ban `@ts-ignore`, (2) ban `@type {*}`/`@type {any}`, (3) ban embedded wildcards in JSDoc generics, (4) ban `z.any()`.

## [11.3.0] — 2026-02-17 — DX-HAMMER: Read-Path CLI Improvements

New CLI commands and improved output for graph inspection and debugging.

### Added

- **`git warp patch` command**: Decode and inspect raw patches.
  - `patch show <sha>` — display a single patch with decoded operations (`+`/`-`/`~` sigils).
  - `patch list` — list all patches sorted by Lamport clock, with `--writer` filter and `--limit`.
- **`git warp tree` command**: ASCII tree traversal with box-drawing characters.
  - Auto-detects root nodes, or accepts an explicit root positional arg.
  - `--edge <label>` — follow only edges with a given label.
  - `--prop <key>` — annotate nodes with property values (repeatable).
  - `--max-depth <n>` — limit traversal depth.
  - Cycle detection, orphan reporting.
- **Edges in query output**: `query` now fetches and displays outgoing/incoming edges per node in both text and JSON formats.

### Fixed

- **History error UX**: `history --writer <unknown>` now lists known writers in the error message.
- **Path exit code**: "no path found" returns exit code 1 (grep convention) instead of 2.

## [11.2.1] — 2026-02-17 — Decompose WarpGraph Monolith

Decomposes `WarpGraph.js` from 3260 lines to 416 lines (-87%) by extracting methods into 9 focused modules in `src/domain/warp/`, with no changes to the public API surface.

### Changed

- **`WarpGraph.js`**: Reduced to constructor, `static open()`, property getters, and `_logTiming()`. All other methods extracted into dedicated modules wired onto the prototype at import time via `wireWarpMethods()`.
- **Method modules** (`src/domain/warp/`): `query.methods.js`, `patch.methods.js`, `sync.methods.js`, `checkpoint.methods.js`, `fork.methods.js`, `materialize.methods.js`, `materializeAdvanced.methods.js`, `subscribe.methods.js`, `provenance.methods.js`.
- **`_wiredMethods.d.ts`**: TypeScript module augmentation so `tsc --noEmit` sees the wired methods.

### Fixed

- **Stack safety**: Replaced `allPatches.push(...patches)` with loop in `_loadPatchesSince` to prevent stack overflow on large histories.
- **GC guard**: `_maybeRunGC` no longer triggers spurious GC on first run when `_lastGCTime` is 0.
- **Sync state freshness**: `applySyncResponse` now clears `_stateDirty` so `status()` reports "fresh" after sync.
- **Test correctness**: `createHighTombstoneState()` test helper now uses proper Dot objects instead of raw strings, fixing silent `computeAppliedVV` failures.
- **Deno imports**: Replaced `https://deno.land` imports with `jsr:@std/assert` for Docker `--node-modules-dir` compatibility.

## [11.2.0] — 2026-02-16 — Trust V1 Phases 2–5: Record Store, Evaluation, CLI, Hardening

Implements Milestone 7 (Trust V1). Writer trust is now derived from signed Ed25519 records with monotonic key/binding revocation, evaluated deterministically, and surfaced through a new `git warp trust` CLI command. Release gates (RG-T1 through RG-T8) require verification before v2.0 tag.

### Added

- **`TrustStateBuilder`** (`src/domain/trust/TrustStateBuilder.js`): Pure function `buildState(records)` that walks an ordered trust record chain and accumulates active/revoked keys and writer bindings. Enforces monotonic revocation — revoked keys cannot be re-added.
- **`TrustEvaluator`** (`src/domain/trust/TrustEvaluator.js`): Pure function `evaluateWriters(writerIds, trustState, policy)` producing a frozen `TrustAssessment` with per-writer explanations, reason codes, and evidence summary. Deterministic: sorted writers, sorted explanations.
- **`TrustRecordService`** (`src/domain/trust/TrustRecordService.js`): Manages the append-only trust record chain under `refs/warp/<graph>/trust/records`. Methods: `appendRecord()` (schema + recordId + prev-link + signature-envelope validation), `readRecords()` (chain walk, oldest-first), `verifyChain()` (structural integrity). Note: `appendRecord` validates signature envelope structure (presence of `alg` + `sig` fields) but does not perform cryptographic Ed25519 verification — full crypto verification happens during `buildState()` evaluation.
- **`buildTrustRecordRef()`** in `RefLayout.js`: Returns `refs/warp/<graph>/trust/records`.
- **`AuditVerifierService.evaluateTrust()`**: Reads trust records, builds state, discovers writers, and returns a `TrustAssessment`. Integrates with existing audit verification.
- **`git warp trust`** CLI command: Evaluates writer trust from signed evidence. Options: `--mode <warn|enforce>`, `--trust-pin <sha>`. Pin resolution precedence: CLI flag > env (`WARP_TRUST_PIN`) > live ref.
- **`git warp verify-audit`** trust options: `--trust-mode <warn|enforce>`, `--trust-pin <sha>`. Trust assessment attached to verification output; enforce mode failures produce exit code 3.
- **Trust text presenter** (`renderTrust`): Color-coded verdict, per-writer trust status with icons, evidence summary.
- **Golden canonical fixtures** (`test/unit/domain/trust/fixtures/goldenRecords.js`): 5 frozen records (all 4 types) with real Ed25519 signatures and pinned SHA-256 digests.
- **143 new trust tests** across 14 test files:
  - Sign+verify round-trip (B23): 12 tests through canonical → sign → verify pipeline
  - Chain integration (B15): 5 tests for append → read-back → verify cycle
  - Adversarial suite: 8 tests covering tampered records, stale keys, revoked key bindings, out-of-order replay, forged issuerKeyId
  - Hash freeze: 8 pinned digest tests (schema lock for v2.0)
  - Cross-mode determinism: 5 tests confirming warn/enforce produce identical verdicts
  - TrustAssessment schema conformance: 9 snapshot tests
  - Domain purity: 37 grep-based checks (no `process.env` or infrastructure imports in trust domain)
  - CLI pin precedence + exit code matrix: 10 tests
- **Migration doc** (`docs/TRUST_MIGRATION.md`): Migration path from env-var allowlist to signed evidence.
- **Operator runbook** (`docs/TRUST_OPERATOR_RUNBOOK.md`): Bootstrap, verify, rotate, revoke, and incident response procedures.

### Changed

- **`AuditVerifierService`**: Imports `TrustRecordService`, `buildState`, `evaluateWriters` for the new `evaluateTrust()` method.
- **`verify-audit` CLI**: Updated schema and handler to accept `--trust-mode` and `--trust-pin`.
- **`ROADMAP.md`**: M7 Phases 0–5 all marked `DONE`.
- **`eslint.config.js`**: Trust domain files and `trust.js` CLI command added to relaxed complexity block.
- **`HELP_TEXT`** and **`KNOWN_COMMANDS`**: Updated with `trust` command and trust-related options.
- **`--show` flag removed from `trust` command**: The command always displays full trust state; `--show` was parsed but never acted on. If a quiet-check mode is needed, add `--quiet` in a future release.

## [11.1.0] — 2026-02-15 — Trust V1 Phase 1: Crypto Plumbing

Adds the cryptographic primitives for Trust V1 (Milestone 7): Ed25519 signature verification, key fingerprint computation, and deterministic record ID hashing.

### Added

- **`TrustCrypto`** (`src/domain/trust/TrustCrypto.js`): Ed25519 `verifySignature()`, `computeKeyFingerprint()`, and `SUPPORTED_ALGORITHMS` using `node:crypto` directly.
- **`TrustCanonical`** (`src/domain/trust/TrustCanonical.js`): SHA-256 hashing layer — `computeRecordId()`, `computeSignaturePayload()`, `verifyRecordId()` — built on the canonical serialization helpers from Phase 0.
- **`TrustError`** (`src/domain/errors/TrustError.js`): Domain error class with codes `E_TRUST_UNSUPPORTED_ALGORITHM` and `E_TRUST_INVALID_KEY`.
- **Tests**: 28 new tests across `TrustCrypto.test.js`, `TrustCanonical.test.js`, and `TrustError.test.js` covering signature verify, tamper detection, fingerprint integrity, unsupported algorithm rejection, and deterministic recordId computation.

### Changed

- **`AuditVerifierService`**: Extract `_listWriterIds()` private helper from `verifyAll()` for reuse; `verifyAll()` now only passes `{ since }` to `verifyChain()` (no options leak).
- **Domain purity**: Move `detectTrustWarning()` from `src/domain/` to CLI boundary (`bin/cli/commands/verify-audit.js`). `verifyAll()` receives `trustWarning` via options; both `--writer` and full paths now include the warning.
- **Tests**: Add domain purity boundary test (`process.env` grep guard) and trustWarning pass-through test.

## [11.0.0] — 2026-02-14 — Hardening Sprint

Completes M1.T2 (security hygiene), M2.T3 (signposts + defaults), and backlog items B1, B8–B10. Breaking change: `autoMaterialize` now defaults to `true`.

### Breaking

- **`autoMaterialize` defaults to `true`**: Query methods now transparently call `materialize()` when no cached state exists. To preserve old behavior, pass `autoMaterialize: false` explicitly. See [migration guide](docs/GUIDE.md#migrating-from-automaterialize-false).

### Added

- **Writer whitelist (B1)**: `HttpSyncServer` and `SyncAuthService` accept an `allowedWriters` array. Sync requests with unlisted writer IDs are rejected with HTTP 403 (`FORBIDDEN_WRITER`). Metrics tracked via `forbiddenWriterRejects`.
- **`Writer.commitPatch()` reentrancy guard (B10)**: Throws `COMMIT_IN_PROGRESS` on nested calls, matching `graph.patch()` semantics.
- **Dangling-ref resilience (B8)**: `refExists()` and `readRef()` in `GitGraphAdapter` now catch `git show-ref` exit 128 (dangling object) alongside exit 1 (missing ref), returning `null`/`false` instead of throwing.
- **`graph.patch()` CAS integration tests (B9)**: End-to-end tests with real Git persistence verifying reentrancy guard, ref advancement, and sequential patch behavior.
- **CI security audit**: `npm audit --omit=dev --audit-level=high` added to the lint job (non-blocking).
- **SECURITY.md**: Dependency risk assessment, accepted risks table, threat model boundaries, and writer authorization documentation.

### Changed

- **Error messages**: `E_NO_STATE` and `E_STALE_STATE` messages now include actionable recovery hints and a docs URL; extracted to shared constants to prevent drift.
- **`QueryError` docs**: Updated JSDoc table for `E_NO_STATE` / `E_STALE_STATE` codes.
- **Config validation**: `HttpSyncServer` now throws at construction time if `allowedWriters` is provided without `auth.keys`.
- **Forbidden-writer logging**: `SyncAuthService.verifyWriters()` logs rejected writer IDs at warn level.

## [10.14.0] — 2026-02-14 — Patch Wrapper

Adds `graph.patch(fn)` — a single-await convenience wrapper around `createPatch()` + `commit()`. No semantic or runtime behavior changes; purely ergonomic sugar.

### Added

- **`graph.patch(fn)`**: Creates a patch, runs the callback, and commits in one await. Callback may be sync or async. Errors propagate untouched — no wrapping or relabeling.
- **`PatchSession.setEdgeProperty()`**: Delegate for setting properties on edges via `PatchSession` (previously only available on `PatchBuilderV2`).
- **TypeScript**: `patch()` on `WarpGraph`, `setEdgeProperty()` on `PatchSession`, `createPatch()` return type narrowed from `Promise<unknown>` to `Promise<PatchSession>`.

### Fixed

- **`graph.patch()` reentrancy guard**: Nested `graph.patch()` calls inside a callback now throw a clear error instead of silently breaking CAS semantics. Use `createPatch()` directly for advanced multi-patch workflows.
- **`examples/setup.js`**: Added missing `await` on `getNodes()`, `getEdges()`, and `getNodeProps()` calls (pre-existing bug).

## [10.13.0] — 2026-02-13 — Doctor Command

Adds `git warp doctor`, a structural diagnostics command that probes for anomalies (broken refs, missing objects, clock drift, audit gaps) and prescribes fixes. Read-only, no materialization required.

### Added

- **`git warp doctor`**: 7 diagnostic checks — repo-accessible, refs-consistent, coverage-complete, checkpoint-fresh, audit-consistent, clock-skew, hooks-installed
- **`--strict` flag**: Treats warnings as failures (exit 4 instead of 3)
- **Budget enforcement**: Global 10s deadline; skipped checks appear as findings, not silent omissions
- **Error boundary**: Each check is wrapped in try/catch so a single failing check produces a `CHECK_INTERNAL_ERROR` finding instead of crashing the entire command
- **Machine-readable output**: `--json` emits versioned `DoctorPayload` (v1) with policy echo, sorted findings, and priority actions
- **Human-readable output**: Colored status icons, per-finding fix suggestions, priority action summary
- **Code registry**: `bin/cli/commands/doctor/codes.js` — single source of truth for all finding codes
- **Schema + unit tests**: `doctorSchema` tests in schemas.test.js, golden-JSON tests in doctor.test.js
- **BATS E2E tests**: 5 scenarios in cli-doctor.bats (healthy JSON, human output, broken ref, missing checkpoint, strict mode)

### Fixed

- **coverage-complete**: Writer heads with null SHA are now reported as missing (not silently skipped)
- **checkHooksInstalled**: Made `async` for consistency with other check functions; removed redundant `await Promise.resolve()` wrapping
- **sort-order test**: Hardened to exercise all three status tiers (fail/warn/ok) with targeted mocks and assert the full three-key sort invariant (status > impact > id)
- **refs-consistent**: OK message now counts only verified refs (excludes null-sha writer heads); null-sha heads reported as `REFS_DANGLING_OBJECT`
- **collectWriterHeads**: Gracefully handles `readRef` failures (e.g. `git show-ref` exit 128 for dangling refs) instead of crashing the entire doctor command
- **seed-doctor-graph.js**: Calls `createCheckpoint()` + `syncCoverage()` (materialize alone does not create these refs); removed stale "installs hooks" claim
- **`_run_json` BATS helper**: Fixed status capture bug (`|| true` made `$?` always 0)

## [10.12.0] — 2026-02-13 — Multi-Runtime CLI + parseArgs Migration

Makes the CLI (`bin/`) portable across Node 22+, Bun, and Deno by removing Node-only dependencies, and replaces hand-rolled arg parsing with `node:util.parseArgs` + Zod schemas.

### Fixed

- **verify-audit**: Reject empty-string `--since`/`--writer` values at schema level; use strict `!== undefined` check for `writerFilter`
- **install-hooks**: `readHookContent` now only swallows ENOENT; permission errors propagate
- **view**: Module-not-found catch narrowed to `git-warp-tui` specifier/package name only (ignores transitive dep failures)
- **schemas**: `--max-depth` rejects negative values; `--diff` alone (without --tick/--latest/--load) now rejected; `--save`/`--load`/`--drop` reject empty-string cursor names; `--diff-limit` validates positive integer with user-friendly message; `--diff-limit` without `--diff` now rejected
- **npm packaging**: Added `bin/cli` to the `files` array — the commands-split refactor broke the published package for CLI use.
- **BATS audit seed**: Added `materialize()` call before first patch so `_cachedState` is initialized and audit receipts are created (all 5 verify-audit BATS tests were failing in CI).

### Changed

- **COMMANDS registry**: Extracted `COMMANDS` Map from `warp-graph.js` into `bin/cli/commands/registry.js` (side-effect-free); `KNOWN_COMMANDS` exported from `infrastructure.js`. Sync test asserts they match via direct import.
- **Cross-runtime adapters**: `NodeCryptoAdapter` → `WebCryptoAdapter` (uses `globalThis.crypto.subtle`), `ClockAdapter.node()` → `ClockAdapter.global()` (uses `globalThis.performance`), removed `import crypto from 'node:crypto'` in seek.js (converted `computeFrontierHash` to async Web Crypto).
- **Base arg parser** (`bin/cli/infrastructure.js`): Replaced 170 LOC hand-rolled parser with `node:util.parseArgs`. Two-pass approach: `extractBaseArgs` splits base flags from command args, `preprocessView` handles `--view`'s optional-value semantics. Returns `{options, command, commandArgs}` instead of `{options, positionals}`.
- **Per-command parsers**: All 10 commands now use `parseCommandArgs()` (wraps `nodeParseArgs` + Zod `safeParse`) instead of hand-rolled loops. Query uses a hybrid approach: `extractTraversalSteps` for `--outgoing`/`--incoming` optional values, then standard parsing for the rest.
- **Removed** `readOptionValue` and helper functions from infrastructure.js (no longer needed).

### Added

- **`bin/cli/schemas.js`**: Zod schemas for all commands — type coercion, enum validation, mutual-exclusion checks (seek's 10-flag parser).
- **`parseCommandArgs()`** in infrastructure.js: Shared helper wrapping `nodeParseArgs` + Zod validation for command-level parsing.
- **67 new CLI tests**: `parseArgs.test.js` (25 tests for base parsing), `schemas.test.js` (32 tests for Zod schema validation).
- **Public export**: `InMemoryGraphAdapter` now exported from the package entry point (`index.js` + `index.d.ts`) so downstream modules can use it for tests without reaching into internal paths.

## [10.11.0] — 2026-02-12 — COMMANDS SPLIT: CLI Decomposition

Decomposes the 2491-line `bin/warp-graph.js` monolith into per-command modules (M5.T1). Pure refactor — no behavior changes.

### Changed

- **`bin/warp-graph.js`**: Reduced from 2491 LOC to 112 LOC. Now contains only imports, the COMMANDS map, VIEW_SUPPORTED_COMMANDS, `main()`, and the error handler.
- **`bin/cli/infrastructure.js`**: EXIT_CODES, HELP_TEXT, CliError, parseArgs, and arg-parsing helpers.
- **`bin/cli/shared.js`**: 12 helpers used by 2+ commands (createPersistence, openGraph, applyCursorCeiling, etc.).
- **`bin/cli/types.js`**: JSDoc typedefs (Persistence, WarpGraphInstance, CliOptions, etc.).
- **`bin/cli/commands/`**: 10 per-command modules (info, query, path, history, check, materialize, seek, verify-audit, view, install-hooks).
- **ESLint config**: Added `bin/cli/commands/seek.js`, `bin/cli/commands/query.js`, and other `bin/cli/` modules to the relaxed-complexity block alongside `bin/warp-graph.js`.

## [10.10.0] — 2026-02-12 — VERIFY-AUDIT: Chain Verification

Implements cryptographic verification of audit receipt chains (M4.T1). Walks chains backward from tip to genesis, validating receipt schema, chain linking, Git parent consistency, tick monotonicity, trailer-CBOR consistency, OID format, and tree structure.

### Added

- **`AuditVerifierService`** (`src/domain/services/AuditVerifierService.js`): Domain service with `verifyChain()` and `verifyAll()` methods. Supports `--since` partial verification and ref-race detection.
- **`getCommitTree(sha)`** on `CommitPort` / `GraphPersistencePort`: Returns the tree OID for a given commit. Implemented in `GitGraphAdapter` (via `git rev-parse`) and `InMemoryGraphAdapter`.
- **`buildAuditPrefix()`** in `RefLayout`: Lists all audit writer refs under a graph.
- **`verify-audit` CLI command**: `git warp verify-audit [--writer <id>] [--since <commit>]`. Supports `--json` and `--ndjson` output. Exit code 3 on invalid chains.
- **Text presenter** for verify-audit: colored status, per-chain detail, trust warnings.
- **31 unit tests** in `AuditVerifierService.test.js` — valid chains, partial verification, broken chain detection, data mismatch, OID format validation, schema validation, warnings, multi-writer aggregation.
- **6 BATS CLI tests** in `cli-verify-audit.bats` — JSON/human output, writer filter, partial verify, tamper detection, no-audit-refs success.
- **Benchmark** in `AuditVerifierService.bench.js` — 1000-receipt chain verification (<5s target).

## [10.9.0] — 2026-02-12 — SHADOW-LEDGER: Audit Receipts

Implements tamper-evident, chained audit receipts per the spec in `docs/specs/AUDIT_RECEIPT.md`. When `audit: true` is passed to `WarpGraph.open()`, each data commit produces a corresponding audit commit recording per-operation outcomes. Audit commits form an independent chain per (graphName, writerId) pair, linked via `prevAuditCommit` and Git commit parents.

### Added

- **`audit: true` option** on `WarpGraph.open()` / constructor: Enables the audit receipt pipeline. Off by default — zero overhead when disabled.
- **`AuditReceiptService`** (`src/domain/services/AuditReceiptService.js`): Core service implementing canonicalization (domain-separated SHA-256 `opsDigest`), receipt record construction, Git object creation (blob → tree → commit → CAS ref update), retry-once on CAS conflict, degraded-mode resilience, and structured error codes.
- **`AuditMessageCodec`** (`src/domain/services/AuditMessageCodec.js`): Encode/decode audit commit messages with 6 trailers (`data-commit`, `graph`, `kind`, `ops-digest`, `schema`, `writer`) in lexicographic order.
- **`compareAndSwapRef()`** on `RefPort` / `GraphPersistencePort`: Atomic ref update with expected-old-value guard. Implemented in both `GitGraphAdapter` (via `git update-ref`) and `InMemoryGraphAdapter`.
- **`buildAuditRef()`** in `RefLayout`: Produces `refs/warp/<graphName>/audit/<writerId>` paths.
- **Spec amendment**: `timestamp` field changed from ISO-8601 string to POSIX millisecond integer (`uint`) in `docs/specs/AUDIT_RECEIPT.md`. All golden vector CBOR hex values regenerated.
- **34 unit tests** in `AuditReceiptService.test.js` — canonicalization, golden vectors, receipt construction, commit flow, CAS conflict/retry, error resilience, TickReceipt integration.
- **3 coverage tests** in `AuditReceiptService.coverage.test.js` — stats tracking for committed/skipped/failed counts.
- **5 codec tests** in `AuditMessageCodec.test.js` — round-trip, trailer order, missing/invalid trailers.
- **3 ref layout tests** in `RefLayout.audit.test.js` — `buildAuditRef` path construction.
- **4 CAS tests** in `RefPort.compareAndSwapRef.test.js` — genesis CAS, update CAS, mismatch rejection, pre-existing conflict.
- **7 integration tests** in `WarpGraph.audit.test.js` — audit off/on, ref advancement, chain linking, dirty-state skip, CBOR content verification, state correctness.
- **Benchmark stubs** in `AuditReceiptService.bench.js` for `computeOpsDigest` and `buildReceiptRecord`.

### Changed

- **`WarpGraph._onPatchCommitted()`**: When audit is enabled, invokes `joinPatch()` with receipt collection, then calls `AuditReceiptService.commit()` after state updates succeed. Logs `AUDIT_SKIPPED_DIRTY_STATE` when eager re-materialize is not possible.
- **`MessageCodecInternal`**: Added `audit` title constant and `dataCommit`/`opsDigest` trailer keys.
- **`MessageSchemaDetector`**: Recognizes `'audit'` message kind.
- **`WarpMessageCodec`**: Re-exports `encodeAuditMessage` and `decodeAuditMessage`.
- **`eslint.config.js`**: Added `AuditReceiptService.js` and `AuditMessageCodec.js` to relaxed complexity block.
- **`GraphPersistencePort.test.js`**: Added `compareAndSwapRef` to expected method list.
- **M3.T1.SHADOW-LEDGER** marked `DONE` in `ROADMAP.md`.

### Fixed

- **`WarpGraph.open()` audit validation**: Non-boolean truthy values (e.g. `'yes'`, `1`) now throw `'audit must be a boolean'`, matching existing `autoMaterialize` validation pattern.
- **`AuditReceiptService._commitInner()` cross-writer guard**: Rejects `TickReceipt` where `writer` does not match the service's `writerId`, preventing cross-writer attribution in the audit chain.
- **`GitGraphAdapter.compareAndSwapRef()`**: No longer retries on CAS mismatch — calls `plumbing.execute()` directly instead of `_executeWithRetry()`, since CAS failures are semantically expected.
- **`decodeAuditMessage()` hardened validation**: Decoder now validates graph name, writer ID, dataCommit OID format, opsDigest SHA-256 format, and schema as strict integer (rejects `1.5`), matching encoder strictness.
- **`AuditReceiptService.init()` cold-start logging**: Now logs `AUDIT_INIT_READ_FAILED` warning before falling back to genesis, giving operators visibility into unexpected cold starts.
- **`AuditReceiptService` dead write removed**: Removed unused `_tickCounter` field that was written but never read.
- **`WarpMessageCodec` JSDoc**: Updated from "three types" to "four types" and added `AuditMessageCodec` to the sub-module list.
- **`RefLayout` JSDoc**: Added `refs/warp/<graph>/audit/<writer_id>` to the module-level ref layout documentation.
- **`docs/GUIDE.md` trailer names**: Corrected trailer key names to include `eg-` prefix (e.g. `eg-data-commit` not `data-commit`).
- **`computeOpsDigest()` TextEncoder**: Hoisted to module-level constant to avoid per-call allocation.

## [10.8.0] — 2026-02-11 — PRESENTER: Output Contracts

Extracts CLI rendering into `bin/presenters/`, adds NDJSON output and color control. Net reduction of ~460 LOC in `bin/warp-graph.js`.

### Added

- **`--ndjson` flag**: Compact single-line JSON output with sorted keys for piping and scripting. Full payload structure preserved, `_`-prefixed internal keys stripped. Mutually exclusive with `--json` and `--view`.
- **`NO_COLOR` / `FORCE_COLOR` / `CI` support**: Plain-text output automatically strips ANSI escape codes when `NO_COLOR` is set, `FORCE_COLOR=0`, stdout is not a TTY, or `CI` is set. `FORCE_COLOR` (non-zero) forces color on.
- **`bin/presenters/json.js`**: `stableStringify()` (pretty-printed sorted JSON), `compactStringify()` (single-line sorted JSON), `sanitizePayload()` (strips `_`-prefixed keys).
- **`bin/presenters/text.js`**: All 9 plain-text renderers extracted from `warp-graph.js` — `renderInfo`, `renderQuery`, `renderPath`, `renderCheck`, `renderHistory`, `renderError`, `renderMaterialize`, `renderInstallHooks`, `renderSeek`.
- **`bin/presenters/index.js`**: Unified `present()` dispatcher replacing the 112-line `emit()` function. Handles format dispatch (text/json/ndjson), view mode routing (ASCII/SVG/HTML), and color control.
- **51 new unit tests** across `test/unit/presenters/` (json, text, present).
- **6 BATS integration tests** in `test/bats/cli-ndjson.bats` for NDJSON output and mutual-exclusion enforcement.

### Fixed

- **`--json` output sanitized**: Internal `_renderedSvg` and `_renderedAscii` keys are now stripped from JSON output. Previously these rendering artifacts leaked into `--json` payloads.
- **`package.json` files array**: Added `bin/presenters` so npm-published tarball includes the presenter modules (would have caused `MODULE_NOT_FOUND` at runtime).
- **`--view query` null guard**: `_renderedAscii` now uses `?? ''` fallback to prevent `"undefined"` in output when pre-rendered ASCII is missing.
- **`CliOptions` typedef**: Added missing `ndjson` property to JSDoc typedef.

### Changed

- **`bin/warp-graph.js`**: Reduced from 2893 to ~2430 LOC. Removed `stableStringify`, 9 `renderXxx` functions, `emit()`, `writeHtmlExport()`, ANSI constants. Replaced with 3-line `present()` call.
- **`renderSeek`**: Decomposed into `renderSeekSimple()`, `renderSeekList()`, `renderSeekState()`, and `renderSeekWithDiff()` to stay within ESLint complexity limits.
- **`renderCheck`**: Decomposed into `appendCheckpointAndWriters()` and `appendCoverageAndExtras()` helpers.
- **M2.T2.PRESENTER** marked `DONE` in `ROADMAP.md`.

## [10.7.0] — 2026-02-11 — MEM-ADAPTER: In-Memory Persistence

Adds `InMemoryGraphAdapter`, a zero-I/O implementation of `GraphPersistencePort` for fast tests.

### Added

- **`InMemoryGraphAdapter`** (`src/infrastructure/adapters/InMemoryGraphAdapter.js`): Full in-memory implementation of all five ports (Commit, Blob, Tree, Ref, Config). Uses Git's SHA-1 object format for content-addressable hashing. Accepts optional `author` and `clock` injection for deterministic tests.
- **`adapterValidation.js`** (`src/infrastructure/adapters/adapterValidation.js`): Extracted shared validation functions (`validateOid`, `validateRef`, `validateLimit`, `validateConfigKey`) used by both adapters.
- **Adapter conformance suite** (`test/unit/infrastructure/adapters/AdapterConformance.js`): ~25 shared behavioral tests that run against any `GraphPersistencePort` implementation, ensuring parity between Git and in-memory adapters.
- **`createInMemoryRepo()`** (`test/helpers/warpGraphTestUtils.js`): Test factory for instant in-memory adapter setup — no temp dirs, no git subprocesses.

### Fixed

- **`InMemoryGraphAdapter.writeTree()`**: Rejects malformed mktree entries missing a tab separator instead of silently producing garbage.
- **`InMemoryGraphAdapter._walkLog()`**: Replaced O(n) `queue.shift()` with index-pointer for O(1) dequeue; sort by date descending to match Git's reverse chronological ordering for merge DAGs.
- **`adapterValidation.validateRef()`**: Removed redundant `startsWith('--')` check (already covered by `startsWith('-')`).

### Changed

- **`GitGraphAdapter`**: Validation methods now delegate to shared `adapterValidation.js` functions. No behavioral change.

## [10.6.1] — 2026-02-11 — Code Review Fixups

Addresses code review feedback from PR #23 across SEEKDIFF and SHIELD features.

### Fixed

- **`SyncAuthService.verify()`**: Nonce is now reserved _after_ signature verification, preventing valid nonces from being consumed by requests with invalid signatures.
- **`HttpSyncServer.initAuth()`**: Validates `auth.mode` against allowed values (`'enforce'`, `'log-only'`), throwing on invalid strings instead of silently accepting them.
- **`parseSeekArgs()`**: `--diff-limit` without `--diff` now throws a clear usage error instead of being silently ignored.
- **`handleDiffLimitFlag()`**: Uses `Number()` instead of `parseInt()` to reject float values like `"1.5"` that were previously silently truncated to integers.
- **`buildTruncationHint()`**: Clamps remaining-change counts to non-negative values, preventing display of negative counts with pathological inputs.
- **`applyDiffLimit()`**: Comment corrected from "proportionally" to "sequentially" to match the actual greedy truncation behavior.

## [10.6.0] — 2026-02-11 — SHIELD: Hardened Sync Auth

Adds HMAC-SHA256 request signing with replay protection to the HTTP sync protocol. Gated by an `auth` options object — when absent, behavior is unchanged (full backward compatibility).

### Added

- **`SyncAuthService`** (`src/domain/services/SyncAuthService.js`): Core auth service with canonical payload construction, HMAC-SHA256 signing, verification with replay protection (nonce LRU cache), clock skew validation, key-id based key selection, and structured metrics.
- **`signSyncRequest()`** and **`canonicalizePath()`**: Exported helpers for client-side request signing and path canonicalization.
- **`serve({ auth })`**: Server-side auth configuration accepting `{ keys: Record<string, string>, mode: 'enforce' | 'log-only' }`. Creates a `SyncAuthService` instance internally.
- **`syncWith(url, { auth })`**: Client-side auth credentials accepting `{ secret: string, keyId?: string }`. Signs outgoing requests with HMAC-SHA256.
- **Auth headers**: `x-warp-sig-version`, `x-warp-key-id`, `x-warp-signature`, `x-warp-timestamp`, `x-warp-nonce` — 5 headers per signed request.
- **Canonical signed payload**: `warp-v1|KEY_ID|METHOD|PATH|TIMESTAMP|NONCE|CONTENT_TYPE|BODY_SHA256`.
- **Enforcement modes**: `enforce` (reject on failure) and `log-only` (warn but allow through) for gradual rollout.
- **Key-id based key selection**: Server accepts `keys: Record<string, string>` mapping key-id to secret, enabling zero-downtime key rotation and multi-tenant setups.
- **Auth metrics**: `authFailCount`, `replayRejectCount`, `nonceEvictions`, `clockSkewRejects`, `malformedRejects`, `logOnlyPassthroughs` via `getMetrics()`.
- **TypeScript types**: `SyncAuthServerOptions`, `SyncAuthClientOptions` interfaces in `index.d.ts`.
- **`SECURITY.md`**: Sync authentication section with threat model, restart semantics, key rotation guide, and configuration examples.
- **Unit tests**: `SyncAuthService.test.js` (42 tests) — canonical payload, path canonicalization, signing, verification reject/happy paths, metrics, constructor validation.
- **Integration tests**: `HttpSyncServer.auth.test.js` (15 tests) — enforce mode, log-only mode, backward compatibility, body-size ordering.
- **E2E tests**: `WarpGraph.syncAuth.test.js` (8 tests) — real HTTP with NodeHttpAdapter covering enforce, log-only, no-auth, wrong-secret, wrong-key-id, multi-key, and replay safety.

### Changed

- **`HttpSyncServer`**: Extracted `checkBodySize()` from `parseBody()` for DoS guard ordering (413 before auth). Added `_checkAuth()` private method and `initAuth()` factory for auth initialization.
- **`WarpGraph.syncWith()`**: Extracted `buildSyncAuthHeaders()` helper to stay within ESLint `max-lines-per-function` limit. Body string computed once and reused for both signing and `fetch()`.
- **M1.T1.SHIELD** marked `DONE` in `ROADMAP.md`.

## [10.5.0] — 2026-02-10 — SEEKDIFF: Structural Seek Diff

Shows _which_ nodes/edges were added/removed and _which_ properties changed (with old/new values) when stepping between ticks during seek exploration. Uses the existing `StateDiff.diffStates()` engine for deterministic, sorted output.

### Added

- **`--diff` flag** on `git warp seek`: Computes a structural diff between the previous cursor position and the new one. First seek uses baseline `"empty"` (everything appears as an addition); subsequent seeks use the previous cursor tick as baseline.
- **`--diff-limit=N` flag** on `git warp seek`: Caps the number of change entries in the structural diff (default 2000, minimum 1). When truncated, the payload includes `truncated: true`, `totalChanges`, and `shownChanges` metadata.
- **`WarpGraph.getStateSnapshot()`**: Returns a defensive copy of the current materialized `WarpStateV5` via `cloneStateV5()`. Returns null when no state is materialized (or auto-materializes when `autoMaterialize` is enabled). Prevents aliasing bugs when callers need to hold a reference across re-materializations.
- **ASCII structural diff section**: Colored `+` (green) / `-` (red) / `~` (yellow) lines in a `Changes (baseline: ...)` section, rendered in both plain text and `--view` (boxen) modes. Property changes show `old -> new` values.
- **JSON structural diff fields**: `structuralDiff`, `diffBaseline`, `baselineTick`, `truncated`, `totalChanges`, `shownChanges` added to the seek payload when `--diff` is active.
- **`formatStructuralDiff()`** export from `src/visualization/renderers/ascii/seek.js` for plain-text rendering.
- **SEEKDIFF milestone** (v10.5.0) added to `ROADMAP.md` and `scripts/roadmap.js` with 4 tasks (all closed).
- **Unit tests**: `WarpGraph.seekDiff.test.js` (8 tests) — state snapshot identity, defensive copy, forward/backward diff, first seek, same-tick no-op, property changes.
- **ASCII renderer tests**: 10 new tests — structural diff with tick/empty baselines, truncation message, null diff backward compat, removal entries, combined truncation, latest/load action payloads.
- **BATS E2E tests**: 9 new tests — `--diff --json` first seek, forward/backward structural diff, ASCII `Changes` section, `--latest --diff`, `--diff-limit` validation (=0, =-1, missing value), `--diff --save` rejection.

### Changed

- **`parseSeekArgs()`**: Extracted `parseSeekNamedAction()` helper for `--save`/`--load`/`--drop` parsing, reducing cyclomatic complexity. Now rejects `--diff` on non-navigating actions (`--save`, `--drop`, `--list`, `--clear-cache`, bare `status`).
- **`handleSeek()`**: Extracted `handleSeekStatus()` to stay within ESLint `max-lines-per-function` limit. `--diff` skips redundant re-materialization when `computeStructuralDiff` already materialized the target tick.
- **`computeStructuralDiff()`**: Short-circuits with an empty diff when `prevTick === currentTick`.
- **`buildSeekBodyLines()`**: Extracted `buildFooterLines()` for state summary + receipt + structural diff rendering.
- **`buildStructuralDiffLines()`**: Shows combined truncation message when both display-level (20 lines) and data-level (`--diff-limit`) truncation are active.
- **`--diff`/`--diff-limit`** added to `git warp --help` seek options.

## [10.4.2] — 2026-02-10 — TS policy enforcement (B3)

### Added

- **`scripts/ts-policy-check.js`**: Standalone policy checker that walks `src/`, `bin/`, `scripts/` and enforces two rules: (1) no `@ts-ignore` — use `@ts-expect-error` instead, (2) every inline `@type {*}` / `@type {any}` cast must carry a `// TODO(ts-cleanup): reason` tag.
- **`typecheck:policy` npm script**: Runs the policy checker (`node scripts/ts-policy-check.js`).
- **CI enforcement**: Policy check step added to both `ci.yml` (lint job) and `release-pr.yml` (preflight job), after the existing TypeScript step.
- **Pre-push hook**: Policy check runs in parallel with lint and typecheck.
- **BATS test timing**: `STARTING TEST` / `ENDED TEST` instrumentation in BATS helpers for diagnosing slow tests.

### Changed

- **Node.js >= 22.0.0**: Minimum engine bumped from 20 to 22, matching `@git-stunts/git-cas` requirement. CI matrix, release workflows, and documentation updated accordingly.
- **`@git-stunts/git-cas`**: Moved from `optionalDependencies` to `dependencies` now that Node 22 is the minimum.
- **Seek cache write is fire-and-forget**: `WarpGraph.materialize({ ceiling })` no longer awaits the persistent cache write — the CLI exits immediately after emitting output instead of blocking on background I/O (~30s → <1s for seek commands).
- **CLI uses `process.exit()`**: Ensures the process terminates promptly after emitting output, preventing fire-and-forget I/O from holding the event loop open.
- **Pre-push hook**: Removed BATS E2E tests (now CI-only) to keep pre-push fast.
- **`@ts-ignore` → `@ts-expect-error`** across 3 source files and 4 test files. `@ts-expect-error` is strictly better: it errors when the suppression becomes unnecessary.
- **~108 wildcard casts tagged** with `// TODO(ts-cleanup): reason` across ~30 source files in `src/`, `bin/`, and `scripts/`. Categorized reasons: `needs options type`, `type error`, `narrow port type`, `type patch array`, `type CLI payload`, `type http callback`, `type sync protocol`, `type lazy singleton`, `type observer cast`, and others.
- **`TYPESCRIPT_ZERO.md`**: B3 (Policy enforcement) marked complete.

## [10.4.1] — 2026-02-10 — Default crypto & join() fix

### Added

- **`defaultCrypto.js`** (`src/domain/utils/defaultCrypto.js`): Domain-local default crypto adapter wrapping `node:crypto` directly, following the `defaultCodec.js` / `defaultClock.js` pattern. Completes the BULKHEAD port injection pattern — all ports now have domain-local defaults.

### Fixed

- **`WarpGraph.join()`**: Replaced 4 references to non-existent `.elements.size` on ORSet with `orsetElements(...).length`. The `join()` happy path was always throwing a TypeError.

### Changed

- **`WarpGraph` constructor**: `this._crypto` now falls back to `defaultCrypto` when no crypto adapter is injected (same pattern as `this._codec = codec || defaultCodec`).
- **`BitmapIndexBuilder`**, **`StreamingBitmapIndexBuilder`**, **`BitmapIndexReader`**: Removed `if (!crypto) { return null; }` null guards from `computeChecksum`. Checksums are now always computed.
- **`BitmapIndexReader._validateShard`**: Removed `actualChecksum !== null &&` guard — checksum validation now always runs.
- **`StateSerializerV5.computeStateHashV5`**: Removed `crypto ? ... : null` ternary — always returns a hash string.

## [10.4.0] — 2026-02-09 — RECALL: Seek Materialization Cache

Caches materialized `WarpStateV5` at each visited ceiling tick as content-addressed blobs via `@git-stunts/git-cas`, enabling near-instant restoration for previously-visited ticks during seek exploration. Blobs are loose Git objects subject to Git GC (default prune expiry ~2 weeks, configurable) unless pinned to a vault.

### Added

- **`SeekCachePort`** (`src/ports/SeekCachePort.js`): Abstract port for seek materialization cache with `get`, `set`, `has`, `keys`, `delete`, `clear` methods.
- **`CasSeekCacheAdapter`** (`src/infrastructure/adapters/CasSeekCacheAdapter.js`): Git-CAS backed adapter with rich index metadata (treeOid, createdAt, ceiling, frontierHash, sizeBytes, codec, schemaVersion), LRU eviction (default max 200 entries), self-healing on read miss (removes dead entries when blobs are GC'd), and retry loop for transient write failures. **Requires Node >= 22.0.0** (inherited from `@git-stunts/git-cas`).
- **`seekCacheKey`** (`src/domain/utils/seekCacheKey.js`): Deterministic cache key builder producing `v1:t<ceiling>-<sha256hex>` keys. Uses SHA-256 via `node:crypto` with no fallback.
- **`buildSeekCacheRef`** in `RefLayout.js`: Builds `refs/warp/<graph>/seek-cache` ref path for the cache index.
- **`WarpGraph.open({ seekCache })`** / **`graph.setSeekCache(cache)`**: Optional `SeekCachePort` for persistent seek cache injection. Cache is checked after in-memory miss and stored after full materialization in `_materializeWithCeiling`.
- **`--clear-cache` flag** on `git warp seek`: Purges the persistent seek cache.
- **`--no-persistent-cache` flag** on `git warp seek`: Bypasses persistent cache for a single invocation (useful for full provenance access or performance testing).
- **Provenance degradation guardrails**: `_provenanceDegraded` flag on WarpGraph, set on persistent cache hit. `patchesFor()` and `materializeSlice()` throw `E_PROVENANCE_DEGRADED` with clear instructions to re-seek with `--no-persistent-cache`.
- **`SeekCachePort` export** from main entry point (`index.js`) and TypeScript definitions (`index.d.ts`).
- **Unit tests** (`test/unit/domain/seekCache.test.js`, 16 tests): Cache key determinism, WarpGraph integration with mock cache (hit/miss/error/degradation), provenance guardrails.
- **ROADMAP milestone RECALL** (v10.4.0): 6 tasks, all closed.

## [10.3.2] — 2026-02-09 — Seek CLI fixes & demo portability

### Added

- **`--save=NAME`, `--load=NAME`, `--drop=NAME` equals form**: `parseSeekArgs` now accepts `=`-separated values for `--save`, `--load`, and `--drop`, matching the existing `--tick=VALUE` form.

### Fixed

- **BATS CI: missing `append-patch.js` helper**: `test/bats/helpers/append-patch.js` was untracked, so Docker builds (which copy from the git context) never included it — causing test 55 to fail with `MODULE_NOT_FOUND` on Node 20.
- **`seek-demo.tape` not portable**: Replaced hardcoded `$HOME/git/git-stunts/git-warp` with `export PROJECT_ROOT=$(pwd)` captured before entering the temp sandbox.
- **`emitCursorWarning` / `applyCursorCeiling` JSDoc**: Clarified that non-seek commands intentionally pass `null` for `maxTick` to skip the cost of `discoverTicks()`.
- **`_resolveCeiling` treated `undefined` as valid**: The `'ceiling' in options` check returned `undefined` when options contained the key but no value. Switched to `options.ceiling !== undefined` so explicit `null` still overrides the instance ceiling but `undefined` correctly falls through.

## [10.3.1] — 2026-02-09 — Seek polish, arrowheads & demo GIF

### Added

- **Seek demo GIF** (`docs/seek-demo.gif`): Animated walkthrough showing `git warp seek` time-travel — graph topology visually changes at each tick while `git status` proves the worktree is untouched. VHS tape at `docs/seek-demo.tape`.
- **README seek demo**: Embedded `seek-demo.gif` in the CLI section below the seek command examples.
- **ROADMAP backlog**: New `## Backlog` section with two future ideas — structural seek diff (`diffStates()`) and git-cas materialization cache.
- **Op summary renderer** (`src/visualization/renderers/ascii/opSummary.js`): Extracted operation summary formatting from history renderer into a shared module used by both history and seek views.

### Fixed

- **ASCII graph arrowheads missing**: `drawArrowhead` was silently dropping arrows when the ELK endpoint fell inside a node's bounding box. Now steps back one cell to place the arrowhead just outside the node border.
- **Seek ASCII renderer**: Reworked swimlane dashboard with improved windowing, writer rows, tick receipt display, and op summary formatting.
- **Seek ceiling via public API**: Replaced direct `graph._seekCeiling` mutation in `materializeOneGraph` and `handleSeek` with `graph.materialize({ ceiling })`, using the public option instead of poking at internals.
- **Seek timeline missing currentTick**: When the active cursor referenced a tick absent from the discovered ticks array, the renderer fell back to index 0 and never showed the current tick marker. Now inserts the cursor tick at the correct sorted position so the window always centres on it.
- **Docs `--tick` signed-value syntax**: Updated GUIDE.md, README.md, and CHANGELOG examples to use `--tick=+N`/`--tick=-N` (equals form) for signed relative values, matching BATS tests and avoiding CLI parser ambiguity.
- **Ceiling cache stale on frontier advance**: `_materializeWithCeiling` cached state keyed only on ceiling + dirty flag, so it could return stale results when new writers appeared or tips advanced. Now snapshots the frontier (writer tip SHAs) alongside the ceiling and invalidates the cache when the frontier changes.
- **`resolveTickValue` duplicate tick 0**: The relative-tick resolver blindly prepended 0 to the ticks array, duplicating it when ticks already contained 0. Now checks before prepending.

### Changed

- **History renderer**: Extracted `summarizeOps` and `formatOpSummary` into shared modules, reducing duplication between history and seek views.

## [10.3.0] — 2026-02-09 — Time Travel (`git warp seek`)

Adds cursor-based time travel for exploring graph history. Navigate to any Lamport tick, save/load named bookmarks, and see materialized state at any point in time. Existing commands (`info`, `materialize`, `history`, `query`) respect the active cursor.

### Added

- **`git warp seek` command**: Step through graph history by Lamport tick.
  - `seek --tick N` — position cursor at absolute tick N.
  - `seek --tick=+N` / `seek --tick=-N` — step forward/backward relative to current position.
  - `seek --latest` — clear cursor and return to the present (latest state).
  - `seek --save NAME` / `seek --load NAME` — save and restore named cursor bookmarks.
  - `seek --list` — list all saved cursors.
  - `seek --drop NAME` — delete a saved cursor.
  - `seek` (bare) — show current cursor status.
- **`WarpGraph.discoverTicks()`**: Walks all writer patch chains reading only commit messages (no blob deserialization) to extract sorted Lamport timestamps and per-writer tick breakdowns.
- **`materialize({ ceiling })` option**: Replays only patches with `lamport <= ceiling`, enabling time-travel materialization. Skips auto-checkpoint when ceiling is active to avoid writing snapshots of past state.
- **Cursor persistence via refs**: Active cursor stored at `refs/warp/<graph>/cursor/active`, saved cursors at `refs/warp/<graph>/cursor/saved/<name>`. All data stored as JSON blobs.
- **ASCII seek renderer** (`src/visualization/renderers/ascii/seek.js`): Dashboard view with timeline visualization, writer inclusion status, and graph stats at the selected tick. Activated via `--view`.
- **Cursor-aware existing commands**: `info` shows active cursor in summary; `materialize` skips checkpointing when a cursor is active; `history` filters patches to the selected tick; `query` materializes at the cursor ceiling.
- **BATS CLI tests** (`test/bats/cli-seek.bats`, 10 tests): End-to-end integration tests for all seek operations.
- **Domain unit tests** (`test/unit/domain/WarpGraph.seek.test.js`, 12 tests): `discoverTicks()`, `materialize({ ceiling })`, ceiling caching, multi-writer ceiling, `_seekCeiling` instance state.
- **Renderer unit tests** (`test/unit/visualization/ascii-seek-renderer.test.js`, 7 tests): Timeline rendering, writer rows, dashboard layout.

### Changed

- **`RefLayout`**: New helpers `buildCursorActiveRef()`, `buildCursorSavedRef()`, `buildCursorSavedPrefix()` for cursor ref path construction.

### Fixed

- **Cursor blob validation**: Added `parseCursorBlob()` utility that validates JSON structure and numeric tick before use. `readActiveCursor`, `readSavedCursor`, and `listSavedCursors` now throw descriptive errors on corrupted cursor data instead of crashing.
- **GUIDE.md**: Added `--view seek` to the supported commands table.
- **CHANGELOG**: Fixed `RefLayout` helper names to match exported API (`buildCursorActiveRef`, not `buildCursorRef`).
- **`_materializeWithCeiling` cache**: Cache fast-path no longer returns empty `receipts: []` when `collectReceipts` is true; falls through to full materialization to produce real receipts.
- **`_resolveCeiling` null override**: `materialize({ ceiling: null })` now correctly clears `_seekCeiling` and materializes latest state, instead of ignoring the explicit null.
- **Seek timeline duplicate 0**: `buildSeekTimeline` no longer prepends tick 0 when `ticks` already contains it, preventing a duplicate dot in the timeline.
- **Seek timeline label drift**: Tick labels now stay vertically aligned under their dots for multi-digit tick values by computing target column positions instead of using fixed-width padding.
- **RefLayout docstring**: Added `cursor/active` and `cursor/saved/<name>` to the module-level ref layout listing.
- **BATS seek tests**: Use `--tick=+1` / `--tick=-1` syntax instead of `--tick +1` / `--tick -1` to avoid parser ambiguity with signed numbers.

### Tests

- Suite total: 2938 tests across 147 vitest files + 66 BATS CLI tests (up from 2883/142 + 56).
- New seek tests: 23 unit (14 domain + 9 renderer) + 10 BATS CLI = 33 total.
- New parseCursorBlob unit tests: 11 tests covering valid parsing, corrupted JSON, missing/invalid tick.

## [10.2.1] — 2026-02-09 — Compact ASCII graphs & hero GIF

### Changed

- **Compact ASCII node rendering**: Nodes are now 3 rows (border + label + border) instead of variable-height boxes, producing much denser graph output.
- **Tighter ELK layout spacing**: `nodeNode` reduced from 40→30, `betweenLayers` from 60→40, `NODE_HEIGHT` from 40→30 across all layout presets.
- **ASCII cell scaling**: `CELL_W` changed from 8→10 and `CELL_H` from 4→10 for better proportions with compact nodes.
- **Hero GIF revamp**: New Catppuccin Mocha theme, 6 scenes (empty log, info, query, path, warp refs, commit DAG), wider terminal (960×520).
- **README hero GIF**: Embedded `hero.gif` at the top of `README.md`.

## [10.2.0] — 2026-02-09 — Multi-runtime test matrix

Adds a Dockerized multi-runtime test suite across Node 20, Node 22, Bun, and Deno. Fixes the `materialize` CLI command crashing when creating checkpoints. Expands end-to-end coverage from 8 BATS tests and 7 integration tests to 56 BATS tests and 54 integration tests.

### Added

- **Multi-runtime Docker test matrix**: Four Dockerfiles (`docker/Dockerfile.{node20,node22,bun,deno}`) and a `docker-compose.test.yml` with profile-based orchestration. Unit + integration + BATS on Node 20/22; API integration on Bun and Deno. Run `npm run test:matrix` for all runtimes in parallel, or target individual runtimes via `npm run test:node20`, `test:node22`, `test:bun`, `test:deno`.
- **API integration test suite** (`test/integration/api/`, 10 files, 47 tests): Exercises the full programmatic API against real Git repos — lifecycle, multi-writer CRDT merge, query builder, traversals (BFS/DFS/shortest-path), checkpoints, tombstone GC, fork, edge cases (unicode IDs, self-edges, large properties), writer discovery, and sync.
- **Deno test wrappers** (`test/runtime/deno/`, 7 files): Standalone `Deno.test()` wrappers using `assertEquals`/`assert` from `std/assert`, covering lifecycle, multi-writer, query, traversal, checkpoint, edge cases, and tombstones. Uses `WebCryptoAdapter` for runtime-agnostic crypto.
- **Expanded BATS CLI tests** (`test/bats/`, 9 new files, 48 new tests): `cli-info`, `cli-query`, `cli-path`, `cli-history`, `cli-check`, `cli-materialize`, `cli-view-modes`, `cli-errors`, `cli-multiwriter`. Shared helpers extracted to `test/bats/helpers/setup.bash` with reusable seed scripts (`seed-graph.js`, `seed-multiwriter.js`, `seed-rich.js`).
- **Runtime-agnostic test helper** (`test/integration/api/helpers/setup.js`): Creates temp Git repos with `WebCryptoAdapter` pre-configured; works on Node, Bun, and Deno.
- **npm scripts**: `test:node20`, `test:node22`, `test:bun`, `test:deno`, `test:matrix`.

### Fixed

- **`materialize` CLI crash**: `WarpGraph.open()` calls in `openGraph()`, `materializeOneGraph()`, and the info handler's writer-patch lookup were missing the `crypto` option, causing `createCheckpoint()` to fail with "Invalid stateHash: expected string, got object". Now passes `NodeCryptoAdapter` in all three call sites.
- **`--graph nonexistent` silently succeeds**: `openGraph()` now validates that the specified graph exists before opening it, returning a proper `E_NOT_FOUND` error.
- **`--view html:FILE` not writing file**: The `html:FILE` view mode was accepted by the parser but never handled in `emit()`. Now wraps rendered SVG in an HTML document and writes it to the specified path (query and path commands).
- **BATS test key mismatch**: Materialize tests referenced `data["results"]` but the CLI outputs `data["graphs"]`. Fixed in `cli-materialize.bats` and `cli-multiwriter.bats`.
- **BATS path-not-found exit code**: `path not found` test expected exit 0, but the CLI intentionally returns exit 2 (`NOT_FOUND`). Fixed assertion in `cli-path.bats`.

### Changed

- **CI matrix strategy**: `.github/workflows/ci.yml` replaced the single Node 22 test job with a matrix strategy (`test-node` on Node 20+22, `test-bun`, `test-deno`), all using `docker-compose.test.yml`.
- **Extract `writeHtmlExport` helper**: Deduplicated the HTML wrapper template in `emit()` (query and path branches) into a shared `writeHtmlExport()` function.
- **Docker images run as non-root**: All four test images (`node20`, `node22`, `bun`, `deno`) now run tests as a non-root user to mirror CI environments and catch permission issues early.
- **Docker `--no-install-recommends`**: All Dockerfiles use `--no-install-recommends` to reduce image size and build time.
- **Pin Deno base image**: `Dockerfile.deno` now uses `denoland/deno:2.1.9` instead of `latest` for reproducible builds (the short `2.1` tag does not exist on Docker Hub).
- **Add `--build` to individual runtime scripts**: `test:node20`, `test:node22`, `test:bun`, `test:deno` now include `--build` so Dockerfile changes are always picked up.
- **Extract shared BATS seed setup**: Duplicated boilerplate (project root resolution, dynamic imports, persistence creation) extracted to `test/bats/helpers/seed-setup.js`.
- **Remove redundant CI Node.js setup**: `test-node` job no longer installs Node/npm on the host — tests run entirely in Docker, saving ~30-60s per matrix entry.
- **Fix `opts` spread order in test helpers**: Spread `...opts` before explicit params so callers cannot accidentally override `persistence`, `graphName`, `writerId`, or `crypto`.
- **Guard `cd` commands in BATS setup**: Added `|| return 1` to all `cd` calls in `setup.bash` to fail fast per ShellCheck SC2164.
- **Pin Bun base image**: `Dockerfile.bun` now uses `oven/bun:1.2-slim` instead of `latest` for reproducible builds.
- **Explicit `--view ascii` in BATS tests**: All `--view` invocations now pass the `ascii` mode explicitly rather than relying on the implicit default when the next token is a known command. Applied across `cli-check.bats`, `cli-query.bats`, and `cli-view-modes.bats`.
- **BATS multiwriter materialize**: Added missing `--graph demo` flag to the materialize test.
- **BATS info temp dir cleanup**: Empty-repo test now uses `trap ... RETURN` to clean up temp directory on assertion failure.
- **BATS seed scripts include crypto**: All `WarpGraph.open()` calls in seed scripts now pass `NodeCryptoAdapter` via the shared `seed-setup.js` module, matching the CLI and preventing `createCheckpoint()` crashes.
- **Stricter HTML export BATS test**: `--view html:FILE` test now asserts `<!DOCTYPE` and `<html` instead of falling back to `<svg`, ensuring raw SVG cannot pass as valid HTML output.
- **Deno Docker cache permissions**: `Dockerfile.deno` now chowns `/deno-dir` (Deno's global cache) to the `deno` user, fixing `Permission denied` errors when Deno fetches npm packages at runtime.

### Docs

- **JSDoc on changed/new functions**: Added missing JSDoc to `getGraphInfo`, `openGraph`, `writeHtmlExport`, `emit`, `materializeOneGraph` in `bin/warp-graph.js` and inner `openGraph` in `test/integration/api/helpers/setup.js`.

### Tests

- Suite total: 2883 tests across 142 vitest files + 56 BATS CLI tests (up from 2828/131 + 8).
- New API integration tests: 48 (lifecycle 6, multiwriter 4, querybuilder 7, traversal 7, checkpoint 3, tombstone-gc 4, fork 2, edge-cases 6, writer-discovery 5, sync 4).
- New BATS CLI tests: 48 (info 5, query 8, path 5, history 3, check 5, materialize 4, view-modes 7, errors 6, multiwriter 5).
- Deno integration tests: 18 (lifecycle 3, multiwriter 2, querybuilder 3, traversal 3, checkpoint 2, edge-cases 3, tombstone 2).

## [10.1.2] — 2026-02-08 — First public release

First publication to npm and JSR. Adds dual-registry CI/CD release system, broken link checking, and JSR compatibility fixes.

### Added

- **Dual-publish release workflow**: Tag-triggered CI pipeline (`release.yml`) that verifies metadata, publishes to npm and JSR in parallel via OIDC trusted publishing (no tokens), and creates a GitHub Release with auto-generated notes. Includes prerelease lane support (`rc`→`next`, `beta`→`beta`, `alpha`→`alpha` dist-tags).
- **Release preflight workflow**: `release-pr.yml` runs on every PR to main — lint, test, dry-run pack + JSR publish, and posts a predicted dist-tag comment.
- **Tag guard workflow**: `tag-guard.yml` rejects malformed non-semver tags before they trigger anything.
- **Reusable retry composite action**: `.github/actions/retry/action.yml` with linear backoff for registry publishes.
- **Broken link checker (lychee)**: `.lychee.toml` config for offline local-link validation; `.github/workflows/links.yml` CI workflow on markdown changes; `lint:links` npm script; pre-push hook runs lychee (graceful skip if not installed).
- **Release runbook**: `docs/release.md` with first-time OIDC setup steps and dist-tag mapping table.
- **`test:watch` and `test:coverage`** npm scripts.
- **JSR module docs**: `@module` JSDoc on all three jsr.json entrypoints (`.`, `./node`, `./visualization`).
- **JSR type declarations**: `@ts-self-types` directives on all entrypoints; new `GraphNode.d.ts` and `src/visualization/index.d.ts` for full "no slow types" compliance.

### Fixed

- **`no-misused-promises` lint errors**: `WarpGraph.js` polling `setInterval` and `NodeHttpAdapter.js` `createServer` callback now properly handle async returns via `.catch()` chains.
- **JSR `strip-ansi` module resolution**: Inlined the ANSI regex from `ansi-regex@6`/`strip-ansi@7` into `src/visualization/utils/ansi.js` — eliminates undeclared transitive dependency that JSR's module graph builder could not resolve.
- **Script recursion in Docker**: `test` and `benchmark` npm scripts now call `test:local`/`benchmark:local` inside Docker instead of recursing into themselves.
- **`postinstall` consumer failure**: Replaced with `prepare` (only runs in dev + before pack/publish) so consumers don't need `patch-package` or the `patches/` directory.

### Changed

- **package.json hardened for npm publish**: sharpened description, expanded keywords, added `sideEffects: false`, `publishConfig.access: "public"`, `packageManager: "npm@10"`, explicit `"import"` entries in exports, `"./package.json"` export, `prepack` quality gate (lint + test:local).
- **`patch-package` moved to devDependencies**: Build-time tool, not needed by consumers.
- **`@types/node` added to devDependencies**.
- **Removed `typesVersions`**: Redundant with `"types"` in export map (TS 4.7+).
- **CI triggers on version tags**: `ci.yml` now runs the full suite (Docker tests + BATS CLI) on `v*` tag pushes so the release workflow can gate on CI completion.

### Tests

- Suite total: 2828 tests across 131 files (unchanged).

## [10.1.1] — 2026-02-08 — BULKHEAD (cont.)

### Documentation

- **JSDoc audit across domain services**: Added missing `@param` tags for `codec` and `crypto` options in `BitmapIndexBuilder`, `BitmapIndexReader`, `CheckpointService`, `WarpGraph` constructor and `open()`. Documented `BlobValue` op type in `JoinReducer.applyOpV2`. Documented `shortestPath` failure return and `connectedComponent.maxDepth` in `LogicalTraversal`. Typed `getCurrentState` and `onCommitSuccess` callbacks in `Writer`.
- **JSDoc for visualization layer**: Added JSDoc to all undocumented exports in `renderers/ascii/` (`createBox`, `progressBar`, `createTable`) and `utils/` (`stripAnsi`, `timeAgo`, `formatDuration`, `truncate`, `padRight`, `padLeft`, `center`).
- **`WarpGraph.js` JSDoc fixes**: Added `@param httpPort` and `@throws` to `serve()`. Added 2 missing `@throws` codes to `fork()`. Fixed `TickReceipt` import path (`../types/` → `./types/`).
- **`index.d.ts` critical fixes**: Fixed 6 methods incorrectly declared as synchronous (`getNodes`, `getEdges`, `getNodeProps`, `getEdgeProps`, `hasNode`, `neighbors` — all return `Promise`). Removed nonexistent `getVersionVector()`. Added missing params to `open()` (`onDeleteWithData`, `clock`, `crypto`, `codec`), `serve()` (`httpPort`), and `BitmapIndexReader` (`crypto`). Added `maxDepth` to `connectedComponent` options.
- **`index.d.ts` completeness**: Added 18 missing public `WarpGraph` method declarations (`writer()`, `subscribe()`, `watch()`, `status()`, `syncCoverage()`, `createSyncRequest()`, `processSyncRequest()`, `applySyncResponse()`, `syncNeeded()`, `maybeRunGC()`, `runGC()`, `getGCMetrics()`, `join()`, `createWriter()`, getters for `persistence`, `onDeleteWithData`, `gcPolicy`, `temporal`). Added supporting type declarations (`StateDiffResult`, `Writer`, `PatchSession`, `WriterError`, GC types, sync protocol types, `TemporalQuery`, `TemporalNodeSnapshot`). Added 9 missing runtime export declarations (`createNodeAdd`, `createNodeTombstone`, `createEdgeAdd`, `createEdgeTombstone`, `createPropSet`, `createInlineValue`, `createBlobValue`, `createEventId`, `migrateV4toV5`) with supporting op/value types.

### Fixed

- **`NodeCryptoAdapter.hash()` / `hmac()` now use `async`**: Previously used `Promise.resolve()` wrapping, which let synchronous throws (e.g. unsupported algorithm) escape as uncaught exceptions instead of rejected promises. Now properly `async` so all errors become rejections.
- **`index.d.ts` HttpServerPort type declarations**: `listen()`, `close()`, and `address()` signatures now match the actual callback-based implementation. Previously declared a Promise-based options-object API that no adapter implemented.
- **`PatchBuilderV2` silent catch now logs**: The empty `catch {}` around `onCommitSuccess` now captures the error and logs it via `this._logger.warn()` with the commit SHA, aiding debugging when eager re-materialize fails. Accepts optional `logger` constructor param (defaults to `nullLogger`).
- **`DenoHttpAdapter.addressImpl()` type guard**: `state.server.addr` is now guarded against non-`NetAddr` types (`UnixAddr`, `VsockAddr`) by checking `addr.transport` before destructuring `hostname`/`port`. Returns `null` for non-TCP/UDP addresses.
- **`DenoHttpAdapter` / `BunHttpAdapter` streaming body size limit**: Both adapters now enforce `MAX_BODY_BYTES` (10 MB) via `request.body.getReader()` streaming instead of `request.arrayBuffer()`. This prevents memory exhaustion from chunked requests without `Content-Length` — the reader aborts after 10 MB instead of buffering the entire payload. Also pre-checks `Content-Length` header when present.
- **`NodeHttpAdapter` destroys request on 413**: After responding with 413 Payload Too Large, `req.destroy()` is now called to tear down the socket and stop buffering the remaining payload.
- **`BoundaryTransitionRecord` `hexToUint8Array` validation**: Now throws `RangeError` on odd-length, non-string, or invalid hex character input (e.g. `'GG'`). Previously, `parseInt('GG', 16)` returned `NaN` which silently coerced to `0` in the `Uint8Array`, allowing malformed authentication tags. `verifyBTR` now catches the `RangeError` and returns `{valid: false, reason: 'Invalid hex ...'}` instead of the misleading "Authentication tag mismatch".
- **`index.d.ts` `computeStateHashV5` signature**: `options` and `crypto` are now optional, matching the implementation which defaults to `{}` and returns `null` when crypto is absent.
- **`index.d.ts` `replayBTR` signature**: Added missing second `options?: { crypto?: CryptoPort; codec?: unknown }` parameter, matching the implementation.
- **`BoundaryTransitionRecord` JSDoc types**: Updated 7 `@param`/`@returns`/`@property` annotations from `Buffer` to `Uint8Array` to accurately reflect cross-runtime support via `WebCryptoAdapter`.
- **`index.d.ts` BTR type declarations**: `BTR.U_0`, `serializeBTR` return type, and `deserializeBTR` parameter type changed from `Buffer` to `Uint8Array`, matching the cross-runtime implementation.
- **`DenoHttpAdapter.closeImpl()` shutdown error handling**: `state.server` is now nullified in the rejection path, preventing stale references after a failed shutdown. Also prevents unhandled promise rejection when `close()` is called without a callback.
- **`ReducerV5.benchmark.js` stale comment**: Removed reference to hard CI limits that were previously removed.
- **`WarpStateIndexBuilder` JSDoc examples**: Added missing `await` to `builder.serialize()` and `buildWarpStateIndex()` examples, which became async in v10.1.0.
- **`WarpGraph.fork()` now propagates `crypto` and `codec`**: Previously, forked graphs lost the parent's `crypto` and `codec` options, causing `computeStateHashV5` to return `null` and dropping custom codecs. Now forwards both to `WarpGraph.open()`.
- **`DenoHttpAdapter.listen()` re-throws on bind failure without callback**: Previously, if `Deno.serve()` threw and no callback was provided, the error was silently swallowed. Now re-throws so callers are informed of bind failures.
- **`formatDuration()` input validation**: Now returns `'unknown'` for non-numeric, `NaN`, and negative inputs (consistent with `timeAgo`). Also added hour-level formatting for durations >= 60 minutes.
- **`box.js` removed redundant default export**: `export default { createBox }` wrapped the named export in an object; all consumers use the named import. Removed to avoid confusion.
- **`index.d.ts` HTTP adapter logger type**: `BunHttpAdapter` and `DenoHttpAdapter` constructor `logger.error` now accepts variadic `...args: unknown[]`, matching the implementation which calls `logger.error(msg, err)`.
- **`DenoHttpAdapter.listenImpl()` simplified**: Removed unnecessary intermediate closure — logic is now inlined at the call site.
- **`BunHttpAdapter` `ERROR_BODY_LENGTH`**: Now derived from `TextEncoder().encode().byteLength` instead of `String.length`, correctly measuring bytes rather than UTF-16 code units.

### Tests

- Benchmark consistency: All `runBenchmark()` calls in `Compaction.benchmark.js` and `ReducerV5.benchmark.js` now pass `WARMUP_RUNS` and `MEASURED_RUNS` explicitly instead of relying on matching defaults.
- `createMockClock`: `timestamp()` now captures-then-advances (like `now()`) instead of reading the already-advanced time. Prevents silent disagreement when both methods are called to represent the same instant.
- `createMockClock.test.js`: New test file validating `now()`/`timestamp()` consistency and independent clock advancement.
- `createGitRepo`: Temp directory is now cleaned up in a `catch` block if git init or config fails, preventing CI temp dir accumulation.
- `setupGraphState`: Added coupling comment documenting reliance on `WarpGraph._cachedState` internal field.
- `BunHttpAdapter` `startServer` JSDoc: Added note about `Bun.serve()` synchronous callback timing differing from Node's async `server.listen`.
- `WarpGraph.forkCryptoCodec.test.js`: New test file validating that `fork()` propagates `crypto` and `codec` to forked graphs (3 tests).
- `DenoHttpAdapter.test.js`: Added tests for listen throw-without-callback, close rejection without callback, and state.server nullification on shutdown error (3 new tests).
- `visualization-utils.test.js`: Added tests for `formatDuration` edge cases: `NaN`, negative, non-numeric, and hour-level formatting (5 new tests).
- Suite total: 2828 tests across 131 files.

## [10.1.0] — 2026-02-06 — BULKHEAD (cont.)

### Breaking Changes

- **`CryptoPort.hash()` and `CryptoPort.hmac()` are now async**: Both methods now return `Promise<string>` and `Promise<Buffer|Uint8Array>` respectively, enabling Web Crypto API support across browsers, Deno, and Bun. All domain callers updated to `await`. If you have a custom `CryptoPort` implementation, update `hash()` and `hmac()` to return Promises (or mark them `async`).
- **Functions that were synchronous are now async**: `computeStateHashV5()`, `BitmapIndexBuilder.serialize()`, `WarpStateIndexBuilder.serialize()`, `buildWarpStateIndex()`, `createBTR()`, `verifyBTR()`, `replayBTR()`. All return Promises and must be `await`ed.

### Added

- **`WebCryptoAdapter`**: New `CryptoPort` implementation using the standard Web Crypto API (`globalThis.crypto.subtle`). Works in browsers, Deno, Bun, and Node.js 20+. Includes XOR-based constant-time comparison for environments without `crypto.timingSafeEqual`.
- **`BunHttpAdapter`**: New `HttpServerPort` implementation using `Bun.serve()`. Bridges between Bun's `Request`/`Response` API and the port's plain-object contract. Includes error handling with 500 responses.
- **`DenoHttpAdapter`**: New `HttpServerPort` implementation using `Deno.serve()`. Same bridging pattern as `BunHttpAdapter`, with graceful shutdown support.
- **`CommitPort.commitNodeWithTree()`**: New method for creating commits pointing to a specified tree (used by `CheckpointService` and `PatchBuilderV2`).
- **`CommitPort.nodeExists()`**: New method for checking whether a commit exists.
- **`RefPort.listRefs()`**: New method for listing refs matching a prefix.

### Refactored

- **Port composition via prototype mixin**: `GraphPersistencePort` and `IndexStoragePort` are now composed from their focused ports (`CommitPort`, `BlobPort`, `TreePort`, `RefPort`, `ConfigPort`) via prototype descriptor copying, replacing ~300 lines of duplicated method stubs. Collision detection prevents silent shadowing. `GraphPersistencePort` remains the backward-compatible composite — existing `GitGraphAdapter` implementations require no changes.
- **`NodeHttpAdapter` error handling**: Extracted `dispatch()` helper that wraps request handling in try/catch and returns 500 on unhandled errors, preventing silent connection hangs.
- **Test DRY refactoring**: 22 test files migrated to shared helpers from `test/helpers/warpGraphTestUtils.js` (`createMockPersistence`, `createMockLogger`, `createMockClock`, `createGitRepo`, `addNodeToState`, `addEdgeToState`, `setupGraphState`). New `test/benchmark/benchmarkUtils.js` consolidates benchmark utilities (`TestClock`, `median`, `forceGC`, `logEnvironment`, `randomHex`, `runBenchmark`). Net reduction of ~400 lines across test files.

### Tests

- Added `GraphPersistencePort.test.js` — validates prototype mixin composition, collision detection, and focused port coverage
- Updated `CryptoPort.test.js` for async `hash()`/`hmac()` semantics
- Suite total: 2837 tests across 132 files

## [10.0.0] — BULKHEAD

### Added

#### BULKHEAD — Hexagonal Architecture Hardening (v10.0.0)

Architectural hardening milestone that eliminates all hexagonal boundary violations — domain code no longer imports from Node.js built-ins or concrete infrastructure adapters. This unblocks multi-runtime publishing (JSR/Deno/Bun).

- **Port injection for codec** (`BK/WIRE/2`): All domain services now accept `codec` via dependency injection instead of importing `CborCodec` directly. Domain-local `defaultCodec.js` provides a fallback using `cbor-x` directly. Pattern: `this._codec = codec || defaultCodec`.
- **Port injection for crypto** (`BK/WIRE/1`): All domain services now accept `crypto` via `CryptoPort` instead of importing `node:crypto`. Graceful degradation: `computeChecksum()` and `computeStateHashV5()` return `null` when no crypto adapter is provided.
- **Hex boundary violations eliminated** (`BK/WIRE/3`): Zero imports from `node:crypto`, `node:http`, `node:module`, `node:path`, `node:url`, or `perf_hooks` in `src/domain/`. All infrastructure access goes through injected ports.
- **Consolidated clock adapter** (`BK/DRY/2`): Merged `PerformanceClockAdapter` and `GlobalClockAdapter` into single `ClockAdapter` with constructor DI and factory statics (`ClockAdapter.node()`, `ClockAdapter.global()`). Old adapter files are now re-export shims marked `@deprecated`.
- **Five focused persistence ports** (`BK/SRP/4`): Split `GraphPersistencePort` (14+ methods) into `CommitPort`, `BlobPort`, `TreePort`, `RefPort`, and `ConfigPort`. `GraphPersistencePort` remains as backward-compatible composite. Domain services document their minimal port surface via JSDoc.
- **`CodecPort` interface** (`BK/PORT/1`): New abstract port for encode/decode operations.
- **`CryptoPort` interface** (`BK/PORT/2`): New abstract port for hash/HMAC operations.
- **`HttpServerPort` interface** (`BK/PORT/3`): New abstract port for HTTP server operations.
- **`NodeCryptoAdapter`**: Infrastructure adapter implementing `CryptoPort` using `node:crypto`.
- **`NodeHttpAdapter`**: Infrastructure adapter implementing `HttpServerPort` using `node:http`.
- **`defaultCodec.js`**: Domain-local CBOR codec using `cbor-x` directly (no infrastructure import).
- **`defaultClock.js`**: Domain-local clock using `globalThis.performance`.
- **`nullLogger.js`**: Domain-local no-op `LoggerPort` for silent defaults.
- **Domain service decomposition** (`BK/SRP/1-3`): `WarpMessageCodec` split into focused sub-codecs (`AnchorMessageCodec`, `CheckpointMessageCodec`, `PatchMessageCodec`, `MessageCodecInternal`, `MessageSchemaDetector`). `CommitDagTraversalService` split into `DagTraversal`, `DagTopology`, `DagPathFinding`. `HttpSyncServer` extracted from `SyncProtocol`.
- **`KeyCodec`** (`BK/SRP/2`): Extracted key encoding/decoding from `JoinReducer` into standalone service.
- **Error hierarchy** (`BK/ERR/1`): All domain errors now extend `WarpError` base class. New `WriterError` for writer-specific failures.

### Tests

- Added port contract tests: `CodecPort.test.js`, `CryptoPort.test.js`, `HttpServerPort.test.js`, `CommitPort.test.js`, `BlobPort.test.js`, `TreePort.test.js`, `RefPort.test.js`, `ConfigPort.test.js`
- Added `WarpError.test.js`, `WriterError.test.js`, `KeyCodec.test.js`, `HttpSyncServer.test.js`
- Added shared ASCII renderer test: `ascii-shared.test.js`
- Updated all existing test files to inject `NodeCryptoAdapter` where crypto is needed
- Suite total: 2725 tests across 126 files

## [9.0.0] — ECHO

### Added

#### ECHO — Observer Geometry (v9.0.0)

Implements [Paper IV](https://doi.org/10.5281/zenodo.18038297) (Echo and the WARP Core) from the AION Foundations Series: observer-scoped views, temporal queries, and translation cost estimation.

- **Observer-scoped views** (`EC/VIEW/1`): New `graph.observer(name, config)` returns a read-only `ObserverView` projecting the materialized graph through an observer lens. Config accepts `match` (glob pattern for visible nodes), `expose` (property key whitelist), and `redact` (property key blacklist — takes precedence over expose). The view supports the full query/traverse API: `hasNode()`, `getNodes()`, `getNodeProps()`, `getEdges()`, `query()`, and `traverse.*` (BFS, DFS, shortestPath). Edges are only visible when both endpoints pass the match filter. Requires materialized state.
- **Temporal query operators** (`EC/TEMPORAL/1`): New `graph.temporal.always(nodeId, predicate, { since })` and `graph.temporal.eventually(nodeId, predicate, { since })` implement CTL\*-style temporal logic over patch history. Both operators replay patches incrementally, extracting node snapshots at each tick boundary and evaluating the predicate. `always` returns true only if the predicate held at every tick where the node existed. `eventually` short-circuits on the first true tick. The `since` option filters by Lamport timestamp. Predicates receive `{ id, exists, props }` with unwrapped property values.
- **Translation cost estimation** (`EC/COST/1`): New `graph.translationCost(configA, configB)` computes the directed MDL (Minimum Description Length) cost of translating observer A's view into observer B's view. Returns `{ cost, breakdown: { nodeLoss, edgeLoss, propLoss } }` normalized to [0, 1]. Weights: node loss 50%, edge loss 30%, property loss 20%. Identical views produce cost 0; completely disjoint views produce cost 1. The cost is asymmetric: `cost(A→B) ≠ cost(B→A)` in general.

#### Visualization M2 — History, Path, Materialize Renderers (v7.8.1)

- **`git warp --view history`**: Patch timeline renderer with operation summaries, pagination, and node filtering. Shows per-patch operation counts (nodes added/removed, edges added/removed, properties set) with color-coded indicators.
- **`git warp --view path`**: Visual path diagram between two nodes with arrow connectors and edge labels. Supports line-wrapping for long paths and displays hop count.
- **`git warp --view materialize`**: Progress dashboard showing per-writer patch contribution bars, node/edge/property statistics with scaled bar charts, and checkpoint creation status.
- **`summarizeOps` export**: New public function from `history.js` for computing operation type counts from patch ops arrays.
- **`graph.getPropertyCount()`**: New public method on `WarpGraph` returning the number of property entries in materialized state, replacing direct `_cachedState` access in the CLI.
- **Enriched `handleMaterialize` payload**: CLI now populates `writers` (per-writer patch counts), `properties`, and `patchCount` fields for the view renderer.
- **Enriched `handleHistory` payload**: CLI now includes `opSummary` in history entries for real operation summaries instead of `(empty)` fallbacks.

### Documentation

- **GUIDE.md comprehensive rewrite**: Restructured from concept-first reference manual to progressive-disclosure user guide. Quick Start with full working example now at the top. New sections: Writing Data (Writer API, PatchSession, edge properties, onDeleteWithData), Reading Data (all query methods), Graph Traversals (BFS, DFS, shortest path, connected component), Forks, Wormholes, Provenance, Slice Materialization, GC, Bitmap Indexes, Sync Protocol, CLI, Git Hooks. Internal CRDT details moved from user-facing examples to 8 appendixes (Conflict Resolution Internals, Git Ref Layout, Patch Format, Error Code Reference, Tick Receipts, Sync Protocol, Garbage Collection, Bitmap Indexes). Scrubbed raw `WarpStateV5` shapes from user-facing sections; all examples now use the public API (`hasNode`, `getNodeProps`, etc.).
- **JSDoc hygiene pass**: Added or fixed JSDoc across 8 source files:
  - `MigrationService.js`: Added full JSDoc to exported `migrateV4toV5` function; fixed ESLint `no-unnecessary-boolean-literal-compare` errors.
  - `BoundaryTransitionRecord.js`: Added `@param`/`@returns` to `validateBTRStructure`, `verifyHmac`, `verifyReplayHash` (previously bare `@private`).
  - `WormholeService.js`: Added full JSDoc to `collectPatchRange` helper.
  - `LogicalTraversal.js`: Added class-level JSDoc block.
  - `HookInstaller.js`: Added JSDoc to `extractVersion` and 5 module-level helpers; added `@private` to 9 class methods; fixed incomplete `getHookStatus` return type (added `foreign?`, made `current` optional).
  - `GlobalClockAdapter.js`, `PerformanceClockAdapter.js`: Added `@extends ClockPort` to class JSDoc.

### Tests

- Added `test/unit/domain/services/ObserverView.test.js` (23 tests) — node visibility, property filtering, edge visibility, query/traverse through observer
- Added `test/unit/domain/services/TemporalQuery.test.js` (23 tests) — always/eventually operators, acceptance criteria, multi-writer scenarios
- Added `test/unit/domain/services/TranslationCost.test.js` (16 tests) — identical/disjoint/subset configs, property redaction, edge loss, normalization
- Total new tests: 62. Suite total: 2410 tests across 106 files.

### TypeScript

- Added `ObserverConfig`, `ObserverView`, `TemporalQuery`, `TranslationCostBreakdown`, `TranslationCostResult` type declarations
- Added `observer()`, `translationCost()`, and `temporal` getter to `WarpGraph` class

## [8.0.0] — HOLOGRAM

### Breaking Changes

- **`patchesFor()` is now async**: `patchesFor(entityId)` now uses `_ensureFreshState()` like other query methods, so it auto-materializes when `autoMaterialize` is enabled. The return type changed from `string[]` to `Promise<string[]>` — all call sites must be `await`ed.

### Added

#### HOLOGRAM — Provenance & Holography (v8.0.0)

Implements [Paper III](https://doi.org/10.5281/zenodo.17963669) (Computational Holography & Provenance Payloads) and [Paper IV](https://doi.org/10.5281/zenodo.18038297) (Rulial Distance & Observer Geometry) from the AION Foundations Series: provenance payloads, slicing, wormholes, BTRs, and prefix forks.

- **Patch I/O declarations** (`HG/IO/1`): Patches now carry optional `reads` and `writes` string arrays for provenance tracking. Auto-populated during `commitPatch()` by inspecting ops: `NodeAdd(X)` writes X; `NodeRemove(X)` reads X; `EdgeAdd(A→B)` reads A, reads B, writes edge key; `EdgeRemove(A→B)` reads edge key; `PropSet(X, key)` reads and writes X. Backward compatible — legacy patches without fields load correctly.
- **Provenance index** (`HG/IO/2`): New `ProvenanceIndex` class maps node/edge IDs to contributing patch SHAs. New `graph.patchesFor(entityId)` returns all patches that affected an entity. Index built during materialization, persisted in checkpoints, updated incrementally on commit.
- **ProvenancePayload class** (`HG/PROV/1`): New `ProvenancePayload` class implements the boundary encoding `(U_0, P)` from Paper III as a first-class type with monoid operations. Constructor accepts ordered patch sequence. `concat(other)` for monoid composition. `static identity()` for empty payload. `replay(initialState?)` for deterministic materialization. Immutable after construction. Monoid laws verified. Additional utilities: `at()`, `slice()`, `toJSON()`, `fromJSON()`, and `Symbol.iterator`.
- **Slice materialization** (`HG/SLICE/1`): New `graph.materializeSlice(nodeId)` computes backward causal cone and materializes only patches that contributed to the target node. Uses BFS over ProvenanceIndex, topologically sorts patches by Lamport timestamp, replays via ProvenancePayload. Returns `{ state, patchCount, receipts? }`.
- **Wormhole compression** (`HG/WORM/1`): New `graph.createWormhole(fromSha, toSha)` compresses a range of patches into a single wormhole edge. Wormhole contains sub-payload (ProvenancePayload) for replay. `composeWormholes(first, second)` for monoid composition. `replayWormhole()` for materialization. New `WormholeError` class with typed error codes.
- **Boundary Transition Records** (`HG/BTR/1`): New BTR packaging format binds `(h_in, h_out, U_0, P, t, kappa)` for tamper-evident exchange. `createBTR(initialState, payload, { key })` creates signed records. `verifyBTR(btr, key)` validates HMAC and optional replay. CBOR serialization via `serializeBTR()`/`deserializeBTR()`.
- **graph.fork() API** (`HG/FORK/1`): New `graph.fork({ from, at, forkName?, forkWriterId? })` creates a forked graph at a specific point in a writer's chain. Fork shares history up to `at` commit (Git content-addressed dedup). Fork gets a new writer ID and operates independently. Mutual isolation verified. New `ForkError` class with typed error codes.

### Fixed

- **`materializeSlice` duplicate replay**: Fixed bug where `payload.replay()` was always called even when `collectReceipts` was true, causing double materialization. Now branches cleanly: uses `reduceV5()` directly when collecting receipts, `ProvenancePayload.replay()` otherwise.
- **`materializeSlice` double I/O optimization**: `_computeBackwardCone()` now returns `Map<sha, patch>` with already-loaded patches instead of `Set<sha>`, eliminating a second round of patch loading during slice materialization.
- **Fork parameter validation error codes**: Changed error codes from `E_FORK_WRITER_NOT_FOUND`/`E_FORK_PATCH_NOT_FOUND` to `E_FORK_INVALID_ARGS` for missing/invalid `from` and `at` parameters. These codes now properly distinguish between "missing argument" vs "entity not found after lookup".
- **Fork writer ID validation error code**: Changed error code from `E_FORK_NAME_INVALID` to `E_FORK_WRITER_ID_INVALID` when `forkWriterId` validation fails.
- **Fork name collision prevention**: Auto-generated fork names now include a 4-character random suffix (e.g., `graph-fork-1234567890-abcd`) to prevent collisions when two `fork()` calls happen within the same millisecond.
- **Consolidated full-state serialization**: `StateSerializerV5.serializeFullStateV5` and `deserializeFullStateV5` now delegate to `CheckpointSerializerV5`, ensuring BTR and Checkpoint use the same canonical format. Eliminates wire-format incompatibility between the two serializers.
- **`ProvenanceIndex` missing entries guard**: `deserialize()` and `fromJSON()` now throw `"Missing or invalid ProvenanceIndex entries"` if the entries field is undefined or not an array, instead of failing with cryptic iteration errors.
- **`ProvenanceIndex` deterministic iteration**: `[Symbol.iterator]` now uses `#sortedEntries()` to yield entities in deterministic sorted order, matching `toJSON()` and `serialize()` behavior.
- **`deserializeWormhole` structural validation**: Now validates JSON structure before constructing the wormhole, providing clear error messages for missing/invalid fields instead of cryptic failures deep in `ProvenancePayload.fromJSON`.
- **`patchesFor` auto-materialize alignment**: Now uses `_ensureFreshState()` for consistency with other query methods (see Breaking Changes above).
- **Remove misleading `Object.freeze` from `PatchBuilderV2`**: The `reads` and `writes` getters no longer call `Object.freeze()` on the returned Set since it doesn't prevent Set mutations anyway. The defensive copy is the real protection.
- **Error surfacing in `_loadPatchBySha`**: Errors during patch loading are now properly thrown instead of being swallowed, improving debuggability when patches fail to load.
- **Fresh state guard in `materializeSlice`**: Now ensures fresh state before accessing the provenance index, preventing stale index reads after writes.
- **Dirty state guard in `patchesFor`**: Added state guard to `patchesFor()` to throw `E_STALE_STATE` when cached state is dirty and `autoMaterialize` is off.
- **HMAC key validation in BTR**: `createBTR()` now validates that the HMAC key is provided and non-empty, throwing early on misconfiguration.
- **`ForkError` constructor null-safety**: Constructor now coalesces `options` before reading properties, so `new ForkError(msg, null)` no longer throws `TypeError`.
- **`deserializeFullStateV5` null buffer guard**: Now returns `createEmptyStateV5()` when buffer is null or undefined, instead of crashing inside `decode()`.
- **`deserializeFullStateV5` null-safe ORSet fields**: `nodeAlive` and `edgeAlive` now fall back to `{}` when missing from the decoded object, preventing `TypeError` in `orsetDeserialize()`.
- **Negative index support in `ProvenancePayload.at()`**: Negative indices now work correctly (e.g., `payload.at(-1)` returns the last patch), matching JavaScript array semantics.
- **Defensive copies from `PatchBuilderV2` getters**: The `reads` and `writes` getters now return frozen copies instead of the live internal Sets, preventing external mutation.
- **Forward `provenanceIndex` in `CheckpointService.create()`**: The `create()` wrapper now forwards the optional `provenanceIndex` parameter to `createV5()`, preventing silent data loss when using the convenience API.
- **Strip `writerId` from wormhole patches**: `createWormhole()` now strips the extraneous `writerId` field from patches before constructing `ProvenancePayload`, matching the documented `PatchEntry` type contract and reducing serialization size.
- **`ProvenanceIndex.fromJSON` defensive fallback**: Now passes `json.entries || []` to `#buildIndex()` so missing or undefined entries fall back to an empty array, consistent with `deserialize()` behavior.
- **`deserializeFullStateV5` version validation**: Now distinguishes null/undefined input (returns empty state) from version mismatch (throws `Error` with actual version). Serialized state now includes `version: 'full-v5'` for forward compatibility detection. Pre-versioned checkpoints remain loadable for backward compatibility.

### Refactored

- **Deduplicate `createEmptyStateV5`**: `CheckpointSerializerV5` now imports `createEmptyStateV5` from `JoinReducer.js` instead of reimplementing it locally.
- **`_computeBackwardCone` BFS optimization**: Replaced `queue.shift()` (O(n) per pop) with an index pointer for O(1) dequeue, avoiding quadratic behavior on large causal cones.
- **Extract `_onPatchCommitted` helper**: Consolidated the duplicated `onCommitSuccess` callback (from `createPatch()`, `writer()`, and `createWriter()`) into a single `_onPatchCommitted(writerId, opts)` method. Any future changes to post-commit behavior now happen in one place.
- **`ProvenanceIndex` DRY refactor**: Extracted common patterns in `ProvenanceIndex` to reduce duplication; added defensive copy on `getPatchesFor()` return value to prevent external mutation.
- **DRY up patch construction in `PatchBuilderV2`**: Have `commit()` use `createPatchV2()` for patch construction, consolidating the conditional reads/writes inclusion logic in one place.
- **Consolidate `REQUIRED_FIELDS` in `BoundaryTransitionRecord`**: Use the module-level constant in `deserializeBTR()` instead of a local duplicate.

### Documentation

- **Provenance semantics in `PatchBuilderV2`**: Added design note explaining why `removeNode`/`removeEdge` are tracked as reads (observed-dot dependencies) rather than writes (new data creation).
- **`loadCheckpoint` return type**: Updated JSDoc to include the optional `provenanceIndex` field in the documented return shape.
- **Updated `errors/index.js` module JSDoc**: Comment now correctly describes "domain operations" instead of stale "bitmap index operations".

### Tests

- Added provenance tracking tests to `PatchBuilderV2.test.js` (+20 tests)
- Added `test/unit/domain/services/ProvenancePayload.test.js` (49 tests) — monoid laws, replay verification, fuzz tests
- Added `test/unit/domain/services/ProvenanceIndex.test.js` (38 tests) — index construction, queries, serialization
- Added `test/unit/domain/services/WormholeService.test.js` (17 tests) — compression, composition, replay
- Added `test/unit/domain/services/BoundaryTransitionRecord.test.js` (42 tests) — creation, verification, tamper detection
- Added `test/unit/domain/WarpGraph.fork.test.js` (20 tests) — fork creation, isolation, edge cases
- Added `test/unit/domain/WarpGraph.patchesFor.test.js` (13 tests) — provenance queries
- Added `test/unit/domain/WarpGraph.materializeSlice.test.js` (19 tests) — causal cones, slice correctness
- Added `WormholeError` to index exports test coverage
- Added `test/unit/domain/errors/ForkError.test.js` (4 tests) — constructor null-safety, defaults
- Strengthened `CheckpointSerializerV5.test.js` (+6 tests) — edgeBirthEvent round-trip, legacy bare-lamport format, version mismatch error, edgeBirthEvent assertions on null/undefined/missing-field paths
- **Test quality improvements**:
  - Made `ProvenanceIndex` stress test deterministic by removing wall-clock timing assertion (performance testing belongs in benchmarks)
  - Deduplicated `createMockPersistence` helper in `PatchBuilderV2.test.js`
  - Consolidated doubled async assertions in `WarpGraph.fork.test.js` to avoid calling `graph.fork()` twice per test
  - Consolidated doubled async assertions in `WormholeService.test.js` (5 instances)
  - Created `test/helpers/warpGraphTestUtils.js` with shared utilities (OID generators, mock persistence, V2 operation helpers, patch factories) designed for parallel-safe execution
  - Refactored `patchesFor`, `materializeSlice`, `BoundaryTransitionRecord`, and `ProvenancePayload` tests to use shared utilities, removing ~250 lines of duplication
  - Fixed non-deterministic dates in test helpers — `createMockPatchWithIO` and `createMockPatch` now use fixed date `'2026-01-01T00:00:00.000Z'` instead of `new Date().toISOString()`
  - Fixed inconsistent SHA format in `createSamplePatches()` — now uses `generateOidFromNumber()` for 40-character OIDs instead of 8-character strings
  - Refactored `WormholeService.test.js` to use shared utilities from `warpGraphTestUtils.js`, eliminating ~100 lines of duplicated helpers
  - Converted 5 error tests in `WormholeService.test.js` from try/catch + `expect.fail()` to idiomatic `expect().rejects.toMatchObject()` pattern

### TypeScript

- **`ProvenanceIndex` type declarations**: Updated `index.d.ts` to match the runtime API:
  - Changed `toJSON()` return type to `{ version: number; entries: Array<[string, string[]]> }`
  - Changed `fromJSON()` parameter type to match
  - Changed `addPatch()` return type from `void` to `this`
  - Added missing methods: `static empty()`, `has()`, `entities()`, `clear()`, `merge()`, `serialize()`, `static deserialize()`, and `[Symbol.iterator]()`

## [7.8.0] - 2025-02-06

### Added

- **Visualization system** - New `--view` flag for visual ASCII output
  - `git warp --view info` - Graph overview with writer timelines and box-framed summaries
  - `git warp --view check` - Health dashboard with progress bars and status indicators
- Visualization module scaffold (`src/visualization/`) with ASCII renderers and utilities
- Snapshot tests for ASCII renderer output stability
- Dependencies: chalk, boxen, cli-table3, figures, string-width, wrap-ansi

## [7.7.1] — Documentation & Hardening

### Documentation

- **Comprehensive JSDoc pass**: Added or enhanced JSDoc documentation across the entire codebase.
  - **WarpGraph.js**: Added JSDoc to 3 helper functions, added `@throws` to ~15 async methods, added `@deprecated` to `createWriter()`, improved return types, enhanced `query()` with examples.
  - **JoinReducer.js**: Documented 19 functions including `applyOpV2`, outcome helpers, `join`, `joinStates`, `reduceV5`, `cloneStateV5`.
  - **PatchBuilderV2.js**: Enhanced all public methods with `@throws`, examples, and fluent return type documentation.
  - **QueryBuilder.js**: Added 17 helper function docs, 8 class method docs, new type definitions.
  - **LogicalTraversal.js**: Documented helper functions and standardized traversal method documentation.
  - **CRDT primitives**: Added module-level documentation explaining semilattice properties, add-wins semantics, GC safety invariants, EventId comparison logic.
  - **Services**: Documented `StreamingBitmapIndexBuilder`, `CommitDagTraversalService`, `IndexRebuildService`, `SyncProtocol` with comprehensive `@throws` and parameter docs.
  - **Infrastructure**: `GitGraphAdapter` module-level docs, retry strategy; `CborCodec` canonical encoding docs.
  - **Utilities & Errors**: `roaring.js`, `TickReceipt.js`, `QueryError`, `SyncError` with error code tables and examples.

### Fixed

- **StreamingBitmapIndexBuilder checksum compatibility**: Use `canonicalStringify` for deterministic checksums; bump `SHARD_VERSION` to 2 for reader compatibility; cache `RoaringBitmap32` constructor for performance.
- **GitGraphAdapter robustness**: Fail fast when `plumbing` is missing; include `stderr` in transient error detection; preserve empty-string config values; harden exit-code detection in `isAncestor` and `configGet`.
- **JoinReducer validation**: Enforce exactly 4 segments in `decodeEdgePropKey` (no silent truncation on malformed keys).
- **StateDiff edge visibility**: Filter edges by endpoint visibility — edges with tombstoned endpoints are now treated as invisible. Use precomputed node sets for O(1) lookups.
- **WarpGraph watch polling**: Add `pollInFlight` guard to prevent overlapping async poll cycles causing state mismatches.
- **WarpGraph subscriber notifications**: Skip notifying non-replay subscribers when diff is empty.
- **CborCodec**: Validate Map keys are strings; fix RFC 7049 doc to clarify we use JS lexicographic sort, not canonical CBOR.
- **SyncProtocol**: Use typed error code `E_SYNC_DIVERGENCE` for divergence detection instead of fragile string matching.
- **IndexRebuildService**: Enforce `rebuildRef` requirement when `autoRebuild` is true.
- **roaring.js**: Use Symbol sentinel to distinguish "not checked" from "indeterminate" availability.

### Refactoring

- **Centralized `canonicalStringify`**: New `src/domain/utils/canonicalStringify.js` shared by `BitmapIndexBuilder`, `BitmapIndexReader`, and `StreamingBitmapIndexBuilder` to prevent checksum algorithm drift.
- **Shared `SHARD_VERSION`**: Extracted to `src/domain/utils/shardVersion.js` to prevent version drift between `BitmapIndexBuilder` and `StreamingBitmapIndexBuilder`.
- **GitGraphAdapter `getExitCode`**: Extracted standalone helper function for consistent exit code extraction across `refExists`, `readRef`, `nodeExists`, and `_isConfigKeyNotFound`.
- **WarpGraph `watch()` pattern matching**: Pre-compile regex pattern once instead of on every `matchesPattern()` call for improved performance.
- **`canonicalStringify` JSON semantics**: Updated to match `JSON.stringify` behavior — top-level `undefined` returns `"null"`, array elements that are `undefined`/`function`/`symbol` become `"null"`, object properties with such values are omitted.

### Types

- **index.d.ts**: Added `LoadOptions` interface for `IndexRebuildService.load()` with `strict`, `currentFrontier`, `autoRebuild`, and `rebuildRef` options.
- **index.d.ts**: Added `configGet(key: string): Promise<string | null>` and `configSet(key: string, value: string): Promise<void>` to `GitGraphAdapter` class.

### Tests

- Bug fixes verified by existing test suite (2,094 tests pass).
- Additional coverage for edge visibility filtering, CborCodec validation, and watch polling guards.

## [7.7.0] — PULSE

### Added

#### PULSE — Subscriptions & Reactivity (v7.7.0)

- **State diff engine** (`PL/DIFF/1`): New `diffStates(before, after)` function computes deterministic diff between two `WarpStateV5` materialized states. Returns `{ nodes: { added, removed }, edges: { added, removed }, props: { set, removed } }`. Handles null `before` (initial state). O(N) single-pass comparison. Deterministic output ordering (sorted keys/IDs). Used by subscription system to notify handlers of graph changes. Includes `isEmptyDiff()` and `createEmptyDiff()` utilities.
- **Subscription API** (`PL/SUB/1`): New `graph.subscribe({ onChange, onError? })` returns `{ unsubscribe() }`. After `materialize()`, if state changed since last materialize, computes diff and calls `onChange(diff)` for all subscribers. Errors in handlers are isolated — caught and forwarded to `onError` if provided. Multiple subscribers supported. Unsubscribe stops future notifications.
- **Optional initial replay** (`PL/SUB/2`): New `replay` option for `graph.subscribe({ onChange, replay: true })`. When set, immediately fires `onChange` with a diff from empty state to current state. If cached state is not yet available (no prior `materialize()`), replay is deferred until the first `materialize()` call. Enables subscribers to bootstrap with current graph state without missing data.
- **Pattern-based watch** (`PL/WATCH/1`): New `graph.watch(pattern, { onChange, onError? })` returns `{ unsubscribe() }`. Like `subscribe()` but filters changes to only those matching the glob pattern. Filters apply to node IDs in `nodes.added`/`nodes.removed`, edge endpoints (`from`/`to`), and property `nodeId`. Uses same glob syntax as `query().match()` (e.g., `'user:*'`, `'order:123'`, `'*'`). Handler not called if all changes are filtered out. Reuses subscription infrastructure.
- **Polling integration** (`PL/WATCH/2`): New `poll` option for `graph.watch(pattern, { onChange, poll: 5000 })`. When set, periodically calls `hasFrontierChanged()` and auto-materializes if the frontier has changed (e.g., remote writes detected). Minimum poll interval is 1000ms. The interval is automatically cleaned up on `unsubscribe()`. Errors during polling are forwarded to `onError` if provided.

### Tests

- Added `test/unit/domain/services/StateDiff.test.js` (27 tests) — node/edge/prop diffs, null before, identical states, determinism
- Added `test/unit/domain/WarpGraph.subscribe.test.js` (28 tests) — subscribe/unsubscribe, onChange after materialize, error isolation, multiple subscribers, replay option
- Added `test/unit/domain/WarpGraph.watch.test.js` (41 tests) — pattern filtering for nodes/edges/props, glob patterns, unsubscribe, error handling, polling integration with frontier change detection

## [7.6.0] — LIGHTHOUSE

### Added

#### LIGHTHOUSE — Observability (v7.6.0)

- **`graph.status()` API** (`LH/STATUS/1`): New async method returns a lightweight operational health snapshot: `{ cachedState: 'fresh' | 'stale' | 'none', patchesSinceCheckpoint, tombstoneRatio, writers, frontier }`. O(writers) cost — does NOT trigger materialization. `cachedState` reflects dirty flag and frontier change detection.
- **Structured operation timing** (`LH/TIMING/1`): Core operations (`materialize()`, `syncWith()`, `createCheckpoint()`, `runGC()`) now emit structured timing logs via `LoggerPort` at info level. Format: `[warp] materialize completed in 142ms (23 patches)`. Uses injected `ClockPort` for testable timing. New `clock` option on `WarpGraph.open()` (defaults to `PerformanceClockAdapter`). Failed operations log timing with error context.
- **CLI status enhancement** (`LH/CLI/1`): `git warp check` now surfaces full `graph.status()` output. Human mode: color-coded staleness (green/yellow/red) with patch count, tombstone ratio, and writer count. JSON mode: raw `status` object included in check payload.
- **Tick receipt data structure** (`LH/RECEIPTS/1`): New `TickReceipt` immutable type: `{ patchSha, writer, lamport, ops: [{ op, target, result, reason? }] }`. Deep-frozen after creation. Canonical JSON serialization with deterministic key ordering. Exported from package root: `createTickReceipt`, `tickReceiptCanonicalJson`, `TICK_RECEIPT_OP_TYPES`, `TICK_RECEIPT_RESULT_TYPES`. TypeScript declarations added to `index.d.ts`.
- **Tick receipt emission during materialization** (`LH/RECEIPTS/2`): New `materialize({ receipts: true })` returns `{ state, receipts }` with per-patch decision records. Each receipt records per-op outcomes: `applied`, `superseded` (with LWW winner reason), or `redundant`. **Zero-cost invariant**: when `receipts` is false/omitted (default), strictly zero overhead — no arrays allocated, no strings constructed on the hot path. Return type unchanged (just `state`). OR-Set decisions: NodeAdd/EdgeAdd track new-dot vs re-add. NodeTombstone/EdgeTombstone track effective vs already-gone. PropSet decisions: LWW comparison with reason string showing winner info.

### Fixed

- **`status()` false staleness after eager commits**: `_lastFrontier` is now updated in all three `onCommitSuccess` callbacks and after `applySyncResponse()`, so `status()` correctly reports `'fresh'` instead of `'stale'` after local writes and sync operations.
- **Receipt forward-compatibility**: Unknown/future op types in the receipt-enabled materialization path are now silently skipped instead of throwing a validation error. The op is still applied to state; it just doesn't appear in the receipt.
- **Duplicate tombstone ratio in CLI**: `git warp check` no longer prints tombstone ratio twice when `graph.status()` is available.
- **`EmptyGraph` branding in WALKTHROUGH.md**: Replaced all remaining occurrences with `git-warp`/`Git Warp`.
- **`Empty Graph Container` in Dockerfile**: Updated to `Git Warp Container`.

### Tests

- Added `test/unit/domain/WarpGraph.status.test.js` (25 tests) — status() field correctness, no-materialize guarantee, frontier freshness after eager commits and sync
- Added `test/unit/domain/WarpGraph.timing.test.js` (15 tests) — timing logs for all 4 operations, clock injection
- Added `test/unit/domain/WarpGraph.receipts.test.js` (19 tests) — receipt emission, backward compatibility, zero-cost
- Added `test/unit/domain/types/TickReceipt.test.js` (44 tests) — construction, immutability, validation, canonical JSON
- Added `test/unit/domain/services/JoinReducer.receipts.test.js` (31 tests) — per-op outcome correctness, unknown op forward-compatibility
- Total new tests: 134. Suite total: 1998 tests across 91 files.

## [7.5.0] — COMPASS

### Added

#### COMPASS — Advanced Query Language (v7.5.0)

- **Object shorthand in `where()`** (`CP/WHERE/1`): `where({ role: 'admin' })` filters nodes by property equality. Multiple properties = AND semantics. Object and function forms can be mixed via chaining. Only primitive values (string, number, boolean, null) are accepted — non-primitive values (objects, arrays, functions) throw `E_QUERY_WHERE_VALUE_TYPE` since cloned property snapshots would never `===` match.
- **Multi-hop traversal** (`CP/MULTIHOP/1`): `outgoing(label, { depth: [1, 3] })` traverses 1–3 hops in a single call. `depth: 2` shorthand for exactly 2 hops. `depth: [0, N]` includes the start set (self-inclusion at depth 0). Default `[1, 1]` preserves existing single-hop behavior. Cycle-safe with deterministic ordering. Depth values must be non-negative integers with min ≤ max.
- **Aggregation** (`CP/AGG/1`): `aggregate({ count: true, sum: 'props.total' })` computes count/sum/avg/min/max over matched nodes without materializing the full result set. Terminal operation — calling `select()`, `outgoing()`, or `incoming()` after `aggregate()` throws. Non-numeric values silently skipped. Spec fields are validated: `sum`/`avg`/`min`/`max` must be strings, `count` must be boolean.

### Fixed

- **`aggregate()` spec validation**: Passing non-string paths (e.g. `sum: true`) or non-boolean count (e.g. `count: 'yes'`) now throws `QueryError` with code `E_QUERY_AGGREGATE_TYPE` instead of a late `TypeError`.
- **`Math.min/max` stack overflow**: Replaced `Math.min(...values)` / `Math.max(...values)` in aggregation with `.reduce()` to avoid `RangeError` on arrays with >65K elements.
- **`normalizeDepth` validation**: Negative, non-integer, and min>max depth values now throw `QueryError` (`E_QUERY_DEPTH_TYPE` or `E_QUERY_DEPTH_RANGE`) instead of producing undefined behavior.
- **`applyMultiHop` depth-0 inclusion**: `depth: [0, N]` now correctly includes the start set in results. Previously, nodes at hop 0 were silently dropped.
- **`where()` primitive enforcement**: Object shorthand values are validated as primitives. Non-primitive values (objects, arrays, functions) throw `QueryError` with code `E_QUERY_WHERE_VALUE_TYPE`.
- **ROADMAP.md fenced code block**: Added `text` language identifier to the Task DAG code fence (fixes markdownlint MD040).

## [7.0.0]

### Added

- **git-warp CLI** - canonical `git warp` entrypoint (shim + PATH install)
- **Installer scripts** - `scripts/install-git-warp.sh` and `scripts/uninstall-git-warp.sh`
- **Docker bats CLI test** coverage for `git warp` commands
- **Pre-push hook** - runs lint, unit tests, benchmarks, and Docker bats CLI suite
- **`graph.serve()`** - one-line HTTP sync transport for multi-writer graphs
- **`graph.syncWith()`** - sync with HTTP peer or direct graph instance
- **`graph.getWriterPatches(writerId)`** - public API for writer patch history

#### AUTOPILOT — Kill the Materialize Tax

- **Auto-invalidation** (`AP/INVAL/1-3`): `_stateDirty` flag tracks staleness. Local commits via `createPatch()`, `writer.commitPatch()`, and `PatchSession.commit()` eagerly apply patches to cached state — no stale reads after writes.
- **Auto-materialize** (`AP/LAZY/1-2`): `autoMaterialize: boolean` option on `WarpGraph.open()`. When enabled, query methods (`hasNode`, `getNodeProps`, `neighbors`, `getNodes`, `getEdges`, `query().run()`, `traverse.*`) auto-materialize instead of throwing.
- **Auto-checkpointing** (`AP/CKPT/1-3`): `checkpointPolicy: { every: N }` option on `WarpGraph.open()`. After `materialize()` processes N+ patches, a checkpoint is created automatically. Failures are swallowed — never breaks materialize.
- **Post-merge hook** (`AP/HOOK/1-2`): `post-merge` Git hook detects warp ref changes after `git pull` and prints a warning (or auto-materializes if `warp.autoMaterialize` git config is set). Installed via `scripts/hooks/` on `npm install`.
- **`git warp materialize`** CLI command: materializes and checkpoints all graphs (or a single graph with `--graph`).
- **`git warp install-hooks`** CLI command: installs/upgrades the post-merge hook with interactive conflict resolution.
- **ROADMAP.md** with task DAG and `scripts/roadmap.js` tracking tool.

#### Error Handling

- **`QueryError` with error codes**: State guard throws now use `QueryError` with `E_NO_STATE` (no cached state) and `E_STALE_STATE` (dirty state) instead of bare `Error`.

#### GROUNDSKEEPER — Index Health & GC

- **Index staleness detection** (`GK/IDX/1-2`): Frontier metadata stored alongside bitmap indexes. `loadIndexFrontier()` and `checkStaleness()` detect when writer tips have advanced past the indexed state. Auto-rebuild option on `IndexRebuildService.load()`.
- **Tombstone garbage collection** (`GK/GC/1`): `GCPolicy` wired into post-materialize path (opt-in via `gcPolicy` option). Warns when tombstone ratio exceeds threshold.

#### WEIGHTED — Edge Properties (v7.3.0)

- **Edge property key encoding** (`WT/EPKEY/1`): `encodeEdgePropKey()`/`decodeEdgePropKey()` with `\x01` prefix for collision-free namespacing against node property keys.
- **`patch.setEdgeProperty(from, to, label, key, value)`** (`WT/OPS/1`): New PatchBuilderV2 method for setting properties on edges. Generates `PropSet` ops in the edge namespace.
- **LWW semantics for edge properties** (`WT/OPS/2`): Existing JoinReducer LWW pipeline handles edge properties transparently — no special-case logic needed.
- **`graph.getEdgeProps(from, to, label)`** (`WT/OPS/3`): New convenience method returning edge properties as a plain object. `getEdges()` now returns a `props` field on each edge.
- **Schema v3** (`WT/SCHEMA/1`): Minimal schema bump signaling edge property support. `detectSchemaVersion()` auto-detects from ops. Codec handles v2 and v3 transparently.
- **Mixed-version sync safety** (`WT/SCHEMA/2`): `assertOpsCompatible()` guard throws `E_SCHEMA_UNSUPPORTED` when v2 reader encounters edge property ops. Node-only v3 patches accepted by v2 readers. Fail fast, never silently drop data.
- **Edge property visibility gating** (`WT/VIS/1`): Edge props invisible when parent edge is tombstoned. Birth-lamport tracking ensures re-adding an edge starts with a clean slate (old props not restored).
- **`SchemaUnsupportedError`** — New error class with code `E_SCHEMA_UNSUPPORTED` for sync compatibility failures.

#### HANDSHAKE — Multi-Writer Ergonomics (v7.4.0)

- **Two-form writer API** (`HS/WRITER/1`): `graph.writer()` returns stable identity writer (resolved from git config or generated); `graph.writer(id)` returns explicit-identity writer. `createWriter()` deprecated with console warning.
- **Sync-then-materialize** (`HS/SYNC/1`): `syncWith(peer, { materialize: true })` atomically syncs and materializes, returning `{ applied, attempts, state }`.
- **Error audit** (`HS/ERR/1`): Classified all 93 throw sites across the codebase (documented in `docs/error-audit.md`).
- **Error codes with recovery hints** (`HS/ERR/2`): `E_NO_STATE` and `E_STALE_STATE` messages now include actionable recovery guidance (call `materialize()` or enable `autoMaterialize`).
- **CAS failure detection** (`HS/CAS/1`): `PatchBuilderV2.commit()` throws `WriterError` with code `WRITER_CAS_CONFLICT` and `expectedSha`/`actualSha` properties on compare-and-swap mismatch.
- **Delete guard option** (`HS/DELGUARD/1`): `onDeleteWithData: 'reject' | 'cascade' | 'warn'` option on `WarpGraph.open()` (default `'warn'`).
- **Reject and warn modes** (`HS/DELGUARD/2`): `removeNode()` throws on nodes with attached data in reject mode; logs `console.warn` in warn mode.
- **Cascade deletion** (`HS/DELGUARD/3`): Cascade mode auto-generates `EdgeRemove` ops for all connected edges before `NodeRemove`. Generated ops appear in the committed patch for auditability.

#### Query API (V7 Task 7)

- **`graph.hasNode(nodeId)`** - Check if node exists in materialized state
- **`graph.getNodeProps(nodeId)`** - Get all properties for a node (returns `Record<string, unknown>` since v13.0.0)
- **`graph.neighbors(nodeId, dir?, label?)`** - Get neighbors with direction/label filtering
- **`graph.getNodes()`** - Get all visible node IDs
- **`graph.getEdges()`** - Get all visible edges as `{from, to, label}` array

All query methods operate on `WarpStateV5` (materialized state), never commit DAG topology.

#### WARP State Index (V7 Task 6)

- **`WarpStateIndexBuilder`** - New index builder that indexes WARP logical edges from `edgeAlive` OR-Set
- **`buildWarpStateIndex(state)`** - Convenience function to build and serialize index from state
- Index built from materialized state, not Git commit parents (TECH-SPEC-V7.md compliance)

### Changed

- **ESLint hardened** to zero-tolerance: `typescript-eslint` strict type-checked rules on `src/` and `bin/`, max-complexity 10, max-lines-per-function 50, max-depth 3 (with relaxations for algorithm-heavy modules).
- **`_ensureFreshState()`** now throws `E_STALE_STATE` when cached state is dirty and `autoMaterialize` is off (previously silently returned stale data).
- **`QueryBuilder.run()`** `where`/`select` loops parallelized with `Promise.all`.
- **`StreamingBitmapIndexBuilder.registerNode()`** returns `Promise<number>` via `Promise.resolve()` for API compatibility.
- **`createCheckpoint()`** reuses cached state when fresh, guarded against recursive auto-checkpoint calls.
- **`execGitConfigValue`** in CLI uses `execFileSync` with argument array instead of shell string (prevents command injection).
- **`eslint.config.js`** uses `fileURLToPath`-based `__dirname` for broader Node.js compatibility.
- **Repo ping** now uses `git rev-parse --is-inside-work-tree` for plumbing compatibility
- **CLI imports** avoid eager `index.js` loading to suppress `url.parse` warnings from optional deps
- **v7-guards.test.js** - Added `WarpStateIndexBuilder.js` to required V7 components
- **Benchmarks** now run in non-watch mode for CI/pre-push safety
- **Docker test image** copies hooks/patches before `npm install` to support postinstall
- **Git ref reads** guard missing refs to avoid fatal `show-ref` errors in empty repos

### Documentation

- **Complete JSDoc coverage** across 21 source files
- **ROADMAP.md** — consolidated task tracking with dependency DAG
- **`docs/V7_TEST_MAPPING.md`** - Maps TECH-SPEC-V7.md Task 5 requirements to existing test files
  - Documents how existing tests cover WARP contracts (write, materialize, convergence, determinism)
  - Confirms legacy tests deleted (not skipped)
  - Provides verification commands
- Hook docs updated in README/CONTRIBUTING
- Example imports clarified for external consumers

### Tests

- Added `test/unit/domain/WarpGraph.invalidation.test.js` (11 tests) — dirty flag + eager re-materialize
- Added `test/unit/domain/WarpGraph.writerInvalidation.test.js` (10 tests) — Writer API invalidation
- Added `test/unit/domain/WarpGraph.lazyMaterialize.test.js` (46 tests) — auto-materialize guard
- Added `test/unit/domain/WarpGraph.autoCheckpoint.test.js` (14 tests) — auto-checkpoint trigger
- Added `test/unit/domain/WarpGraph.autoMaterialize.test.js` (7 tests) — option validation
- Added `test/unit/domain/WarpGraph.checkpointPolicy.test.js` (9 tests) — option validation
- Added `test/unit/domain/WarpGraph.patchCount.test.js` (7 tests) — patch counter tracking
- Added `test/unit/domain/services/HookInstaller.test.js` (29 tests) — hook install/upgrade/append/replace
- Added `test/unit/domain/WarpGraph.query.test.js` (21 tests) - Query API tests
- Added `test/unit/domain/services/WarpStateIndexBuilder.test.js` (13 tests) - WARP state index tests
- Added `test/unit/domain/WarpGraph.writerApi.test.js` (5 tests) — writer() two-form API
- Added `test/unit/domain/WarpGraph.syncMaterialize.test.js` (3 tests) — syncWith materialize option
- Added `test/unit/domain/WarpGraph.errorCodes.test.js` (27 tests) — E_NO_STATE/E_STALE_STATE codes and hints
- Added `test/unit/domain/services/PatchBuilderV2.cas.test.js` (7 tests) — CAS conflict detection
- Added `test/unit/domain/WarpGraph.deleteGuard.test.js` (6 tests) — onDeleteWithData option validation
- Added `test/unit/domain/WarpGraph.deleteGuardEnforce.test.js` (13 tests) — reject/warn/cascade enforcement
- Added `test/unit/domain/WarpGraph.cascadeDelete.test.js` (8 tests) — cascade deletion with edge cleanup
- Total test count: 1833 (85 test files)

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
- **A\* Search**: `aStarSearch()` with heuristic guidance
  - Supports both `weightProvider` and `heuristicProvider` callbacks
  - Tie-breaking favors higher g(n) for efficiency
  - Returns `{ path, totalCost, nodesExplored }`
- **Bidirectional A\***: `bidirectionalAStar()` - meets in the middle from both ends
  - Separate forward/backward heuristics
  - Optimal path finding with potentially fewer explored nodes
- **MinHeap Utility**: `src/domain/utils/MinHeap.js` for priority queue operations
  - Methods: `insert()`, `extractMin()`, `peekPriority()`, `isEmpty()`, `size()`
- **Lagrangian Demo**: `npm run demo:lagrangian` - Resource-aware pathfinding
  - Event payloads now include `metrics: { cpu, mem }` for weight calculations
  - Demonstrates Dijkstra, A\*, and cost optimization concepts
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
- **Graceful Degradation**: BitmapIndexService.\_getOrLoadShard now handles corrupt/missing shards gracefully with try-catch
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
