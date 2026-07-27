# Source-backed reference

This page is generated from source code. Do not edit the inventories by hand;
run `node scripts/check-source-backed-reference.ts --write` after changing a
public API export, CLI command, package entrypoint, or public error class.

## Package entrypoints

| Surface | Name | Target | Source |
| --- | --- | --- | --- |
| npm bin | `git-warp` | `./bin/git-warp` | `package.json#L23` |
| npm bin | `git-warp-v18-to-v19` | `./dist/scripts/v18-to-v19/migrate.js` | `package.json#L24` |
| npm export | `.` | `types=./dist/index.d.ts; import=./dist/index.js; default=./dist/index.js` | `package.json#L27` |
| npm export | `./advanced` | `types=./dist/advanced.d.ts; import=./dist/advanced.js; default=./dist/advanced.js` | `package.json#L32` |
| npm export | `./diagnostics` | `types=./dist/diagnostics.d.ts; import=./dist/diagnostics.js; default=./dist/diagnostics.js` | `package.json#L37` |
| npm export | `./charts` | `types=./dist/charts.d.ts; import=./dist/charts.js; default=./dist/charts.js` | `package.json#L42` |
| npm export | `./testing` | `types=./dist/testing.d.ts; import=./dist/testing.js; default=./dist/testing.js` | `package.json#L47` |
| npm export | `./package.json` | `./package.json` | `package.json#L52` |
| JSR export | `.` | `./index.ts` | `jsr.json#L8` |
| JSR export | `./advanced` | `./advanced.ts` | `jsr.json#L9` |
| JSR export | `./diagnostics` | `./diagnostics.ts` | `jsr.json#L10` |
| JSR export | `./charts` | `./charts.ts` | `jsr.json#L11` |
| JSR export | `./testing` | `./testing.ts` | `jsr.json#L12` |

## Root API export surface

First-use product API: one `Runtime` value plus Lane, Intent, Observer, Observation, Reading, and Receipt types.

### Value exports

Source: `index.ts`. Count: 1.

```text
Runtime @ index.ts#L13
```

### Type exports

Source: `index.ts`. Count: 30.

```text
AdmissionOutcome @ index.ts#L46
CoordinateReference @ index.ts#L24
Evidence @ index.ts#L20
EvidenceHandle @ index.ts#L20
Intent @ index.ts#L21
Lane @ index.ts#L22
LaneDescriptor @ index.ts#L25
LaneKind @ index.ts#L26
LaneReference @ index.ts#L27
Observation @ index.ts#L29
ObservationReceipt @ index.ts#L30
ObservationStatus @ index.ts#L31
Observer @ index.ts#L32
ObserverCardinality @ index.ts#L33
Reading @ index.ts#L34
ReadingCoordinate @ index.ts#L36
ReadingValue @ index.ts#L37
Receipt @ index.ts#L47
RepairHint @ index.ts#L48
RuntimeForkOptions @ index.ts#L15
RuntimeOpenOptions @ index.ts#L16
RuntimeSettlementOptions @ index.ts#L17
RuntimeStrandOptions @ index.ts#L18
SettlementPlan @ index.ts#L44
SettlementPreview @ index.ts#L42
SettlementReceipt @ index.ts#L43
SupportReport @ index.ts#L38
Tick @ index.ts#L41
WitnessReference @ index.ts#L39
WriteReceipt @ index.ts#L45
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
inspectReceipt @ diagnostics.ts#L35
```

### Type exports

Source: `diagnostics.ts`. Count: 2.

```text
ReceiptInspection @ diagnostics.ts#L24
ReceiptSubstrateInspection @ diagnostics.ts#L10
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
| `write` | `handleWrite` | `bin/cli/commands/registry.ts#L24` |
| `observe` | `handleObserve` | `bin/cli/commands/registry.ts#L25` |
| `fork` | `handleFork` | `bin/cli/commands/registry.ts#L26` |
| `settle` | `handleSettle` | `bin/cli/commands/registry.ts#L27` |
| `receipt` | `handleReceipt` | `bin/cli/commands/registry.ts#L28` |
| `doctor` | `handleDoctor` | `bin/cli/commands/registry.ts#L29` |
| `repair` | `handleRepair` | `bin/cli/commands/registry.ts#L30` |
| `audit` | `handleAudit` | `bin/cli/commands/registry.ts#L31` |
| `mcp` | `handleMcp` | `bin/cli/commands/registry.ts#L32` |

Structured CLI errors for `--json` and `--jsonl` use the payload shape
`{ error: { code, message, cause? } }` from the CLI entry point.

Source: `bin/git-warp.ts#L211`.

## Public error classes

The v19 package root does not export error constructors.
