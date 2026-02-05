# Error Audit: WarpGraph.js and Services

**Task:** HS/ERR/1
**Date:** 2026-02-04
**Branch:** phase-3-weighted

This document catalogues every `throw` site in the audited files, classifying each error by cause and proposing a structured error code and recovery hint for HS/ERR/2.

## Existing Error Types

| Class | Extends | Code Field | Module |
|---|---|---|---|
| `IndexError` | `Error` | `INDEX_ERROR` | `src/domain/errors/IndexError.js` |
| `EmptyMessageError` | `IndexError` | `EMPTY_MESSAGE` | `src/domain/errors/EmptyMessageError.js` |
| `OperationAbortedError` | `Error` | `OPERATION_ABORTED` | `src/domain/errors/OperationAbortedError.js` |
| `QueryError` | `Error` | `QUERY_ERROR` (default) | `src/domain/errors/QueryError.js` |
| `SchemaUnsupportedError` | `Error` | `E_SCHEMA_UNSUPPORTED` | `src/domain/errors/SchemaUnsupportedError.js` |
| `ShardCorruptionError` | `IndexError` | `SHARD_CORRUPTION_ERROR` | `src/domain/errors/ShardCorruptionError.js` |
| `ShardLoadError` | `IndexError` | `SHARD_LOAD_ERROR` | `src/domain/errors/ShardLoadError.js` |
| `ShardValidationError` | `IndexError` | `SHARD_VALIDATION_ERROR` | `src/domain/errors/ShardValidationError.js` |
| `StorageError` | `IndexError` | `STORAGE_ERROR` | `src/domain/errors/StorageError.js` |
| `SyncError` | `Error` | `SYNC_ERROR` (default) | `src/domain/errors/SyncError.js` |
| `TraversalError` | `Error` | `TRAVERSAL_ERROR` (default) | `src/domain/errors/TraversalError.js` |
| `WriterError` | `Error` | *(varies)* | `src/domain/warp/Writer.js` |
| `WriterIdError` | `Error` | *(varies)* | `src/domain/utils/WriterId.js` |

---

## Throw Site Audit

### WarpGraph.js (`src/domain/WarpGraph.js`)

