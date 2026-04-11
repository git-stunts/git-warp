# Slay StrandService (992 LOC)

## Current shape

Real class with 15 public methods + ~410 LOC of free helper functions.
Already delegates to `StrandDescriptorStore`, `StrandMaterializer`,
`StrandPatchService`, `StrandIntentService`. The class orchestrates
but still does too much itself.

## Public methods

- `create(options)` — create a new strand
- `braid(strandId, options)` — braid strands
- `get(strandId)` — get strand descriptor
- `list()` — list all strands
- `drop(strandId)` — drop a strand
- `materialize(strandId, options)` — materialize strand state
- `createPatchBuilder(strandId)` — create patch builder for strand
- `patch(strandId, build)` — apply patch to strand
- `queueIntent(strandId, build)` — queue intent
- `listIntents(strandId)` — list intents
- `tick(strandId)` — tick strand (apply intents)
- `getPatchEntries(strandId, options)` — get patch entries
- `patchesFor(strandId, entityId, options)` — patches for entity
- `getOrThrow(strandId)` — get or throw

## Natural seams

The class already delegates to 4 sub-services. The problem is the
~410 LOC of orchestration helpers that don't belong to any of them.

### Split strategy: 2 files

- `StrandLifecycle.ts` (~250 LOC) — create, braid, drop, list, get,
  getOrThrow + validation/normalization helpers
- `StrandOperations.ts` (~300 LOC) — materialize, patch, tick,
  intents, patchEntries, patchesFor + orchestration logic
- `StrandService.ts` (~200 LOC) — thin facade composing lifecycle
  + operations, or dissolves entirely with methods split between
  the two new files

Alternatively, push behavior down into the existing sub-services
(StrandDescriptorStore, StrandMaterializer, etc.) and delete
StrandService entirely. It's mostly glue.

## Dependencies

- `StrandDescriptorStore` — descriptor CRUD
- `StrandMaterializer` — strand materialization
- `StrandPatchService` — strand patch building
- `StrandIntentService` — intent queue
- `ConflictAnalyzerService` — conflict detection
- WarpRuntime internals via `this._graph` (materialize, patch, etc.)
