# Source-backed reference

This page is generated from source code. Do not edit the inventories by hand;
run `node scripts/check-source-backed-reference.ts --write` after changing a
public API export, CLI command, package entrypoint, or public error class.

## Package entrypoints

| Surface | Name | Target | Source |
| --- | --- | --- | --- |
| npm bin | `warp-graph` | `./dist/bin/warp-graph.js` | `package.json#L23` |
| npm bin | `git-warp` | `./bin/git-warp` | `package.json#L24` |
| npm bin | `git-warp-v18-to-v19` | `./dist/scripts/v18-to-v19/migrate.js` | `package.json#L25` |
| npm export | `.` | `types=./dist/index.d.ts; import=./dist/index.js; default=./dist/index.js` | `package.json#L28` |
| npm export | `./storage` | `types=./dist/storage.d.ts; import=./dist/storage.js; default=./dist/storage.js` | `package.json#L33` |
| npm export | `./advanced` | `types=./dist/advanced.d.ts; import=./dist/advanced.js; default=./dist/advanced.js` | `package.json#L38` |
| npm export | `./diagnostics` | `types=./dist/diagnostics.d.ts; import=./dist/diagnostics.js; default=./dist/diagnostics.js` | `package.json#L43` |
| npm export | `./charts` | `types=./dist/charts.d.ts; import=./dist/charts.js; default=./dist/charts.js` | `package.json#L48` |
| npm export | `./testing` | `types=./dist/testing.d.ts; import=./dist/testing.js; default=./dist/testing.js` | `package.json#L53` |
| npm export | `./package.json` | `./package.json` | `package.json#L58` |
| JSR export | `.` | `./index.ts` | `jsr.json#L8` |
| JSR export | `./storage` | `./storage.ts` | `jsr.json#L9` |
| JSR export | `./advanced` | `./advanced.ts` | `jsr.json#L10` |
| JSR export | `./diagnostics` | `./diagnostics.ts` | `jsr.json#L11` |
| JSR export | `./charts` | `./charts.ts` | `jsr.json#L12` |
| JSR export | `./testing` | `./testing.ts` | `jsr.json#L13` |

## Root API export surface

First-use product API: one `Runtime` value plus Lane, Intent, Observer, Observation, Reading, and Receipt types.

### Value exports

Source: `index.ts`. Count: 1.

```text
Runtime @ index.ts#L13
```

### Type exports

Source: `index.ts`. Count: 29.

```text
AdmissionOutcome @ index.ts#L45
CoordinateReference @ index.ts#L23
Evidence @ index.ts#L19
EvidenceHandle @ index.ts#L19
Intent @ index.ts#L20
Lane @ index.ts#L21
LaneDescriptor @ index.ts#L24
LaneKind @ index.ts#L25
LaneReference @ index.ts#L26
Observation @ index.ts#L28
ObservationReceipt @ index.ts#L29
ObservationStatus @ index.ts#L30
Observer @ index.ts#L31
ObserverCardinality @ index.ts#L32
Reading @ index.ts#L33
ReadingCoordinate @ index.ts#L35
ReadingValue @ index.ts#L36
Receipt @ index.ts#L46
RepairHint @ index.ts#L47
RuntimeForkOptions @ index.ts#L15
RuntimeOpenOptions @ index.ts#L16
RuntimeSettlementOptions @ index.ts#L17
SettlementPlan @ index.ts#L43
SettlementPreview @ index.ts#L41
SettlementReceipt @ index.ts#L42
SupportReport @ index.ts#L37
Tick @ index.ts#L40
WitnessReference @ index.ts#L38
WriteReceipt @ index.ts#L44
```

## Storage export surface

Transitional explicit storage composition; first-use applications use `Runtime.open()`.

### Value exports

Source: `storage.ts`. Count: 1.

```text
GitStorage @ storage.ts#L3
```

### Type exports

Source: `storage.ts`. Count: 1.

```text
GitStorageOptions @ storage.ts#L4
```

## Advanced export surface

Bounded formal reads and runtime-backed construction for generated SDK infrastructure.

### Value exports

Source: `advanced.ts`. Count: 7.

```text
captureCoordinate @ advanced.ts#L9
Coordinate @ advanced.ts#L10
createManyObserver @ advanced.ts#L15
createObserver @ advanced.ts#L16
intent @ advanced.ts#L12
Optic @ advanced.ts#L11
reading @ advanced.ts#L13
```

### Type exports

Source: `advanced.ts`. Count: 10.

```text
NeighborhoodOpticCompleteness @ advanced.ts#L21
NeighborhoodOpticEdge @ advanced.ts#L22
NeighborhoodOpticReadDirection @ advanced.ts#L23
NeighborhoodOpticReadOptions @ advanced.ts#L19
ReadIdentityFrontierEntry @ advanced.ts#L27
ReadIdentityIndexShard @ advanced.ts#L28
ReadIdentityOptions @ advanced.ts#L29
ReadIdentityTailWitness @ advanced.ts#L30
WarpWorldlineCoordinateFrontierEntry @ advanced.ts#L18
Witness @ advanced.ts#L26
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

## Charts export surface

Bounded graph-shaped derived Observers and Reading values.

### Value exports

Source: `charts.ts`. Count: 3.

```text
graph @ charts.ts#L9
GraphNeighborhoodChart @ charts.ts#L10
GraphNeighborhoodEdge @ charts.ts#L11
```

### Type exports

Source: `charts.ts`. Count: 4.

```text
GraphChartObservers @ charts.ts#L13
GraphNeighborhoodChartOptions @ charts.ts#L16
GraphNeighborhoodEdgeOptions @ charts.ts#L17
GraphNeighborhoodOptions @ charts.ts#L14
```

## Testing export surface

Disposable real-Git Runtime harnesses for consumer tests.

### Value exports

Source: `testing.ts`. Count: 2.

```text
createRuntimeHarness @ testing.ts#L17
createRuntimeHarnessWithHost @ testing.ts#L23
```

### Type exports

Source: `testing.ts`. Count: 3.

```text
RuntimeHarness @ testing.ts#L25
RuntimeHarnessHost @ testing.ts#L26
RuntimeHarnessOptions @ testing.ts#L27
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