| # | Line | Error Type | Current Message | Classification | Suggested Code | Suggested Recovery Hint |
|---|---|---|---|---|---|---|
| 1 | 182 | `Error` | `'persistence is required'` | configuration | `E_MISSING_PERSISTENCE` | Pass a `GitGraphAdapter` instance as `persistence` in `WarpGraph.open()` options. |
| 2 | 188 | `Error` | `'checkpointPolicy must be an object with { every: number }'` | configuration | `E_INVALID_CHECKPOINT_POLICY` | Pass `checkpointPolicy` as `{ every: <positive integer> }` or omit it. |
| 3 | 191 | `Error` | `'checkpointPolicy.every must be a positive integer'` | configuration | `E_INVALID_CHECKPOINT_POLICY` | `checkpointPolicy.every` must be a positive integer (e.g. `{ every: 50 }`). |
| 4 | 197 | `Error` | `'autoMaterialize must be a boolean'` | configuration | `E_INVALID_AUTO_MATERIALIZE` | Pass `autoMaterialize` as `true` or `false`, or omit it. |
| 5 | 315-318 | `Error` | `` `Failed to parse lamport from writer ref ${writerRef}: commit ${currentRefSha} has invalid patch message format` `` | persistence | `E_CORRUPT_PATCH_MESSAGE` | The writer ref points to a commit with a malformed patch message. Inspect the commit manually with `git cat-file -p <sha>`. May need to reset the writer ref. |
| 6 | 568-570 | `QueryError` (code: `E_NO_STATE`) | `'No cached state. Call materialize() first.'` | never-materialized | `E_NO_STATE` | Call `await graph.materialize()` before calling `join()`. |
| 7 | 574 | `Error` | `'Invalid state: must be a valid WarpStateV5 object'` | validation | `E_INVALID_STATE` | The `otherState` argument must be a valid `WarpStateV5` object with `nodeAlive` and `edgeAlive` fields. |
| 8 | 842-846 | `Error` | `'Cannot open graph with v1 history. Run MigrationService.migrate() first to create migration checkpoint.'` | configuration | `E_MIGRATION_REQUIRED` | Run `MigrationService.migrate()` to create a migration checkpoint before opening this graph. |
| 9 | 1011-1014 | `Error` | `` `Backfill rejected for writer ${writerId}: incoming patch is ${relation} checkpoint frontier` `` | persistence | `E_BACKFILL_REJECTED` | This patch is already covered by the checkpoint. This usually means the data was already included. Re-materialize from the latest checkpoint. |
| 10 | 1018-1021 | `Error` | `` `Writer fork detected for ${writerId}: incoming patch does not extend checkpoint head` `` | concurrency | `E_WRITER_FORK` | The writer's chain has diverged from the checkpoint. This indicates a writer identity conflict. Ensure each writer ID is used by only one process. |
| 11 | 1120-1122 | `QueryError` (code: `E_NO_STATE`) | `'No cached state. Call materialize() first.'` | never-materialized | `E_NO_STATE` | Call `await graph.materialize()` before calling `runGC()`. |
| 12 | 1269-1271 | `QueryError` (code: `E_NO_STATE`) | `'No cached state. Call materialize() first.'` | never-materialized | `E_NO_STATE` | Call `await graph.materialize()` before calling `applySyncResponse()`. |
| 13 | 1336-1339 | `SyncError` (code: `E_SYNC_REMOTE_URL`) | `'Invalid remote URL'` | validation | `E_SYNC_REMOTE_URL` | Provide a valid HTTP or HTTPS URL as the `remote` argument to `syncWith()`. |
| 14 | 1343-1346 | `SyncError` (code: `E_SYNC_REMOTE_URL`) | `'Unsupported remote URL protocol'` | validation | `E_SYNC_REMOTE_URL` | Only `http:` and `https:` protocols are supported. Change the URL protocol. |
| 15 | 1412 | `OperationAbortedError` | `"Operation 'syncWith' aborted: Signal received"` | concurrency | `E_SYNC_ABORTED` | The sync was cancelled via the AbortSignal. Retry if the cancellation was unintentional. |
| 16 | 1415-1418 | `SyncError` (code: `E_SYNC_TIMEOUT`) | `'Sync request timed out'` | protocol | `E_SYNC_TIMEOUT` | The remote peer did not respond within `timeoutMs`. Increase `timeoutMs` or check network connectivity. |
| 17 | 1420-1423 | `SyncError` (code: `E_SYNC_NETWORK`) | `'Network error'` | protocol | `E_SYNC_NETWORK` | A network-level error occurred (e.g. DNS failure, connection refused). Check connectivity to the remote peer. |
| 18 | 1429-1432 | `SyncError` (code: `E_SYNC_REMOTE`) | `` `Remote error: ${res.status}` `` | protocol | `E_SYNC_REMOTE` | The remote server returned a 5xx error. Retry later or check the remote server's health. |
| 19 | 1436-1439 | `SyncError` (code: `E_SYNC_PROTOCOL`) | `` `Protocol error: ${res.status}` `` | protocol | `E_SYNC_PROTOCOL` | The remote server returned a 4xx error. Check that both peers are running compatible versions. |
| 20 | 1445-1448 | `SyncError` (code: `E_SYNC_PROTOCOL`) | `'Invalid JSON response'` | protocol | `E_SYNC_PROTOCOL` | The remote returned a non-JSON response body. Ensure the sync endpoint is correct. |
| 21 | 1461-1463 | `SyncError` (code: `E_SYNC_PROTOCOL`) | `'Invalid sync response'` | protocol | `E_SYNC_PROTOCOL` | The response did not match the expected `sync-response` schema. Check peer version compatibility. |
| 22 | 1490-1495 | `OperationAbortedError` | `"Operation 'syncWith' aborted: Signal received"` | concurrency | `E_SYNC_ABORTED` | The sync was cancelled via the AbortSignal after retry exhaustion. |
| 23 | 1497-1502 | *(re-throws cause from RetryExhaustedError)* | *(varies -- the underlying SyncError)* | protocol | *(inherits from cause)* | All retry attempts exhausted. The last error is re-thrown. Check network and remote health. |
| 24 | 1524 | `Error` | `'serve() requires a numeric port'` | configuration | `E_INVALID_PORT` | Pass a numeric `port` value to `serve()` (e.g. `{ port: 3000 }`). |
| 25 | 1760-1762 | `QueryError` (code: `E_NO_STATE`) | `'No cached state. Call materialize() first.'` | never-materialized | `E_NO_STATE` | Call `await graph.materialize()` before querying. Or pass `autoMaterialize: true` to `WarpGraph.open()`. |
| 26 | 1765-1767 | `QueryError` (code: `E_STALE_STATE`) | `'Cached state is dirty. Call materialize() to refresh.'` | stale-after-write | `E_STALE_STATE` | A write occurred since the last `materialize()`. Call `await graph.materialize()` to refresh. Or pass `autoMaterialize: true` to `WarpGraph.open()`. |

