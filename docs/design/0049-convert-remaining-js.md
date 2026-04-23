---
title: "Convert remaining JavaScript in bounded TypeScript batches"
cycle: "0049-convert-remaining-js"
---

# Convert Remaining JavaScript

## Why this exists

`v17` still has a live JavaScript tail sitting directly on the shipping path:

- infrastructure adapters
- CLI / visualization / scripts
- remaining domain/service families

The backlog note
[TS_convert-remaining-js](/Users/james/git/git-stunts/git-warp/docs/method/backlog/v17.0.0/TS_convert-remaining-js.md)
captured the census honestly, but it is too large to execute as one fake
"convert 93 files" swing without recreating the exact sludge the migration is
meant to remove.

This cycle exists to turn that census into a truthful execution slice.

## Hill

A contributor can now answer:

- what the remaining JavaScript tail actually consists of
- what batch order keeps the migration honest
- which file families can be converted directly and which require structural
  splits first
- how this cycle will stay bounded instead of pretending the whole JS tail is a
  one-commit job

## Design goals

1. Keep the remaining JS conversion on the active `v17` trunk.
2. Preserve the batch ordering already captured in the backlog note.
3. Refuse any "convert everything" approach that would hide over-ceiling files
   or cast-heavy transitional sludge.
4. Make the first executable conversion slice explicit enough to test and green.
5. Leave the downstream conversion tasks
   [TS_infrastructure-adapters](/Users/james/git/git-stunts/git-warp/docs/method/backlog/v17.0.0/TS_infrastructure-adapters.md)
   and
   [TS_cli-viz-scripts](/Users/james/git/git-stunts/git-warp/docs/method/backlog/v17.0.0/TS_cli-viz-scripts.md)
   intact as real successors rather than blurring their boundaries.

## Non-goals

- No attempt to finish every remaining `.js` file in a single cycle.
- No waiver on the anti-sludge policy just because files are mid-migration.
- No hidden "just rename to .ts" conversions on files that still need splits or
  runtime-backed types.
- No launch-prep declaration or publish work in this cycle.

## Core diagnosis

The backlog note names eleven conversion batches, but those batches are not
equally executable:

- some are clean boundary or leaf conversions
- some are over-ceiling and need structural cuts first
- some overlap with god-kill or runtime-boundary work already tracked elsewhere

So the real problem is not "convert all the JS." The real problem is:

> execute the remaining JS migration in bounded batches without lying about file
> size, ownership, or runtime truth.

This cycle should therefore treat the census note as an execution map, not as a
literal one-shot hill.

## Design

### 1. Keep the backlog census as the migration map

The batch ordering from the original note remains the source of truth for the
remaining JS tail:

- codec
- trust
- state
- dag
- strand
- index
- query
- sync
- controllers
- flat services
- provenance

This cycle does not re-invent that map. It operationalizes it.

### 2. First executable slice must be bounded and leaf-heavy

The first green slice should prefer:

- small leaf files
- boundary files that already have obvious DTO/transport shapes
- files that do not depend on unresolved god kills
- files that do not require over-ceiling structural surgery

That means the early green path should begin with the smallest direct
conversions in the front of the batch order, not the largest or most entangled
files.

### 3. Structural cuts are part of the migration, not follow-up theater

Any file already known to violate the source ceiling or to carry obvious
ownership sludge must be split during the migration path that touches it.

Examples already called out by the backlog census:

- `StateReaderV5.js`
- `CheckpointService.js`
- `DagPathFinding.js`
- `StrandDescriptorStore.js`
- `ConflictCandidateCollector.js`
- `BitmapIndexReader.js`
- `LogicalIndexReader.js`
- `SyncProtocol.js`
- `BoundaryTransitionRecord.js`

If a touched file still needs one of those cuts, the cycle must either:

- perform the cut in the same slice, or
- stop before touching that file and keep the slice bounded

### 4. Runtime truth beats rename progress

Every converted file must end more honest than it started:

- named return/result types where boundary records are appropriate
- runtime-backed classes where identity or invariants matter
- no cast-cosplay
- no fake `Function` surfaces
- no unowned helper puddles

The migration is not complete when a file compiles. It is complete when the
file compiles without carrying forward the old shape lies.

### 5. This cycle should establish the execution seam for the rest of the tail

The end state of `0049` should make the next steps obvious:

- the first converted batch lands cleanly
- the remaining batches are still sequenced clearly
- downstream backlog items still have truthful boundaries

So the cycle is successful if it proves the JS tail can be burned down in clean,
green batches without collapsing into a giant migration blob.

## Playback questions

### Agent

- Can I explain why `TS_convert-remaining-js` is an execution map rather than a
  one-cycle mega-slice?
- Can I point to the exact first bounded tranche this cycle is allowed to green?
- Can I explain which over-ceiling files must be split on contact instead of
  simply renamed?

### Human

- Does this feel like a disciplined migration path rather than a catch-all TS
  bucket?
- Is it clear why some JS files can convert directly while others must wait for
  structural cuts?
- Is the first green slice small enough to trust?

## Test plan

### Golden path

- the chosen first tranche converts from `.js` to `.ts`
- the converted tranche passes `npm run typecheck`
- targeted tests covering the touched tranche pass
- no touched file exceeds the repo file-size ceilings without an accompanying
  split

### Edge cases

- public barrels still resolve after conversion
- compile-only surfaces and CLI entrypoints still typecheck after extension
  changes
- boundary record files use named result types instead of anonymous object
  sludge

### Known failure modes

- a touched file compiles only because of casts or fake `Function` surfaces
- a known over-ceiling file gets renamed without being split
- a slice spills across unrelated batches and becomes another migration god
- downstream tasks become fuzzy because this cycle consumes their actual scope

