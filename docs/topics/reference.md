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

Source: `index.ts`. Count: 45.

```text
AdmissionOutcome @ index.ts#L63
ContentAttachment @ index.ts#L67
ContentInput @ index.ts#L24
ContentMetadataInput @ index.ts#L25
ContentOwnerDescriptor @ index.ts#L68
CoordinateReference @ index.ts#L28
EntityAdmission @ index.ts#L55
EntityAdmissionInitialProperties @ index.ts#L56
EntityAdmissionInventoryCertificate @ index.ts#L62
EntityAdmissionOccurrenceReference @ index.ts#L57
EntityAdmissionOrdering @ index.ts#L58
EntityAdmissionOriginReading @ index.ts#L59
EntityAdmissionRepresentationReference @ index.ts#L60
EntityCausalRelation @ index.ts#L52
EntityOccurrence @ index.ts#L51
Evidence @ index.ts#L20
EvidenceHandle @ index.ts#L20
Intent @ index.ts#L21
Lane @ index.ts#L23
LaneDescriptor @ index.ts#L29
LaneKind @ index.ts#L30
LaneReference @ index.ts#L31
Observation @ index.ts#L33
ObservationReceipt @ index.ts#L34
ObservationStatus @ index.ts#L35
Observer @ index.ts#L36
ObserverCardinality @ index.ts#L37
Reading @ index.ts#L38
ReadingCoordinate @ index.ts#L40
ReadingValue @ index.ts#L41
Receipt @ index.ts#L64
RepairHint @ index.ts#L65
RuntimeForkOptions @ index.ts#L15
RuntimeOpenOptions @ index.ts#L16
RuntimeSettlementOptions @ index.ts#L17
RuntimeStrandOptions @ index.ts#L18
SettlementPlan @ index.ts#L48
SettlementPreview @ index.ts#L46
SettlementReceipt @ index.ts#L47
StagedContent @ index.ts#L26
SupportReport @ index.ts#L42
Tick @ index.ts#L45
WitnessReference @ index.ts#L43
WriteIntentInput @ index.ts#L22
WriteReceipt @ index.ts#L49
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

Structured CLI errors retain `{ error: { code, message, cause? } }`. The optional immediate `cause` is a safe Error message; raw non-Error objects are represented by a generic bounded cause node, never dumped. Additive `causes` nodes identify typed `cause`, `originalError`, `aggregate`, and `cleanup` edges. A `typedCode` records a non-CLI runtime code when the existing top-level classifier remains `E_INTERNAL`.

Primary CLI failures retain their code and nonzero exit status when cleanup also fails. Nested aggregate members remain visible. A cleanup failure after success exits with the internal failure status. SIGINT/SIGTERM shutdown failures use the same bounded reporter. Human reports use stderr; JSON and JSONL use stdout with deterministic key order. Arbitrary metadata, stacks, getters, coercion methods, and unsupported raw objects are excluded.

Display defaults bound traversal depth to 4, report nodes to 8, message text to 1024 UTF-8 bytes, and each emitted failure report including its newline to 8192 UTF-8 bytes after serialization. These are defensive bounds, not performance measurements. Truncation is explicit and preserves primary code/status. Successful command output has its own existing contract. Home/cwd paths, URL credentials, Bearer tokens, GitHub token patterns, and terminal controls are sanitized; relative paths, Git refs and object IDs are preserved.

Source: `src/infrastructure/adapters/CliFailureReporterAdapter.ts`, `CliFailureProjectionAdapter.ts`, `CliFailureCodecAdapter.ts`, and the executable composition in `bin/git-warp.ts`.

## Public error classes

The v19 package root does not export error constructors.