**Note on `_ensureFreshState()` (lines 1754-1768):** This is the guard used by `hasNode`, `getNodeProps`, `getEdgeProps`, `neighbors`, `getNodes`, and `getEdges`. The `E_STALE_STATE` error covers both stale-after-write and stale-after-sync scenarios -- the `_stateDirty` flag is set by both local writes (via `onCommitSuccess` when cache is absent) and sync operations that deliver new patches. The `E_NO_STATE` error is thrown when `materialize()` was never called.

---

### PatchBuilderV2.js (`src/domain/services/PatchBuilderV2.js`)

| # | Line | Error Type | Current Message | Classification | Suggested Code | Suggested Recovery Hint |
|---|---|---|---|---|---|---|
| 27 | 195 | `Error` | `` `Cannot set property on unknown edge (${from} -> ${to} [${label}]): add the edge first` `` | validation | `E_EDGE_NOT_FOUND` | The edge must exist in the current materialized state or be added earlier in the same patch before setting properties on it. Call `addEdge()` before `setEdgeProperty()`. |
| 28 | 245 | `Error` | `'Cannot commit empty patch: no operations added'` | validation | `E_EMPTY_PATCH` | Add at least one operation (`addNode`, `addEdge`, `setProperty`, etc.) before calling `commit()`. |
| 29 | 253-257 | `Error` | `` `Concurrent commit detected: writer ref ${writerRef} has advanced. Expected parent ${...}, found ${...}. Call createPatch() again to retry.` `` | concurrency | `E_CONCURRENT_COMMIT` | Another commit was made to this writer's chain between `createPatch()` and `commit()`. Call `createPatch()` again to get a fresh builder. |

---

### SyncProtocol.js (`src/domain/services/SyncProtocol.js`)

| # | Line | Error Type | Current Message | Classification | Suggested Code | Suggested Recovery Hint |
|---|---|---|---|---|---|---|
| 30 | 103-105 | `Error` | `` `Divergence detected: ${toSha} does not descend from ${fromSha} for writer ${writerId}` `` | concurrency | `E_SYNC_DIVERGENCE` | The writer's patch chain has diverged. This could indicate a writer fork. The sync protocol silently skips diverged writers during `processSyncRequest`. |

**Note:** The `assertOpsCompatible` call at line 329 in `applySyncResponse` can throw `SchemaUnsupportedError` (see WarpMessageCodec.js entry below).

---

### CheckpointService.js (`src/domain/services/CheckpointService.js`)

| # | Line | Error Type | Current Message | Classification | Suggested Code | Suggested Recovery Hint |
|---|---|---|---|---|---|---|
| 31 | 179-182 | `Error` | `` `Checkpoint ${checkpointSha} is schema:${decoded.schema}. Only schema:2 and schema:3 checkpoints are supported. Please migrate using MigrationService.` `` | configuration | `E_CHECKPOINT_SCHEMA_UNSUPPORTED` | This checkpoint uses an older schema version. Run `MigrationService.migrate()` to upgrade the checkpoint. |
| 32 | 191 | `Error` | `` `Checkpoint ${checkpointSha} missing frontier.cbor in tree` `` | persistence | `E_CHECKPOINT_CORRUPT` | The checkpoint tree is missing the `frontier.cbor` blob. The checkpoint may be corrupted. Re-create it with `graph.createCheckpoint()`. |
| 33 | 199 | `Error` | `` `Checkpoint ${checkpointSha} missing state.cbor in tree` `` | persistence | `E_CHECKPOINT_CORRUPT` | The checkpoint tree is missing the `state.cbor` blob. The checkpoint may be corrupted. Re-create it with `graph.createCheckpoint()`. |

