---
id: PROTO_purge-fake-models
cycle: 0025C
parent_cycle: 0025
blocked_by:
  - PROTO_purge-boundary-leaks
blocks:
  - PROTO_purge-import-law
feature: runtime-boundaries
---

# 0025C — Fake-model purge (Op-model introduction)

## Problem

Per the P6.5 contamination map, 12 files under `src/**` define
`*Like` placeholder types. Eight of them cluster around the
**patch-application pipeline**:

- `src/domain/services/OpLike.ts` — the whole file is named after
  the violation
- `src/domain/services/JoinReducer.ts` — defines `PatchLike`,
  consumes `OpLike`
- `src/domain/services/OpNormalizer.ts` — `Like`-adjacent naming
- `src/domain/services/OpStrategy.ts` + `OpStrategies.ts` — plural/
  singular pair that suggests the concept never fully crystallized
- `src/domain/services/PatchHydrator.ts` — adjacent to the pipeline
- `src/domain/services/codec/MessageSchemaDetector.ts` — adjacent
- `src/domain/services/controllers/ForkController.ts` — adjacent
- `src/domain/services/index/IncrementalIndexUpdater.ts` —
  consumes op shapes

Plus four outside the pipeline:

- `src/domain/services/HealthCheckService.ts`
- `src/domain/services/LogicalIndexReader.ts` (drops out in P6.5a
  after `ArrayLike` allowlist, leaving 11 strictly; kept in manifest
  if the allowlist ever changes)
- `src/infrastructure/adapters/GitGraphAdapter.ts`
- `src/infrastructure/adapters/gitErrorClassification.ts` — defines
  `GitPlumbingLike` (also double-tagged in 0025A for casts)

## Diagnosis

This is not 12 random blemishes. Classic sludge ecology:

1. The `Op` domain concept was deferred during patch-pipeline
   design.
2. The codebase compensated with structural typing (`OpLike`).
3. That compensation bred adjacent `*Like` types (`PatchLike`,
   the normalizer helpers, the strategies split) because nothing
   forced the boundary.
4. Adapters then grew their own `GitPlumbingLike`,
   `LogicalIndexReader` variants because the boundary between
   domain and adapter wasn't typed cleanly.

The fix is **one model introduction, then follow-on graduations**
— not twelve file-by-file renames.

## Fix

### Step 1 — Introduce the `Op` domain model

Define an `Op` abstract class hierarchy at `src/domain/ops/` (or
wherever fits the seam plan). Concrete classes per op variant
(`NodeAdd`, `NodeRemove`, `EdgeAdd`, `EdgeRemove`, `NodePropSet`,
`EdgePropSet`, etc.) each with:

- validated constructor (runtime-backed invariants per SSTS)
- `Object.freeze(this)` in constructor
- `instanceof` dispatch in downstream consumers

The abstract `Op` defines shared behavior (e.g. `encode()`,
`target()`, `observedDots()`) implemented per concrete op.

### Step 2 — Model the `Patch` concept

Replace `PatchLike` in `JoinReducer` with a `Patch` class (likely
already partially represented; finalize). `Patch.ops` is
`ReadonlyArray<Op>`, not `OpLike[]`.

### Step 3 — Collapse the Op* helper mush

With `Op` as a real class hierarchy:

- `OpNormalizer` becomes `Op.fromRaw(...)` factory or `OpDecoder`
  in an adapter.
- `OpStrategy` vs `OpStrategies` collapse — strategies become
  methods on the concrete Op classes (SSTS P3: behavior belongs on
  the type that owns it).
- `OpLike` file disappears entirely.

This step explicitly owns the residue that used to sit in the separate
`SLUDGE_dead-code-cleanup` card:

- `src/domain/services/strand/conflictTargetIdentity.ts` has
  graduated from the `OpLike` bridge and now consumes runtime-backed
  canonical ops plus a narrow `ConflictOpAnchor` diagnostic adapter.
- `src/domain/services/strand/ConflictOpAnchor.ts` still consults
  `OP_STRATEGIES` from `JoinReducer.ts` so malformed legacy op records
  keep their previous diagnostics while the remaining op pipeline is
  purged.
- conflict analysis still depends on the old strategy registry rather
  than op-class dispatch
- `ConflictCandidateCollector` therefore keeps `OpStrategies.ts`,
  `OpStrategy.ts`, and `OpLike.ts` live

Until `ConflictCandidateCollector` and the legacy diagnostic anchor
move fully onto op-class dispatch, those files are not dead code. They
are active fake-model residue owned here.

### Step 4 — Graduate the adjacent cluster

`PatchHydrator`, `MessageSchemaDetector`, `ForkController`,
`IncrementalIndexUpdater` all stop typing against `OpLike` /
`PatchLike` and start typing against `Op` / `Patch`.

### Step 5 — Adapters' own `*Like`

`GitPlumbingLike` in `gitErrorClassification.ts` and any remaining
`*Like` in `GitGraphAdapter.ts` are adapter-local fake models,
typically covering gaps in the underlying plumbing port. Replace
with the real port type or (if the adapter genuinely needs a
narrow slice) with a named DTO. `*Like` is banned **everywhere**
in `src/**` — adapters included. Fake models are fake models
wherever they live.

### Step 6 — `HealthCheckService` outlier

Not part of the Op cluster. Graduate by naming whatever concept
the `*Like` was standing in for — likely a `HealthStatus` or
`HealthReport` class.

## Allowed residue

None. `*Like` is banned in all `src/**`. The semgrep rule
`ts-no-like-types` runs as a hard error after 0025C closes.

TypeScript platform types (`ArrayLike`, `ArrayBufferLike`,
`PromiseLike`) are on the detection allowlist and are not
violations.

## Scope

**In:**
- Every file listed in
  `policy/quarantines/0025C-fake-models.json`.
- New `Op` / `Patch` class hierarchy introduction.
- Renames and rewrites required to eliminate every `*Like` type.
- New domain classes where real concepts surface during the purge.

**Out:**
- Import walls — that's 0025D.

## Exit criteria

- `policy/quarantines/0025C-fake-models.json` has `files: []`.
- `rg '\b[A-Z][A-Za-z0-9]*Like\b' src/**/*.ts` returns only
  platform allowlist matches (`ArrayLike`, `ArrayBufferLike`,
  `PromiseLike`).
- `src/domain/services/OpLike.ts` does not exist.
- `JoinReducer.PatchLike` does not exist.

## Retro expectations

- The retro documents the missing concepts that surfaced during
  the purge. The expected one is `Op`, but others (e.g. whatever
  `HealthCheckService` was hiding) are also recorded.
- Any `*Like` that genuinely represented a real concept with
  multiple implementations (unlikely after the Op-model
  introduction) is documented with evidence. Cycle 0023 is the
  cautionary tale against this.
- `OpStrategy.ts` and `OpStrategies.ts` are expected to collapse;
  if they don't, the retro explains why.
