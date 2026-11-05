# Source-backed reference

This page is generated from source code. Do not edit the inventories by hand;
run `node scripts/check-source-backed-reference.ts --write` after changing a
public API export, CLI command, package entrypoint, or public error class.

## Package entrypoints

| Surface | Name | Target | Source |
| --- | --- | --- | --- |
| npm bin | `git-warp` | `./bin/git-warp` | `package.json#L23` |
| npm bin | `git-warp-v18-to-v19` | `./dist/scripts/v18-to-v19/migrate.js` | `package.json#L24` |
| npm bin | `git-warp-v20-to-v21` | `./dist/scripts/v20-to-v21/migrate.js` | `package.json#L25` |
| npm export | `.` | `types=./dist/index.d.ts; import=./dist/index.js; default=./dist/index.js` | `package.json#L28` |
| npm export | `./advanced` | `types=./dist/advanced.d.ts; import=./dist/advanced.js; default=./dist/advanced.js` | `package.json#L33` |
| npm export | `./diagnostics` | `types=./dist/diagnostics.d.ts; import=./dist/diagnostics.js; default=./dist/diagnostics.js` | `package.json#L38` |
| npm export | `./charts` | `types=./dist/charts.d.ts; import=./dist/charts.js; default=./dist/charts.js` | `package.json#L43` |
| npm export | `./testing` | `types=./dist/testing.d.ts; import=./dist/testing.js; default=./dist/testing.js` | `package.json#L48` |
| npm export | `./package.json` | `./package.json` | `package.json#L53` |
| JSR export | `.` | `./index.ts` | `jsr.json#L8` |
| JSR export | `./advanced` | `./advanced.ts` | `jsr.json#L9` |
| JSR export | `./diagnostics` | `./diagnostics.ts` | `jsr.json#L10` |
| JSR export | `./charts` | `./charts.ts` | `jsr.json#L11` |
| JSR export | `./testing` | `./testing.ts` | `jsr.json#L12` |

## Root API export surface

First-use product API: the `Warp` write surface and its receipts beside the legacy `Runtime` value, plus Lane, Intent, Observer, Observation, Reading, and Receipt types.

### Value exports

Source: `index.ts`. Count: 18.

```text
Coordinate @ index.ts#L36
GitStorage @ index.ts#L30
IndeterminateWriteReceipt @ index.ts#L40
ObserverIdentity @ index.ts#L21
Optic @ index.ts#L18
OpticReceipt @ index.ts#L26
Purpose @ index.ts#L22
ReadBudget @ index.ts#L23
RetainedWriteReceipt @ index.ts#L37
Runtime @ index.ts#L14
UnpublishedWriteReceipt @ index.ts#L39
UnretainedWriteReceipt @ index.ts#L38
Warp @ index.ts#L15
WarpAccessDenied @ index.ts#L34
WarpAccessPort @ index.ts#L31
WarpAddress @ index.ts#L17
WarpReadGrant @ index.ts#L24
WarpWriteGrant @ index.ts#L32
```

### Type exports

Source: `index.ts`. Count: 60.

```text
AdmissionOutcome @ index.ts#L95
AuthoredWarp @ index.ts#L16
AuthoredWriteReceipt @ index.ts#L41
ContentAttachment @ index.ts#L99
ContentInput @ index.ts#L56
ContentMetadataInput @ index.ts#L57
ContentOwnerDescriptor @ index.ts#L100
CoordinateReference @ index.ts#L60
EntityAdmission @ index.ts#L87
EntityAdmissionInitialProperties @ index.ts#L88
EntityAdmissionInventoryCertificate @ index.ts#L94
EntityAdmissionOccurrenceReference @ index.ts#L89
EntityAdmissionOrdering @ index.ts#L90
EntityAdmissionOriginReading @ index.ts#L91
EntityAdmissionRepresentationReference @ index.ts#L92
EntityCausalRelation @ index.ts#L84
EntityOccurrence @ index.ts#L83
Evidence @ index.ts#L52
EvidenceHandle @ index.ts#L52
Intent @ index.ts#L53
Lane @ index.ts#L55
LaneDescriptor @ index.ts#L61
LaneKind @ index.ts#L62
LaneReference @ index.ts#L63
Observation @ index.ts#L65
ObservationReceipt @ index.ts#L66
ObservationStatus @ index.ts#L67
ObservedWarp @ index.ts#L20
Observer @ index.ts#L68
ObserverCardinality @ index.ts#L69
OpticObservation @ index.ts#L28
OpticQuery @ index.ts#L19
OpticReading @ index.ts#L29
OpticReceiptStatus @ index.ts#L27
Reading @ index.ts#L70
ReadingCoordinate @ index.ts#L72
ReadingValue @ index.ts#L73
Receipt @ index.ts#L96
RepairHint @ index.ts#L97
RuntimeForkOptions @ index.ts#L47
RuntimeOpenOptions @ index.ts#L48
RuntimeSettlementOptions @ index.ts#L49
RuntimeStrandOptions @ index.ts#L50
SettlementPlan @ index.ts#L80
SettlementPreview @ index.ts#L78
SettlementReceipt @ index.ts#L79
StagedContent @ index.ts#L58
SupportReport @ index.ts#L74
Tick @ index.ts#L77
WarpReadRequest @ index.ts#L25
WarpWriteBudget @ index.ts#L33
WarpWriteRequest @ index.ts#L35
WitnessReference @ index.ts#L75
WriteAdmission @ index.ts#L42
WriteAdmissionKind @ index.ts#L42
WriteIntentInput @ index.ts#L54
WriteOccurrence @ index.ts#L43
WritePublication @ index.ts#L44
WriteRace @ index.ts#L45
WriteReceipt @ index.ts#L81
```

## Advanced export surface

Bounded formal reads and runtime-backed construction for generated SDK infrastructure.

### Value exports

Source: `advanced.ts`. Count: 11.

```text
captureCoordinate @ advanced.ts#L9
Coordinate @ advanced.ts#L10
createEdgeContentObserver @ advanced.ts#L35
createEntityAdmissionInventoryObserver @ advanced.ts#L18
createManyObserver @ advanced.ts#L15
createNodeContentObserver @ advanced.ts#L35
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
| `write` | `handleWrite` | `bin/cli/commands/registry.ts#L37` |
| `observe` | `handleObserve` | `bin/cli/commands/registry.ts#L38` |
| `fork` | `handleFork` | `bin/cli/commands/registry.ts#L39` |
| `settle` | `handleSettle` | `bin/cli/commands/registry.ts#L40` |
| `receipt` | `handleReceipt` | `bin/cli/commands/registry.ts#L41` |
| `doctor` | `handleDoctor` | `bin/cli/commands/registry.ts#L42` |
| `repair` | `handleRepair` | `bin/cli/commands/registry.ts#L43` |
| `audit` | `handleAudit` | `bin/cli/commands/registry.ts#L44` |
| `mcp` | `handleMcp` | `bin/cli/commands/registry.ts#L45` |

Structured CLI errors retain `{ error: { code, message, cause? } }`.
Additive `typedCode`, bounded `causes`, and `truncated` fields preserve typed
diagnostics without dumping raw metadata. The CLI failure codec owns encoding.

Source: `src/infrastructure/adapters/CliFailureCodecAdapter.ts#L37`.

## Public error classes

The v19 package root does not export error constructors.
