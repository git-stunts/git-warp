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

Source: `index.ts`. Count: 40.

```text
AdmissionOutcome @ index.ts#L60
CoordinateReference @ index.ts#L25
EntityAdmission @ index.ts#L52
EntityAdmissionInitialProperties @ index.ts#L53
EntityAdmissionInventoryCertificate @ index.ts#L59
EntityAdmissionOccurrenceReference @ index.ts#L54
EntityAdmissionOrdering @ index.ts#L55
EntityAdmissionOriginReading @ index.ts#L56
EntityAdmissionRepresentationReference @ index.ts#L57
EntityCausalRelation @ index.ts#L49
EntityOccurrence @ index.ts#L48
Evidence @ index.ts#L20
EvidenceHandle @ index.ts#L20
Intent @ index.ts#L21
Lane @ index.ts#L23
LaneDescriptor @ index.ts#L26
LaneKind @ index.ts#L27
LaneReference @ index.ts#L28
Observation @ index.ts#L30
ObservationReceipt @ index.ts#L31
ObservationStatus @ index.ts#L32
Observer @ index.ts#L33
ObserverCardinality @ index.ts#L34
Reading @ index.ts#L35
ReadingCoordinate @ index.ts#L37
ReadingValue @ index.ts#L38
Receipt @ index.ts#L61
RepairHint @ index.ts#L62
RuntimeForkOptions @ index.ts#L15
RuntimeOpenOptions @ index.ts#L16
RuntimeSettlementOptions @ index.ts#L17
RuntimeStrandOptions @ index.ts#L18
SettlementPlan @ index.ts#L45
SettlementPreview @ index.ts#L43
SettlementReceipt @ index.ts#L44
SupportReport @ index.ts#L39
Tick @ index.ts#L42
WitnessReference @ index.ts#L40
WriteIntentInput @ index.ts#L22
WriteReceipt @ index.ts#L46
```

## Advanced export surface

Bounded formal reads and runtime-backed construction for generated SDK infrastructure.

### Value exports

Source: `advanced.ts`. Count: 9.

```text
captureCoordinate @ advanced.ts#L9
Coordinate @ advanced.ts#L10
createEntityAdmissionInventoryObserver @ advanced.ts#L18
createManyObserver @ advanced.ts#L15
createObserver @ advanced.ts#L16
intent @ advanced.ts#L12
Optic @ advanced.ts#L11
reading @ advanced.ts#L13
requireEntityAdmissionInventoryCertificate @ advanced.ts#L19
```

### Type exports

Source: `advanced.ts`. Count: 10.

```text
NeighborhoodOpticCompleteness @ advanced.ts#L23
NeighborhoodOpticEdge @ advanced.ts#L24
NeighborhoodOpticReadDirection @ advanced.ts#L25
NeighborhoodOpticReadOptions @ advanced.ts#L21
ReadIdentityFrontierEntry @ advanced.ts#L29
ReadIdentityIndexShard @ advanced.ts#L30
ReadIdentityOptions @ advanced.ts#L31
ReadIdentityTailWitness @ advanced.ts#L32
WarpWorldlineCoordinateFrontierEntry @ advanced.ts#L20
Witness @ advanced.ts#L28
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

Source: `bin/git-warp.ts#L228`.

## Public error classes

The v19 package root does not export error constructors.
