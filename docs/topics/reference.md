# Source-backed reference

This page is generated from source code. Do not edit the inventories by hand;
run `node scripts/check-source-backed-reference.ts --write` after changing a
public API export, CLI command, package entrypoint, or public error class.

## Package entrypoints

| Surface | Name | Target | Source |
| --- | --- | --- | --- |
| npm bin | `warp-graph` | `./dist/bin/warp-graph.js` | `package.json#L23` |
| npm bin | `git-warp` | `./bin/git-warp` | `package.json#L24` |
| npm export | `.` | `types=./dist/index.d.ts; import=./dist/index.js; default=./dist/index.js` | `package.json#L27` |
| npm export | `./storage` | `types=./dist/storage.d.ts; import=./dist/storage.js; default=./dist/storage.js` | `package.json#L32` |
| npm export | `./advanced` | `types=./dist/advanced.d.ts; import=./dist/advanced.js; default=./dist/advanced.js` | `package.json#L37` |
| npm export | `./diagnostics` | `types=./dist/diagnostics.d.ts; import=./dist/diagnostics.js; default=./dist/diagnostics.js` | `package.json#L42` |
| npm export | `./package.json` | `./package.json` | `package.json#L47` |
| JSR export | `.` | `./index.ts` | `jsr.json#L8` |
| JSR export | `./storage` | `./storage.ts` | `jsr.json#L9` |
| JSR export | `./advanced` | `./advanced.ts` | `jsr.json#L10` |
| JSR export | `./diagnostics` | `./diagnostics.ts` | `jsr.json#L11` |

## Root API export surface

First-use product API: `openWarp`, `intent`, `reading`, timelines, and receipts.

### Value exports

Source: `index.ts`. Count: 3.

```text
intent @ index.ts#L14
openWarp @ index.ts#L13
reading @ index.ts#L15
```

### Type exports

Source: `index.ts`. Count: 43.

```text
DraftTimeline @ index.ts#L16
EdgeIntentFields @ index.ts#L30
Intent @ index.ts#L21
IntentBuilders @ index.ts#L36
IntentDescriptor @ index.ts#L31
IntentKind @ index.ts#L32
JoinMode @ index.ts#L37
JoinOptions @ index.ts#L39
JoinOutcome @ index.ts#L53
JoinPolicy @ index.ts#L39
JoinReceipt @ index.ts#L22
JoinReceiptOptions @ index.ts#L37
JoinResult @ index.ts#L23
JoinResultOptions @ index.ts#L38
NeighborhoodReadingFields @ index.ts#L41
NodeIntentFields @ index.ts#L33
NodeReadingFields @ index.ts#L42
OpenWarpOptions @ index.ts#L28
PropertyIntentFields @ index.ts#L34
PropertyReadingFields @ index.ts#L43
ReadEvidence @ index.ts#L51
Reading @ index.ts#L24
ReadingBuilders @ index.ts#L48
ReadingDescriptor @ index.ts#L45
ReadingDirection @ index.ts#L44
ReadingKind @ index.ts#L46
ReadingResult @ index.ts#L25
ReadingResultOptions @ index.ts#L49
ReadingValue @ index.ts#L49
ReadOutcome @ index.ts#L54
ReadReceipt @ index.ts#L26
ReadReceiptOptions @ index.ts#L51
Receipt @ index.ts#L50
ReceiptOutcome @ index.ts#L55
RepairHint @ index.ts#L58
StorageAdapter @ index.ts#L28
Tick @ index.ts#L19
Timeline @ index.ts#L18
TimelineView @ index.ts#L20
Warp @ index.ts#L17
WriteOutcome @ index.ts#L56
WriteReceipt @ index.ts#L27
WriteReceiptOptions @ index.ts#L59
```

## Storage export surface

Git-backed and in-memory adapters for first-use applications.

### Value exports

Source: `storage.ts`. Count: 2.

```text
GitStorageAdapter @ storage.ts#L15
MemoryStorageAdapter @ storage.ts#L21
```

### Type exports

Source: `storage.ts`. Count: 1.

