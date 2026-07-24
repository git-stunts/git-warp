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

First-use product API: one `Runtime` value plus Lane, Intent, Observer, Observation, Reading, and Receipt types.

### Value exports

Source: `index.ts`. Count: 1.

```text
Runtime @ index.ts#L13
```

### Type exports

Source: `index.ts`. Count: 24.

```text
AdmissionOutcome @ index.ts#L38
CoordinateReference @ index.ts#L19
Evidence @ index.ts#L15
EvidenceHandle @ index.ts#L15
Intent @ index.ts#L16
Lane @ index.ts#L17
LaneDescriptor @ index.ts#L20
LaneKind @ index.ts#L21
LaneReference @ index.ts#L22
Observation @ index.ts#L24
ObservationReceipt @ index.ts#L25
ObservationStatus @ index.ts#L26
Observer @ index.ts#L27
ObserverCardinality @ index.ts#L28
Reading @ index.ts#L29
ReadingCoordinate @ index.ts#L31
ReadingValue @ index.ts#L32
Receipt @ index.ts#L39
RepairHint @ index.ts#L40
RuntimeOpenOptions @ index.ts#L14
SupportReport @ index.ts#L33
Tick @ index.ts#L36
WitnessReference @ index.ts#L34
WriteReceipt @ index.ts#L37
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
