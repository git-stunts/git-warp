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

Source: `index.ts`. Count: 13.

```text
Coordinate @ index.ts#L25
GitStorage @ index.ts#L19
IndeterminateWriteReceipt @ index.ts#L29
LoggerPort @ index.ts#L30
RetainedWriteReceipt @ index.ts#L26
Runtime @ index.ts#L15
UnpublishedWriteReceipt @ index.ts#L28
UnretainedWriteReceipt @ index.ts#L27
Warp @ index.ts#L16
WarpAccessDenied @ index.ts#L23
WarpAccessPort @ index.ts#L20
WarpAddress @ index.ts#L18
WarpWriteGrant @ index.ts#L21
```

### Type exports

Source: `index.ts`. Count: 42.

```text
AuthoredWarp @ index.ts#L17
ContentAttachment @ index.ts#L71
ContentMetadataInput @ index.ts#L44
ContentOwnerDescriptor @ index.ts#L72
EntityAdmission @ index.ts#L60
EntityAdmissionInitialProperties @ index.ts#L61
EntityAdmissionInventoryCertificate @ index.ts#L67
EntityAdmissionOccurrenceReference @ index.ts#L62
EntityAdmissionOrdering @ index.ts#L63
EntityAdmissionOriginReading @ index.ts#L64
EntityAdmissionRepresentationReference @ index.ts#L65
Evidence @ index.ts#L40
EvidenceHandle @ index.ts#L40
Intent @ index.ts#L41
Lane @ index.ts#L43
LogFields @ index.ts#L32
LogFieldValue @ index.ts#L33
Observation @ index.ts#L46
ObservationReceipt @ index.ts#L47
ObservationStatus @ index.ts#L48
Observer @ index.ts#L49
ObserverCardinality @ index.ts#L50
Reading @ index.ts#L51
ReadingCoordinate @ index.ts#L53
ReadingValue @ index.ts#L54
Receipt @ index.ts#L68
RepairHint @ index.ts#L69
RuntimeOpenOptions @ index.ts#L39
StagedContent @ index.ts#L45
SupportReport @ index.ts#L55
Tick @ index.ts#L58
WarpOpenOptions @ index.ts#L31
WarpWriteBudget @ index.ts#L22
WarpWriteRequest @ index.ts#L24
WitnessReference @ index.ts#L56
WriteAdmission @ index.ts#L35
WriteAdmissionKind @ index.ts#L35
WriteIntentInput @ index.ts#L42
WriteOccurrence @ index.ts#L36
WritePublication @ index.ts#L37
WriteRace @ index.ts#L38
WriteReceipt @ index.ts#L34
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
| `observe` | `handleObserve` | `bin/cli/commands/registry.ts#L34` |
| `receipt` | `handleReceipt` | `bin/cli/commands/registry.ts#L35` |
| `doctor` | `handleDoctor` | `bin/cli/commands/registry.ts#L36` |
| `repair` | `handleRepair` | `bin/cli/commands/registry.ts#L37` |
| `audit` | `handleAudit` | `bin/cli/commands/registry.ts#L38` |
| `mcp` | `handleMcp` | `bin/cli/commands/registry.ts#L39` |

Structured CLI errors retain `{ error: { code, message, cause? } }`.
Additive `typedCode`, bounded `causes`, and `truncated` fields preserve typed
diagnostics without dumping raw metadata. The CLI failure codec owns encoding.

Source: `src/infrastructure/adapters/CliFailureCodecAdapter.ts#L37`.

## Public error classes

The v19 package root does not export error constructors.
