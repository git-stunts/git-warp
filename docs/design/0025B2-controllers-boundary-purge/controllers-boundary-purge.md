---
title: "Purge Record<string, unknown> and unknown from 17 controller files"
legend: "PURGE"
cycle: "0025B2-controllers-boundary-purge"
parent_cycle: "0025-anti-sludge-purge"
source_backlog: "docs/method/backlog/v17.0.0/PROTO_purge-boundary-leaks.md"
---

# 0025B2 — Controllers boundary purge

Source backlog item: `docs/method/backlog/v17.0.0/PROTO_purge-boundary-leaks.md` (0025B2 sub-campaign)
Legend: PURGE
Parent cycle: `0025-anti-sludge-purge`
Peer sub-cycle: `0025B1` (ports) runs in parallel.

## Sponsors

- Human: Backlog operator
- Agent: Implementation agent

## Hill

Zero `Record<string, unknown>` and zero non-catch `unknown` across
all 17 controller files in `src/domain/services/controllers/`
listed in `policy/quarantines/0025B-boundary.json`. Every raw
transport shape in those files is replaced by a runtime-backed
domain type or an explicit transport DTO (no `*Like`). Property
poking at inline `Record<string, unknown>` call sites is replaced
with method or field access on the named type. All pre-existing
tests pass unchanged.

## Scope — the 17 controller files

- `CheckpointController.ts`
- `ComparisonController.ts`
- `ComparisonEngine.ts`
- `ComparisonSelector.ts`
- `ForkController.ts`
- `PatchController.ts`
- `PatchDiscovery.ts`
- `ProvenanceController.ts`
- `QueryContent.ts`
- `QueryController.ts`
- `QueryReads.ts`
- `StrandController.ts`
- `SubscriptionController.ts`
- `SyncController.ts`
- `SyncControllerTypes.ts`
- `SyncServerLauncher.ts`
- `syncHelpers.ts`

## Playback Questions

### Human

- [ ] After the cycle, does `policy/quarantines/0025B-boundary.json`
      drop these 17 files?
- [ ] Are any new `*Like`, `as unknown as`, or `Record<string, unknown>`
      violations introduced anywhere? (expected: zero)
- [ ] Do the new named domain / DTO types live in files named after
      the concept (not `*Like.ts`, not `utils.ts`)?

### Agent

- [ ] `rg 'Record<string, unknown>' src/domain/services/controllers`
      returns zero matches.
- [ ] `rg '\bunknown\b' src/domain/services/controllers` returns
      only matches inside `catch (...: unknown)` clauses and type
      guard predicates (`x is Foo`).
- [ ] No `*Like` types introduced.
- [ ] No `as unknown as` or `as any` introduced.
- [ ] All 17 files dropped from the quarantine manifest after
      `npm run lint:contamination`.

## Strategy

Work in coherent sub-groups so each commit stays small:

1. **Named value/option types** — introduce domain/DTO classes
   colocated with the controller that owns them, or under
   `src/domain/services/controllers/types/` when shared across
   controllers.
2. **Comparison cluster** (`ComparisonController`,
   `ComparisonEngine`, `ComparisonSelector`) — the densest
   `Record<string, unknown>` site. Introduce explicit comparison
   input / output types.
3. **Sync cluster** (`SyncController`, `SyncControllerTypes`,
   `SyncServerLauncher`, `syncHelpers`) — replace transport
   `Record<string, unknown>` payloads with typed event types.
4. **Query cluster** (`QueryController`, `QueryReads`,
   `QueryContent`) — `Record<string, unknown>` was almost always a
   property bag for `{ key: value }` node/edge props; replace with
   `PropertyMap` / `PropertyBag` domain type.
5. **Patch / checkpoint cluster** (`PatchController`,
   `PatchDiscovery`, `CheckpointController`, `ProvenanceController`)
   — tighten mix-in host shapes; replace `unknown` field holes
   with concrete references.
6. **Small controllers** (`ForkController`, `StrandController`,
   `SubscriptionController`) — mix-in field type fixes plus
   tightening on external calls.

## Non-goals

- [ ] No port tightening in `src/ports/**` (that's 0025B1).
- [ ] No strand conflict-data modeling (that's 0025B3).
- [ ] No `Op` class hierarchy introduction (that's 0025C).
- [ ] No controller rewrites beyond what the boundary purge
      requires. God-object controllers stay god-objects; file
      bad-code notes, do not expand scope.
- [ ] No test behavior changes. Only mechanical type propagation.
- [ ] No `*Like` types. Cycle 0023's lesson.

## Cross-cycle coordination

- If a controller consumes a port that currently returns
  `unknown` (`CodecPort`, `IndexStorePort`, `LoggerPort`), leave a
  `TODO(0025B1)` comment where the receive site will tighten when
  B1 lands. Do not fight B1 for the same surface.

## Relationship to cycle 0023 / 0024

- No abstract parent classes with a single implementation.
- Named concepts, not shape approximations. No `*Like`.
- Concrete classes with validated constructors; `instanceof`
  dispatch where multiple variants exist.

## Exit criteria

- `rg 'Record<string, unknown>' src/domain/services/controllers`
  → zero matches.
- `rg '\bunknown\b' src/domain/services/controllers` → only `catch`
  bindings and type-guard predicates.
- `npm run lint:contamination` produces a `0025B-boundary.json`
  without any controller file in `files[]`.
- `npm run typecheck`, `npm run test:local`, `npm run lint`,
  `npm run lint:sludge`, `npm run lint:quarantine-graduate` all green.
