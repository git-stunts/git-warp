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
intent @ index.ts#L15
openWarp @ index.ts#L14
reading @ index.ts#L16
```

### Type exports

Source: `index.ts`. Count: 44.

```text
DraftTimeline @ index.ts#L17
EdgeIntentFields @ index.ts#L33
Evidence @ index.ts#L22
EvidenceHandle @ index.ts#L22
Intent @ index.ts#L23
IntentBuilders @ index.ts#L39
IntentDescriptor @ index.ts#L34
IntentKind @ index.ts#L35
JoinMode @ index.ts#L40
JoinOptions @ index.ts#L42
JoinOutcome @ index.ts#L56
JoinPolicy @ index.ts#L42
JoinReceipt @ index.ts#L24
JoinReceiptOptions @ index.ts#L40
JoinResult @ index.ts#L25
JoinResultOptions @ index.ts#L41
NeighborhoodReadingFields @ index.ts#L44
NodeIntentFields @ index.ts#L36
NodeReadingFields @ index.ts#L45
OpenWarpOptions @ index.ts#L30
PropertyIntentFields @ index.ts#L37
PropertyReadingFields @ index.ts#L46
Reading @ index.ts#L26
ReadingBuilders @ index.ts#L51
ReadingDescriptor @ index.ts#L48
ReadingDirection @ index.ts#L47
ReadingKind @ index.ts#L49
ReadingResult @ index.ts#L27
ReadingResultOptions @ index.ts#L52
ReadingValue @ index.ts#L52
ReadOutcome @ index.ts#L57
ReadReceipt @ index.ts#L28
ReadReceiptOptions @ index.ts#L54
Receipt @ index.ts#L53
ReceiptOutcome @ index.ts#L58
RepairHint @ index.ts#L61
Tick @ index.ts#L20
Timeline @ index.ts#L19
TimelineView @ index.ts#L21
Warp @ index.ts#L18
WarpStorage @ index.ts#L31
WriteOutcome @ index.ts#L59
WriteReceipt @ index.ts#L29
WriteReceiptOptions @ index.ts#L62
```

## Storage export surface

Git-backed storage for first-use applications.

### Value exports

Source: `storage.ts`. Count: 1.

```text
GitStorage @ storage.ts#L38
```

### Type exports

Source: `storage.ts`. Count: 1.

```text
GitStorageOptions @ storage.ts#L12
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
inspectReceipt @ diagnostics.ts#L40
```

### Type exports

Source: `diagnostics.ts`. Count: 3.

```text
InspectReceiptOptions @ diagnostics.ts#L11
ReceiptInspection @ diagnostics.ts#L29
ReceiptSubstrateInspection @ diagnostics.ts#L15
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

Source: `bin/warp-graph.ts#L179`.

## Public error classes

The v19 package root does not export error constructors.