---

### JoinReducer.js (`src/domain/services/JoinReducer.js`)

No `throw` statements. Unknown operation types are silently ignored at line 167 (`default: break`). This is intentional for forward-compatibility.

---

### Writer.js (`src/domain/warp/Writer.js`)

| # | Line | Error Type | Current Message | Classification | Suggested Code | Suggested Recovery Hint |
|---|---|---|---|---|---|---|
| 34 | 65 | *(via `validateWriterId()`)* | *(various -- see RefLayout.js below)* | validation | *(see RefLayout.js)* | *(see RefLayout.js)* |

**Note:** The `Writer` constructor calls `validateWriterId(writerId)` which delegates to `RefLayout.validateWriterId`. See the RefLayout.js section below for the individual throw sites.

---

### PatchSession.js (`src/domain/warp/PatchSession.js`)

| # | Line | Error Type | Current Message | Classification | Suggested Code | Suggested Recovery Hint |
|---|---|---|---|---|---|---|
| 35 | 158 | `WriterError` (code: `EMPTY_PATCH`) | `'Cannot commit empty patch: no operations added'` | validation | `E_EMPTY_PATCH` | Add at least one operation before calling `commit()`. |
| 36 | 166-171 | `WriterError` (code: `WRITER_REF_ADVANCED`) | `` `Writer ref ${writerRef} has advanced since beginPatch(). Expected ${...}, found ${...}. Call beginPatch() again to retry.` `` | concurrency | `E_WRITER_REF_ADVANCED` | The writer ref moved between `beginPatch()` and `commit()`. Call `beginPatch()` again. |
| 37 | 183-187 | `WriterError` (code: `WRITER_REF_ADVANCED`) | *(re-wrapped from PatchBuilderV2 concurrent commit error)* | concurrency | `E_WRITER_REF_ADVANCED` | *(same as above)* |
| 38 | 191-194 | `WriterError` (code: `PERSIST_WRITE_FAILED`) | `` `Failed to persist patch: ${err.message}` `` | persistence | `E_PERSIST_WRITE_FAILED` | A Git operation failed during commit. Check disk space, file permissions, and repository integrity. |
| 39 | 214 | `Error` | `'PatchSession already committed. Call beginPatch() to create a new session.'` | validation | `E_SESSION_COMMITTED` | Each `PatchSession` can only be committed once. Call `writer.beginPatch()` to start a new session. |

---

### QueryBuilder.js (`src/domain/services/QueryBuilder.js`)

| # | Line | Error Type | Current Message | Classification | Suggested Code | Suggested Recovery Hint |
|---|---|---|---|---|---|---|
| 40 | 21-24 | `QueryError` (code: `E_QUERY_MATCH_TYPE`) | `'match() expects a string pattern'` | validation | `E_QUERY_MATCH_TYPE` | Pass a string pattern to `match()` (e.g. `'user:*'` or `'*'`). |
| 41 | 30-33 | `QueryError` (code: `E_QUERY_WHERE_TYPE`) | `'where() expects a predicate function'` | validation | `E_QUERY_WHERE_TYPE` | Pass a function to `where()` (e.g. `.where(n => n.props.age > 18)`). |
| 42 | 42-45 | `QueryError` (code: `E_QUERY_LABEL_TYPE`) | `'label must be a string'` | validation | `E_QUERY_LABEL_TYPE` | Edge labels must be strings. Pass a string label to `outgoing()` or `incoming()`. |
| 43 | 235-238 | `QueryError` (code: `E_QUERY_SELECT_TYPE`) | `'select() expects an array of fields'` | validation | `E_QUERY_SELECT_TYPE` | Pass an array of field names to `select()` (e.g. `['id', 'props']`). |
| 44 | 296-299 | `QueryError` (code: `E_QUERY_SELECT_FIELD`) | `` `Unknown select field: ${field}` `` | validation | `E_QUERY_SELECT_FIELD` | Allowed select fields are: `id`, `props`. Remove any unsupported fields. |