```text
GitStorageAdapterOptions @ storage.ts#L13
```

## Advanced export surface

Bounded coordinate capture, Optic, and Witness concepts for expert use.

### Value exports

Source: `advanced.ts`. Count: 3.

```text
captureCoordinate @ advanced.ts#L9
Coordinate @ advanced.ts#L10
Optic @ advanced.ts#L11
```

### Type exports

Source: `advanced.ts`. Count: 10.

```text
NeighborhoodOpticCompleteness @ advanced.ts#L15
NeighborhoodOpticEdge @ advanced.ts#L16
NeighborhoodOpticReadDirection @ advanced.ts#L17
NeighborhoodOpticReadOptions @ advanced.ts#L13
ReadIdentityFrontierEntry @ advanced.ts#L21
ReadIdentityIndexShard @ advanced.ts#L22
ReadIdentityOptions @ advanced.ts#L23
ReadIdentityTailWitness @ advanced.ts#L24
WarpWorldlineCoordinateFrontierEntry @ advanced.ts#L12
Witness @ advanced.ts#L20
```

## Diagnostics export surface

Operator inspection helpers that consume public receipt handles.

### Value exports

Source: `diagnostics.ts`. Count: 1.

```text
inspectReceipt @ diagnostics.ts#L17
```

### Type exports

Source: `diagnostics.ts`. Count: 1.

```text
ReceiptInspection @ diagnostics.ts#L7
```

## CLI command registry

| Command | Handler | Source |
| --- | --- | --- |
| `info` | `handleInfo` | `bin/cli/commands/registry.ts#L42` |
| `check` | `handleCheck` | `bin/cli/commands/registry.ts#L43` |
| `doctor` | `handleDoctor` | `bin/cli/commands/registry.ts#L44` |
| `materialize` | `handleMaterialize` | `bin/cli/commands/registry.ts#L45` |
| `seek` | `handleSeek` | `bin/cli/commands/registry.ts#L46` |
| `query` | `handleQuery` | `bin/cli/commands/registry.ts#L47` |
| `path` | `handlePath` | `bin/cli/commands/registry.ts#L48` |
| `optic` | `handleOptic` | `bin/cli/commands/registry.ts#L49` |
| `history` | `handleHistory` | `bin/cli/commands/registry.ts#L50` |
| `debug` | `handleDebug` | `bin/cli/commands/registry.ts#L51` |
| `strand` | `handleStrand` | `bin/cli/commands/registry.ts#L52` |
| `verify-audit` | `handleVerifyAudit` | `bin/cli/commands/registry.ts#L53` |
| `verify-index` | `handleVerifyIndex` | `bin/cli/commands/registry.ts#L54` |
| `reindex` | `handleReindex` | `bin/cli/commands/registry.ts#L55` |
| `trust` | `handleTrust` | `bin/cli/commands/registry.ts#L56` |
| `patch` | `handlePatch` | `bin/cli/commands/registry.ts#L57` |
| `tree` | `handleTree` | `bin/cli/commands/registry.ts#L58` |
| `bisect` | `handleBisect` | `bin/cli/commands/registry.ts#L59` |
| `install-hooks` | `handleInstallHooks` | `bin/cli/commands/registry.ts#L60` |
| `mcp` | `handleMcp` | `bin/cli/commands/registry.ts#L61` |
| `sync` | `handleSync` | `bin/cli/commands/registry.ts#L62` |
| `serve` | `handleServe` | `bin/cli/commands/registry.ts#L63` |
| `fork` | `handleFork` | `bin/cli/commands/registry.ts#L64` |
| `checkpoint` | `handleCheckpoint` | `bin/cli/commands/registry.ts#L65` |
| `gc` | `handleGc` | `bin/cli/commands/registry.ts#L66` |
| `watch` | `handleWatch` | `bin/cli/commands/registry.ts#L67` |

Structured CLI errors for `--json` and `--ndjson` use the payload shape
`{ error: { code, message, cause? } }` from the CLI entry point.

Source: `bin/warp-graph.ts#L132`.

## Public error classes

The v19 package root does not export error constructors.
