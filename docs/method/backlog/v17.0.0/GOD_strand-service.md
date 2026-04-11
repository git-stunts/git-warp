# Slay StrandService (992 LOC)

## Current shape

Orchestrator class with 15 public methods + ~410 LOC of free helpers.
Already delegates to 4 sub-services: StrandDescriptorStore,
StrandMaterializer, StrandPatchService, StrandIntentService.
The class is glue. The sub-services own the behavior.

## Strategy: dissolve

StrandService dissolves. Its methods push down into the sub-services
that already exist. The `StrandCapability` interface is implemented
by a thin coordinator that composes the sub-services — NOT a facade
that forwards, but a coordinator that owns the lifecycle wiring.

## Where each method goes

| Method | Destination | Why |
|--------|-------------|-----|
| `create(options)` | StrandDescriptorStore.create() | Descriptor CRUD |
| `braid(strandId, options)` | StrandDescriptorStore.braid() | Descriptor mutation |
| `get(strandId)` | StrandDescriptorStore.get() | Descriptor read |
| `getOrThrow(strandId)` | StrandDescriptorStore.getOrThrow() | Descriptor read |
| `list()` | StrandDescriptorStore.list() | Descriptor read |
| `drop(strandId)` | StrandDescriptorStore.drop() | Descriptor CRUD |
| `materialize(strandId, opts)` | StrandMaterializer.materialize() | Already there |
| `createPatchBuilder(strandId)` | StrandPatchService.createBuilder() | Already there |
| `patch(strandId, build)` | StrandPatchService.patch() | Already there |
| `queueIntent(strandId, build)` | StrandIntentService.queue() | Already there |
| `listIntents(strandId)` | StrandIntentService.list() | Already there |
| `tick(strandId)` | StrandIntentService.tick() | Already there |
| `getPatchEntries(strandId, opts)` | StrandPatchService.getEntries() | Already there |
| `patchesFor(strandId, entityId)` | StrandPatchService.patchesFor() | Already there |
| `analyzeConflicts(options)` | ConflictAnalyzerService.analyze() | Already there |

## StrandCapability coordinator (~150 LOC)

```typescript
class StrandCoordinator implements StrandCapability {
  constructor(
    private readonly descriptors: StrandDescriptorStore,
    private readonly materializer: StrandMaterializer,
    private readonly patches: StrandPatchService,
    private readonly intents: StrandIntentService,
    private readonly conflicts: ConflictAnalyzerService,
  ) {}

  // Each method delegates to the owning sub-service.
  // The coordinator's only unique logic is validation that
  // spans sub-services (e.g., "strand must exist before patch").
}
```

## Named option types

```typescript
type StrandCreateOptions = {
  strandId?: string;
  writerId?: string;
  baseObservation?: { frontier: Record<string, string>; lamportCeiling?: number };
};

type StrandBraidOptions = {
  readOverlayStrandId: string;
};

type StrandMaterializeOptions = {
  ceiling?: number;
  receipts?: boolean;
};
```

## LOC guard

StrandDescriptorStore is currently 643 LOC. Pushing `create`, `braid`,
`drop`, `list`, `get`, `getOrThrow` adds ~200 LOC of orchestration.
That puts it over 500.

Split: `StrandDescriptorValidation.ts` (~200 LOC) — all the
normalization and validation helpers that are currently free functions
in StrandService. `StrandDescriptorStore.ts` (~450 LOC) — CRUD +
composition of validated inputs.

## Test files

- `test/unit/domain/WarpGraph.strands.test.js`
- `test/unit/domain/services/strand/*.test.js`

## Execution order

1. Push lifecycle methods into StrandDescriptorStore
2. Split StrandDescriptorValidation.ts if over 500
3. Verify sub-services already own their methods
4. Create StrandCoordinator implementing StrandCapability
5. Delete StrandService.js