---

### LogicalTraversal.js (`src/domain/services/LogicalTraversal.js`)

| # | Line | Error Type | Current Message | Classification | Suggested Code | Suggested Recovery Hint |
|---|---|---|---|---|---|---|
| 45 | 19-22 | `TraversalError` (code: `INVALID_DIRECTION`) | `` `Invalid direction: ${direction}` `` | validation | `E_INVALID_DIRECTION` | Direction must be `'out'`, `'in'`, or `'both'`. |
| 46 | 35-38 | `TraversalError` (code: `INVALID_LABEL_FILTER`) | `'labelFilter must be a string or array'` | validation | `E_INVALID_LABEL_FILTER` | Pass `labelFilter` as a string or array of strings. |
| 47 | 86-89 | `TraversalError` (code: `NODE_NOT_FOUND`) | `` `Start node not found: ${start}` `` | validation | `E_NODE_NOT_FOUND` | The start node does not exist in the materialized graph. Verify the node ID and re-materialize if necessary. |

---

### WarpMessageCodec.js (`src/domain/services/WarpMessageCodec.js`)

These are lower-level encode/decode validation errors. They are thrown during patch/checkpoint message encoding/decoding.

| # | Line | Error Type | Current Message | Classification | Suggested Code | Suggested Recovery Hint |
|---|---|---|---|---|---|---|
| 48 | 107-108 | `Error` | `` `Invalid ${fieldName}: expected string, got ${typeof oid}` `` | validation | `E_INVALID_OID` | Internal: OID field must be a hex string. |
| 49 | 110-111 | `Error` | `` `Invalid ${fieldName}: must be a 40 or 64 character hex string, got '${oid}'` `` | validation | `E_INVALID_OID` | Internal: OID must be a valid 40 or 64 char hex string. |
| 50 | 122-123 | `Error` | `` `Invalid ${fieldName}: expected string, got ${typeof hash}` `` | validation | `E_INVALID_HASH` | Internal: hash field must be a hex string. |
| 51 | 125-126 | `Error` | `` `Invalid ${fieldName}: must be a 64 character hex string, got '${hash}'` `` | validation | `E_INVALID_HASH` | Internal: hash must be a valid 64 char hex string. |
| 52 | 137 | `Error` | `` `Invalid ${fieldName}: must be a positive integer, got ${value}` `` | validation | `E_INVALID_INTEGER` | Internal: field must be a positive integer. |
| 53 | 327 | `Error` | `` `Invalid patch message: eg-kind must be 'patch', got '${kind}'` `` | persistence | `E_CORRUPT_PATCH_MESSAGE` | The commit message has an unexpected kind discriminator. The commit may be corrupted or from a different system. |
| 54 | 333 | `Error` | `'Invalid patch message: missing required trailer eg-graph'` | persistence | `E_CORRUPT_PATCH_MESSAGE` | The patch commit message is missing the `eg-graph` trailer. |
| 55 | 338 | `Error` | `'Invalid patch message: missing required trailer eg-writer'` | persistence | `E_CORRUPT_PATCH_MESSAGE` | The patch commit message is missing the `eg-writer` trailer. |
| 56 | 343 | `Error` | `'Invalid patch message: missing required trailer eg-lamport'` | persistence | `E_CORRUPT_PATCH_MESSAGE` | The patch commit message is missing the `eg-lamport` trailer. |
| 57 | 347 | `Error` | `` `Invalid patch message: eg-lamport must be a positive integer, got '${lamportStr}'` `` | persistence | `E_CORRUPT_PATCH_MESSAGE` | The patch commit has a non-numeric lamport value. |
| 58 | 351 | `Error` | `'Invalid patch message: missing required trailer eg-patch-oid'` | persistence | `E_CORRUPT_PATCH_MESSAGE` | The patch commit message is missing the `eg-patch-oid` trailer. |
| 59 | 357 | `Error` | `'Invalid patch message: missing required trailer eg-schema'` | persistence | `E_CORRUPT_PATCH_MESSAGE` | The patch commit message is missing the `eg-schema` trailer. |
| 60 | 361 | `Error` | `` `Invalid patch message: eg-schema must be a positive integer, got '${schemaStr}'` `` | persistence | `E_CORRUPT_PATCH_MESSAGE` | The patch commit has a non-numeric schema value. |
| 61 | 398 | `Error` | `` `Invalid checkpoint message: eg-kind must be 'checkpoint', got '${kind}'` `` | persistence | `E_CORRUPT_CHECKPOINT_MESSAGE` | The checkpoint commit message has an unexpected kind discriminator. |
| 62 | 404 | `Error` | `'Invalid checkpoint message: missing required trailer eg-graph'` | persistence | `E_CORRUPT_CHECKPOINT_MESSAGE` | The checkpoint commit message is missing the `eg-graph` trailer. |
| 63 | 409 | `Error` | `'Invalid checkpoint message: missing required trailer eg-state-hash'` | persistence | `E_CORRUPT_CHECKPOINT_MESSAGE` | The checkpoint commit is missing the `eg-state-hash` trailer. |
| 64 | 414 | `Error` | `'Invalid checkpoint message: missing required trailer eg-frontier-oid'` | persistence | `E_CORRUPT_CHECKPOINT_MESSAGE` | The checkpoint commit is missing the `eg-frontier-oid` trailer. |
| 65 | 419 | `Error` | `'Invalid checkpoint message: missing required trailer eg-index-oid'` | persistence | `E_CORRUPT_CHECKPOINT_MESSAGE` | The checkpoint commit is missing the `eg-index-oid` trailer. |
| 66 | 425 | `Error` | `'Invalid checkpoint message: missing required trailer eg-schema'` | persistence | `E_CORRUPT_CHECKPOINT_MESSAGE` | The checkpoint commit is missing the `eg-schema` trailer. |
| 67 | 428 | `Error` | `` `Invalid checkpoint message: eg-schema must be a positive integer, got '${schemaStr}'` `` | persistence | `E_CORRUPT_CHECKPOINT_MESSAGE` | The checkpoint commit has a non-numeric schema value. |
| 68 | 466 | `Error` | `` `Invalid anchor message: eg-kind must be 'anchor', got '${kind}'` `` | persistence | `E_CORRUPT_ANCHOR_MESSAGE` | The anchor commit has an unexpected kind discriminator. |
| 69 | 472 | `Error` | `'Invalid anchor message: missing required trailer eg-graph'` | persistence | `E_CORRUPT_ANCHOR_MESSAGE` | The anchor commit is missing the `eg-graph` trailer. |
| 70 | 478 | `Error` | `'Invalid anchor message: missing required trailer eg-schema'` | persistence | `E_CORRUPT_ANCHOR_MESSAGE` | The anchor commit is missing the `eg-schema` trailer. |
| 71 | 481 | `Error` | `` `Invalid anchor message: eg-schema must be a positive integer, got '${schemaStr}'` `` | persistence | `E_CORRUPT_ANCHOR_MESSAGE` | The anchor commit has a non-numeric schema value. |
| 72 | 529-537 | `SchemaUnsupportedError` (code: `E_SCHEMA_UNSUPPORTED`) | `'Upgrade to >=7.3.0 (WEIGHTED) to sync edge properties.'` | protocol | `E_SCHEMA_UNSUPPORTED` | The incoming patch contains edge property ops (schema v3) that this version cannot process. Upgrade to >= 7.3.0. |

