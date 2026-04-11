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

## Sludge that MUST die during this split

1. **Dissolve, don't facade.** StrandService is glue. Push behavior
   down into the sub-services that already exist. A thin facade that
   just forwards is the same sludge we killed in WarpRuntime.

2. **No `_graph` host bag.** Sub-services get typed deps, not a
   WarpRuntime reference. See `SLUDGE_host-bag-injection.md`.

## SSTS amendments

- **Named options types** for `create(options)` and all methods
  accepting options. No `= {}` default bags.
- **Check sub-service LOC after dissolution.** StrandDescriptorStore
  is 643 LOC. If pushing behavior into it exceeds 500, split it:
  `StrandDescriptorNormalization.ts` (validation/normalization) +
  `StrandDescriptorStore.ts` (CRUD).

## Dependencies

- `StrandDescriptorStore` — descriptor CRUD
- `StrandMaterializer` — strand materialization
- `StrandPatchService` — strand patch building
- `StrandIntentService` — intent queue
- `ConflictAnalyzerService` — conflict detection
- WarpRuntime internals via `this._graph` (materialize, patch, etc.)