---

### RefLayout.js (`src/domain/utils/RefLayout.js`)

These are called by `WarpGraph.open()`, `Writer` constructor, `buildWriterRef()`, etc.

| # | Line | Error Type | Current Message | Classification | Suggested Code | Suggested Recovery Hint |
|---|---|---|---|---|---|---|
| 73 | 69 | `Error` | `` `Invalid graph name: expected string, got ${typeof name}` `` | configuration | `E_INVALID_GRAPH_NAME` | Graph name must be a string. |
| 74 | 73 | `Error` | `'Invalid graph name: cannot be empty'` | configuration | `E_INVALID_GRAPH_NAME` | Graph name cannot be empty. |
| 75 | 77 | `Error` | `` `Invalid graph name: contains path traversal sequence '..': ${name}` `` | configuration | `E_INVALID_GRAPH_NAME` | Graph name cannot contain `..` (path traversal). |
| 76 | 81 | `Error` | `` `Invalid graph name: contains semicolon: ${name}` `` | configuration | `E_INVALID_GRAPH_NAME` | Graph name cannot contain semicolons. |
| 77 | 85 | `Error` | `` `Invalid graph name: contains space: ${name}` `` | configuration | `E_INVALID_GRAPH_NAME` | Graph name cannot contain spaces. |
| 78 | 89 | `Error` | `` `Invalid graph name: contains null byte: ${name}` `` | configuration | `E_INVALID_GRAPH_NAME` | Graph name cannot contain null bytes. |
| 79 | 112 | `Error` | `` `Invalid writer ID: expected string, got ${typeof id}` `` | configuration | `E_INVALID_WRITER_ID` | Writer ID must be a string. |
| 80 | 116 | `Error` | `'Invalid writer ID: cannot be empty'` | configuration | `E_INVALID_WRITER_ID` | Writer ID cannot be empty. |
| 81 | 120-122 | `Error` | `` `Invalid writer ID: exceeds maximum length of ${MAX_WRITER_ID_LENGTH} characters: ${id.length}` `` | configuration | `E_INVALID_WRITER_ID` | Writer ID must be 1-64 characters. |
| 82 | 127 | `Error` | `` `Invalid writer ID: contains path traversal sequence '..': ${id}` `` | configuration | `E_INVALID_WRITER_ID` | Writer ID cannot contain `..` (path traversal). |
| 83 | 132 | `Error` | `` `Invalid writer ID: contains forward slash: ${id}` `` | configuration | `E_INVALID_WRITER_ID` | Writer ID cannot contain `/`. |
| 84 | 137 | `Error` | `` `Invalid writer ID: contains null byte: ${id}` `` | configuration | `E_INVALID_WRITER_ID` | Writer ID cannot contain null bytes. |
| 85 | 142 | `Error` | `` `Invalid writer ID: contains whitespace: ${id}` `` | configuration | `E_INVALID_WRITER_ID` | Writer ID cannot contain whitespace. |
| 86 | 147 | `Error` | `` `Invalid writer ID: contains invalid characters (only [A-Za-z0-9._-] allowed): ${id}` `` | configuration | `E_INVALID_WRITER_ID` | Writer ID must only contain ASCII ref-safe characters: `[A-Za-z0-9._-]`. |

---

### WriterId.js (`src/domain/utils/WriterId.js`)

| # | Line | Error Type | Current Message | Classification | Suggested Code | Suggested Recovery Hint |
|---|---|---|---|---|---|---|
| 87 | 59 | `WriterIdError` (code: `INVALID_TYPE`) | `'writerId must be a string'` | validation | `E_INVALID_WRITER_ID_TYPE` | Writer ID must be a string. |
| 88 | 62 | `WriterIdError` (code: `INVALID_CANONICAL`) | `` `writerId is not canonical: ${id}` `` | validation | `E_INVALID_CANONICAL_WRITER_ID` | Writer ID must be in canonical format: `w_` prefix followed by 26 Crockford Base32 characters. |
| 89 | 80 | `WriterIdError` (code: `CSPRNG_UNAVAILABLE`) | `'No secure random generator available'` | configuration | `E_CSPRNG_UNAVAILABLE` | No CSPRNG is available in this environment. Ensure `globalThis.crypto.getRandomValues` is accessible or provide a custom `randomBytes` function. |
| 90 | 137 | `WriterIdError` (code: `CSPRNG_UNAVAILABLE`) | `'randomBytes() must return Uint8Array(16)'` | configuration | `E_CSPRNG_INVALID` | The custom `randomBytes` function must return a `Uint8Array` of length 16. |
| 91 | 181 | `WriterIdError` (code: `CONFIG_READ_FAILED`) | `` `Failed to read git config key ${key}` `` | persistence | `E_CONFIG_READ_FAILED` | Git config read failed. Check that the repository is valid and accessible. |
| 92 | 201 | `WriterIdError` (code: `CONFIG_WRITE_FAILED`) | `` `Failed to persist writerId to git config key ${key}` `` | persistence | `E_CONFIG_WRITE_FAILED` | Git config write failed. Check file permissions and that the repository is not read-only. |

---

### cancellation.js (`src/domain/utils/cancellation.js`)

| # | Line | Error Type | Current Message | Classification | Suggested Code | Suggested Recovery Hint |
|---|---|---|---|---|---|---|
| 93 | 17-18 | `OperationAbortedError` | `` `Operation '${operation}' aborted: Operation was aborted` `` | concurrency | `E_OPERATION_ABORTED` | The operation was cancelled via an AbortSignal. This is usually intentional. |

---

## Classification Summary

| Classification | Count | Description |
|---|---|---|
| **never-materialized** | 4 | State is null because `materialize()` was never called |
| **stale-after-write** | 1 | State is dirty because a local write happened (note: `E_STALE_STATE` covers both write and sync scenarios) |
| **configuration** | 20 | Invalid options/arguments passed to `open()`, validators, or other setup |
| **validation** | 16 | Invalid arguments to operations (bad nodeId, empty patch, wrong types) |
| **persistence** | 18 | Git operations failed, corrupt commit messages, missing tree entries |
| **concurrency** | 7 | CAS failures, race conditions, aborted operations, writer forks |
| **protocol** | 8 | Sync protocol errors (timeout, network, invalid responses, schema compat) |

### Error Code Namespace Plan

All suggested codes use the `E_` prefix for easy programmatic matching. Proposed groupings:

| Prefix | Domain |
|---|---|
| `E_NO_STATE` / `E_STALE_STATE` | Materialization lifecycle |
| `E_INVALID_*` | Input validation (graph name, writer ID, arguments) |
| `E_EMPTY_PATCH` / `E_EDGE_NOT_FOUND` / `E_SESSION_COMMITTED` | Patch building validation |
| `E_CONCURRENT_COMMIT` / `E_WRITER_REF_ADVANCED` / `E_WRITER_FORK` | Write concurrency |
| `E_SYNC_*` | Sync protocol |
| `E_CORRUPT_*` / `E_CHECKPOINT_*` | Data integrity / persistence |
| `E_MISSING_PERSISTENCE` / `E_MIGRATION_REQUIRED` / `E_CSPRNG_*` | Configuration / environment |
| `E_QUERY_*` | Query builder validation |
| `E_NODE_NOT_FOUND` / `E_INVALID_DIRECTION` / `E_INVALID_LABEL_FILTER` | Traversal validation |
| `E_SCHEMA_UNSUPPORTED` | Schema version compatibility |
| `E_OPERATION_ABORTED` | Cancellation |
| `E_CONFIG_*` / `E_PERSIST_WRITE_FAILED` | Git adapter failures |

---

## Notes for HS/ERR/2

1. **Many errors currently use bare `Error`** -- 56 of 93 throw sites use `new Error(...)` with no structured code. The top priority for HS/ERR/2 is converting these to domain-specific error types with machine-readable `.code` fields.

2. **The `_ensureFreshState` guard** (lines 1754-1768 of WarpGraph.js) is the single most important error site for developer experience, since it gates ALL query methods. The `E_NO_STATE` / `E_STALE_STATE` distinction is already good; the recovery hints should be surfaced prominently.

3. **WarpMessageCodec decode errors** (entries 53-71) are all bare `Error` throws inside decode functions. These are often caught internally (e.g., `_loadLatestCheckpoint` swallows errors, `_nextLamport` re-throws with context). They should still get proper error codes for cases where they bubble up.

4. **RefLayout validation** (entries 73-86) produces 14 separate `throw new Error(...)` calls. These could be consolidated into a single `ValidationError` with a `.code` field and `.context` carrying the invalid value and reason.

5. **PatchSession wraps PatchBuilderV2 errors** into `WriterError`. This pattern is good but creates two parallel error paths for "empty patch" and "concurrent commit". HS/ERR/2 should unify the codes.

6. **SyncProtocol's `loadPatchRange` divergence error** (entry 30) is caught and silently skipped in `processSyncRequest`. Consider whether this should log or surface to the caller.
