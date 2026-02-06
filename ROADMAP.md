# Roadmap

> Execution plan for `@git-stunts/git-warp` from v7.1.0 onward.
> Current release: v7.0.0. Main branch: v7.7.0 complete (AUTOPILOT through PULSE merged, unreleased).
> Next milestone: HOLOGRAM (v8.0.0).

## How to Read This Document

Every item has an identifier: `{MILESTONE}/{FEATURE}/{TASK}`.
Milestones have codenames and target version numbers.
No task exceeds 6 estimated human hours; larger work is decomposed.

**Management:** Use `node scripts/roadmap.js` (or `npm run roadmap`) to track progress. Commands: `close`, `open`, `status`, `show`.

**Estimation conventions:**
- *Human Hours* = wall-clock hours for a developer familiar with the codebase.
- *LOC* = approximate lines of production code + test code combined.
- *Blocked by* references use full identifiers.

---

## Versions

### v7.1.0 — AUTOPILOT

**Kill the Materialize Tax**

Eliminates manual state freshness management. Cached state stays fresh after local writes, queries auto-materialize when needed, checkpoints happen automatically.

**Features:**
- AP/INVAL — Auto-invalidation after local writes
- AP/LAZY — Lazy rematerialization on query
- AP/CKPT — Periodic auto-checkpointing
- AP/HOOK — Post-merge git hook for staleness notification

**User-Facing Changes:**
- `createPatch().commit()` and `writer.commitPatch()` apply patches to cached state eagerly — no manual re-materialize needed after local writes.
- New `autoMaterialize: true` option on `WarpGraph.open()` — query methods auto-materialize when state is null or dirty.
- New `checkpointPolicy: { every: N }` option — checkpoints created automatically during materialization.
- New `post-merge` git hook warns when warp refs change during `git pull`.

### v7.2.0 — GROUNDSKEEPER

**Self-Managing Infrastructure**

Indexes, GC, and frontier tracking manage themselves.

**Features (recommended order):**
- GK/FRONTIER — Frontier change detection (multiplier — unlocks PULSE, useful for status/debug/CI)
- GK/IDX — Index staleness tracking
- GK/GC — Auto-GC after materialization (last — most likely to cause surprise perf behavior)

**User-Facing Changes:**
- New `graph.hasFrontierChanged()` method for cheap "has anything changed?" polling.
- Bitmap index stores frontier at build time; `loadIndex()` warns when stale, opt-in `autoRebuild: true` to rebuild automatically.
- `materialize()` runs GC when `gcPolicy: { enabled: true }` is set and tombstone ratio exceeds threshold. Default: warn only, no automatic GC.

### v7.3.0 — WEIGHTED

**Edge Properties**

Extends the data model with properties on edges.

**Features:**
- WT/EPKEY — EdgePropKey encoding
- WT/OPS — Patch ops for edge properties
- WT/VIS — Edge property visibility rules
- WT/SCHEMA — Schema v3 + compatibility

**User-Facing Changes:**
- New `patch.setEdgeProperty(from, to, label, key, value)` API.
- `getEdges()` and query results include edge `props` field.
- Schema v3 with backward-compatible v2 reader support.
- Mixed-version sync: v2 readers fail fast with `E_SCHEMA_UNSUPPORTED` on unknown edge prop ops (never silently drop data).

### v7.4.0 — HANDSHAKE

**Multi-Writer Ergonomics**

Smoother multi-writer experience with fewer footguns.

**Features:**
- HS/WRITER — Simplified writer identity
- HS/SYNC — Sync-then-materialize
- HS/ERR — Actionable error messages
- HS/CAS — CAS failure recovery
- HS/DELGUARD — Deletion guards

**User-Facing Changes:**
- Writer API consolidated to `graph.writer()` (stable) and `graph.writer('id')` (explicit). `createWriter()` deprecated.
- New `syncWith(remote, { materialize: true })` option.
- Error messages include codes (`E_STATE_NEVER_MATERIALIZED`, etc.) and recovery hints.
- CAS failures surface as `WRITER_CAS_CONFLICT` with retry guidance.
- New `onDeleteWithData: 'reject' | 'cascade' | 'warn'` option prevents silent data corruption on node deletion.

### v7.5.0 — COMPASS

**Advanced Query Language**

Richer query capabilities without imperative code.

**Features:**
- CP/WHERE — Property filters with object syntax
- CP/MULTIHOP — Multi-hop traversal in queries
- CP/AGG — Aggregation

**User-Facing Changes:**
- `.where({ role: 'admin' })` object shorthand for property equality filters.
- `.outgoing(label, { depth: [1, 3] })` multi-hop traversal with depth ranges.
- `.aggregate({ count: true, sum: 'props.total' })` for count/sum/avg/min/max.

### v7.6.0 — LIGHTHOUSE

**Observability**

Runtime visibility into graph health and materialization decisions.

**Features:**
- LH/STATUS — graph.status() API
- LH/TIMING — Operation timing in LoggerPort
- LH/CLI — CLI status enhancement
- LH/RECEIPTS — Tick receipts

**User-Facing Changes:**
- New `graph.status()` returns cached state freshness, patch counts, tombstone ratio, writer count, frontier.
- Core operations (`materialize()`, `syncWith()`, etc.) emit structured timing logs.
- `git warp check` surfaces full `graph.status()` output.
- New `materialize({ receipts: true })` returns per-op decision records (applied/superseded/redundant with reasons).

### v7.7.0 — PULSE

**Subscriptions & Reactivity**

React to graph changes without polling.

**Features:**
- PL/DIFF — State diff engine
- PL/SUB — graph.subscribe()
- PL/WATCH — graph.watch(pattern)

**User-Facing Changes:**
- New `diffStates(before, after)` function for deterministic state comparison.
- New `graph.subscribe({ onChange, onError })` with isolated error handling and optional initial replay.
- New `graph.watch('user:*', { onChange, poll: 5000 })` for pattern-filtered reactive updates with optional frontier polling.

### v8.0.0 — HOLOGRAM

**Provenance & Holography**

Implements Papers III–IV: provenance payloads, slicing, wormholes, BTRs, and prefix forks.

**Features:**
- HG/IO — In/Out declarations on patches
- HG/PROV — Provenance payloads
- HG/SLICE — Slice materialization
- HG/WORM — Wormhole compression
- HG/BTR — Boundary Transition Records
- HG/FORK — Prefix forks

**User-Facing Changes:**
- Patches carry `reads`/`writes` arrays. New `graph.patchesFor(nodeId)` index query.
- New `ProvenancePayload` class with monoid operations and `replay()`.
- New `graph.materializeSlice(nodeId)` for partial materialization of causal cones.
- New `graph.createWormhole(from, to)` for compressing patch ranges.
- New `createBTR()`/`verifyBTR()` for tamper-evident artifact exchange.
- New `graph.fork({ from, at })` for branching at the WARP layer.

### v9.0.0 — ECHO

**Observer Geometry (Speculative)**

Observer-scoped views, translation costs, and temporal queries from Paper IV.

**Features:**
- EC/VIEW — Observer-scoped views
- EC/COST — Translation cost estimation
- EC/TEMPORAL — Temporal queries

**User-Facing Changes:**
- New `graph.observer(name, { match, expose, redact })` for projected read-only views.
- New `graph.translationCost(observerA, observerB)` for MDL cost estimation.
- New `graph.temporal.always()`/`eventually()` for CTL*-style temporal queries over history.

---

## Milestone Summary

| # | Codename | Version | Theme | Status |
|---|----------|---------|-------|--------|
| 1 | **AUTOPILOT** | v7.1.0 | Kill the Materialize Tax | Complete (merged, unreleased) |
| 2 | **GROUNDSKEEPER** | v7.2.0 | Self-Managing Infrastructure | Complete (merged, unreleased) |
| 3 | **WEIGHTED** | v7.3.0 | Edge Properties | Complete (merged, unreleased) |
| 4 | **HANDSHAKE** | v7.4.0 | Multi-Writer Ergonomics | Complete (merged, unreleased) |
| 5 | **COMPASS** | v7.5.0 | Advanced Query Language | Complete (merged, unreleased) |
| 6 | **LIGHTHOUSE** | v7.6.0 | Observability | Complete (merged, unreleased) |
| 7 | **PULSE** | v7.7.0 | Subscriptions & Reactivity | Complete (merged, unreleased) |
| 8 | **HOLOGRAM** | v8.0.0 | Provenance & Holography | Complete (merged, unreleased) |
| 9 | **ECHO** | v9.0.0 | Observer Geometry | Speculative |

---

## Dependency Graph (Milestone Level)

```text
AUTOPILOT ──→ GROUNDSKEEPER ──→ PULSE
    │                              ↑
    └──→ HANDSHAKE                 │
                                   │
WEIGHTED (independent)             │
                                   │
COMPASS (independent)              │
                                   │
LIGHTHOUSE ────────────────→ HOLOGRAM ──→ ECHO
```

- GROUNDSKEEPER depends on AUTOPILOT (auto-materialize foundation).
- PULSE depends on GROUNDSKEEPER (frontier change detection).
- HOLOGRAM depends on LIGHTHOUSE (tick receipts as foundation).
- ECHO depends on HOLOGRAM (provenance payloads).
- WEIGHTED, COMPASS, HANDSHAKE can proceed independently.

---

## Task DAG

<!-- ROADMAP:DAG:START -->
```text
Key: ■ CLOSED   ◆ OPEN   ○ BLOCKED

AUTOPILOT        (v7.1.0)  ████████████████████  100%  (10/10)
  ■ AP/CKPT/1           →  AP/CKPT/3
  ■ AP/CKPT/2           →  AP/CKPT/3, LH/STATUS/1
  ■ AP/CKPT/3         
  ■ AP/HOOK/1           →  AP/HOOK/2
  ■ AP/HOOK/2         
  ■ AP/INVAL/1          →  AP/INVAL/2, AP/LAZY/2, LH/STATUS/1
  ■ AP/INVAL/2          →  AP/INVAL/3
  ■ AP/INVAL/3        
  ■ AP/LAZY/1           →  AP/LAZY/2
  ■ AP/LAZY/2         

GROUNDSKEEPER    (v7.2.0)  ████████████████████  100%  (4/4)
  ■ GK/FRONTIER/1       →  PL/WATCH/2
  ■ GK/GC/1           
  ■ GK/IDX/1            →  GK/IDX/2
  ■ GK/IDX/2          

WEIGHTED         (v7.3.0)  ████████████████████  100%  (7/7)
  ■ WT/EPKEY/1          →  WT/OPS/1, WT/SCHEMA/1
  ■ WT/OPS/1            →  WT/OPS/2, WT/OPS/3
  ■ WT/OPS/2          
  ■ WT/OPS/3            →  WT/VIS/1
  ■ WT/SCHEMA/1         →  WT/SCHEMA/2
  ■ WT/SCHEMA/2       
  ■ WT/VIS/1          

HANDSHAKE        (v7.4.0)  ████████████████████  100%  (8/8)
  ■ HS/CAS/1          
  ■ HS/DELGUARD/1       →  HS/DELGUARD/2, HS/DELGUARD/3
  ■ HS/DELGUARD/2     
  ■ HS/DELGUARD/3     
  ■ HS/ERR/1            →  HS/ERR/2
  ■ HS/ERR/2          
  ■ HS/SYNC/1         
  ■ HS/WRITER/1       

COMPASS          (v7.5.0)  ████████████████████  100%  (3/3)
  ■ CP/AGG/1          
  ■ CP/MULTIHOP/1     
  ■ CP/WHERE/1        

LIGHTHOUSE       (v7.6.0)  ████████████████████  100%  (5/5)
  ■ LH/CLI/1          
  ■ LH/RECEIPTS/1       →  LH/RECEIPTS/2
  ■ LH/RECEIPTS/2       →  HG/IO/1
  ■ LH/STATUS/1         →  LH/CLI/1
  ■ LH/TIMING/1       

PULSE            (v7.7.0)  ████████████████████  100%  (5/5)
  ■ PL/DIFF/1           →  PL/SUB/1
  ■ PL/SUB/1            →  PL/WATCH/1, PL/SUB/2
  ■ PL/SUB/2          
  ■ PL/WATCH/1          →  PL/WATCH/2
  ■ PL/WATCH/2        

HOLOGRAM         (v8.0.0)  ████████████████████  100%  (7/7)
  ■ HG/BTR/1          
  ■ HG/FORK/1         
  ■ HG/IO/1             →  HG/IO/2, HG/SLICE/1, EC/TEMPORAL/1
  ■ HG/IO/2             →  HG/SLICE/1
  ■ HG/PROV/1           →  HG/SLICE/1, HG/WORM/1, HG/BTR/1
  ■ HG/SLICE/1        
  ■ HG/WORM/1         

ECHO             (v9.0.0)  ░░░░░░░░░░░░░░░░░░░░    0%  (0/3)
  ○ EC/COST/1         
  ◆ EC/TEMPORAL/1     
  ◆ EC/VIEW/1           →  EC/COST/1

Cross-Milestone Dependencies:
  AP/CKPT/2           →  LH/STATUS/1 (LIGHTHOUSE)
  AP/INVAL/1          →  LH/STATUS/1 (LIGHTHOUSE)
  GK/FRONTIER/1       →  PL/WATCH/2 (PULSE)
  HG/IO/1             →  EC/TEMPORAL/1 (ECHO)
  LH/RECEIPTS/2       →  HG/IO/1 (HOLOGRAM)

```
<!-- ROADMAP:DAG:END -->

---

## Milestone 1 — AUTOPILOT (v7.1.0)

**Kill the Materialize Tax**

The single biggest DX problem. Developers manually orchestrate state freshness across three independent axes (cached state, checkpoints, indexes) with no staleness detection. Fix this and the library becomes dramatically easier to use.

### Feature: AP/INVAL — Auto-invalidation After Local Writes

**Rationale:** `createPatch().commit()` and `writer.commitPatch()` can produce stale query results with no warning. The patch is already parsed and in memory at commit time — applying it to cached state is O(ops-in-patch), negligible compared to the Git I/O that just happened.

#### AP/INVAL/1 — Add dirty flag to WarpGraph state tracking

- **Status:** `CLOSED`
- **User Story:** As a developer, I want the graph to know when cached state is stale so I'm never silently reading outdated data.
- **Requirements:**
  - Add `_stateDirty` boolean flag to `WarpGraph` instance.
  - Flag starts `false` after `materialize()` completes.
  - Flag is set `true` whenever a patch is committed by any path (`PatchBuilderV2.commit()`, `Writer.commitPatch()`).
  - `_cachedState` getter logs a warning when state is dirty (if logger available).
- **Acceptance Criteria:**
  - After `materialize()`, `_stateDirty === false`.
  - After `createPatch().commit()`, `_stateDirty === true`.
  - After `writer.commitPatch()`, `_stateDirty === true`.
- **Scope:** Dirty flag tracking only. No auto-remediation (that's AP/INVAL/2).
- **Out of Scope:** Remote writes, sync-triggered staleness.
- **Estimated Hours:** 2
- **Estimated LOC:** ~40 prod + ~80 test
- **Blocked by:** None
- **Blocking:** AP/INVAL/2, AP/LAZY/2
- **Definition of Done:** Flag correctly tracks staleness across all commit paths. Tests pass.
- **Test Plan:**
  - Golden path: materialize → commit → assert dirty.
  - Known failures: commit without prior materialize (flag should still set).
  - Edge cases: multiple sequential commits, commit after failed commit.

#### AP/INVAL/2 — Eager incremental re-materialize on commit

- **Status:** `CLOSED`
- **User Story:** As a developer, I want my cached state to stay fresh after local writes without calling `materialize()` again.
- **Requirements:**
  - After `PatchBuilderV2.commit()` succeeds, apply the just-committed patch to `_cachedState` in-place via `JoinReducer.join()`.
  - Clear `_stateDirty` flag after successful application.
  - If `_cachedState` is null (never materialized), skip — don't attempt incremental update.
  - Pass the `onCommitSuccess` callback from WarpGraph to carry the patch object.
- **Acceptance Criteria:**
  - `commit()` followed by `hasNode()` returns fresh result without explicit `materialize()`.
  - `_stateDirty === false` after successful eager re-materialize.
  - When `_cachedState` is null, commit still succeeds without error.
- **Scope:** Local writes only. Apply single patch to existing cached state.
- **Out of Scope:** Full re-materialize from scratch, remote/sync writes.
- **Estimated Hours:** 4
- **Estimated LOC:** ~80 prod + ~150 test
- **Blocked by:** AP/INVAL/1
- **Blocking:** None
- **Definition of Done:** Queries after commit return fresh data. No regression in existing tests. Benchmark shows negligible overhead vs. current commit path.
- **Test Plan:**
  - Golden path: materialize → addNode → commit → hasNode returns true.
  - Golden path: materialize → setProperty → commit → getNodeProps returns new value.
  - Known failures: commit without prior materialize skips update gracefully.
  - Fuzz/stress: 100 sequential commits, state matches full re-materialize.
  - Edge cases: remove node then query, property overwrite, edge add/remove.

#### AP/INVAL/3 — Wire Writer.commitPatch() to trigger invalidation

- **Status:** `CLOSED`
- **User Story:** As a developer using the Writer API, I want the same freshness guarantees as the low-level patch API.
- **Requirements:**
  - `Writer.commitPatch()` and `PatchSession.commit()` trigger the same eager re-materialize as `PatchBuilderV2.commit()`.
  - The patch object is available to the callback after commit.
- **Acceptance Criteria:**
  - `writer.commitPatch(fn)` followed by `hasNode()` returns fresh result.
- **Scope:** Wire existing callback through Writer/PatchSession.
- **Out of Scope:** New Writer API methods.
- **Estimated Hours:** 2
- **Estimated LOC:** ~30 prod + ~60 test
- **Blocked by:** AP/INVAL/2
- **Blocking:** None
- **Definition of Done:** Writer API commits produce the same freshness as direct patch API.
- **Test Plan:**
  - Golden path: writer.commitPatch → query returns fresh data.
  - Edge cases: writer commit failure does not corrupt state.

---

### Feature: AP/LAZY — Lazy Rematerialization on Query

**Rationale:** If the state is dirty (or null), query methods should auto-materialize before returning results. This eliminates the "call materialize() first" error that every new user hits.

#### AP/LAZY/1 — Add autoMaterialize option to WarpGraph.open()

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to opt in to automatic materialization so I never see stale-state errors.
- **Requirements:**
  - Add `autoMaterialize: boolean` option to `WarpGraph.open()` (default `false`).
  - Store as instance property.
  - Validate option type.
- **Acceptance Criteria:**
  - `WarpGraph.open({ ..., autoMaterialize: true })` succeeds.
  - `WarpGraph.open({ ..., autoMaterialize: 'yes' })` throws validation error.
- **Scope:** Option parsing and storage only.
- **Out of Scope:** Actual auto-materialize behavior (that's AP/LAZY/2).
- **Estimated Hours:** 1
- **Estimated LOC:** ~15 prod + ~30 test
- **Blocked by:** None
- **Blocking:** AP/LAZY/2
- **Definition of Done:** Option accepted, validated, stored.
- **Test Plan:**
  - Golden path: open with `autoMaterialize: true` stores flag.
  - Known failures: invalid type rejected.

#### AP/LAZY/2 — Guard query methods with auto-materialize

- **Status:** `CLOSED`
- **User Story:** As a developer with autoMaterialize enabled, I want query methods to just work without manual state management.
- **Requirements:**
  - When `autoMaterialize === true` and `_cachedState` is null or `_stateDirty === true`, call `materialize()` before returning results.
  - Affected methods: `hasNode()`, `getNodeProps()`, `neighbors()`, `getNodes()`, `getEdges()`, `query().run()`, all `traverse.*` methods.
  - When `autoMaterialize === false`, preserve current behavior (throw or return stale).
  - Guard must be async-safe (callers already await these methods).
  - **Core invariant: concurrent auto-materialize calls MUST coalesce.** Store one in-flight materialize promise on the graph instance; concurrent callers await it; clear when resolved/rejected. Without this, N concurrent queries trigger N materializations and the library becomes unusable under load.
- **Acceptance Criteria:**
  - With autoMaterialize on: open graph → addNode → commit → hasNode returns true (no explicit materialize).
  - With autoMaterialize on: open graph → query().run() works on first call (no prior materialize).
  - With autoMaterialize off: current behavior unchanged.
  - 20 concurrent queries trigger exactly 1 materialize() call (coalescing invariant).
- **Scope:** Add guard to all query entry points with materialize coalescing.
- **Out of Scope:** Incremental/partial materialization strategy.
- **Estimated Hours:** 4
- **Estimated LOC:** ~60 prod + ~200 test
- **Blocked by:** AP/LAZY/1, AP/INVAL/1
- **Blocking:** None
- **Definition of Done:** All query methods auto-materialize when enabled. Concurrent calls coalesce. Existing tests unaffected.
- **Test Plan:**
  - Golden path: fresh open → query with autoMaterialize → results returned.
  - Golden path: dirty state → query → auto-rematerializes → fresh results.
  - Known failures: autoMaterialize off → null state → appropriate error.
  - **Core invariant test:** 20 concurrent queries → exactly 1 materialize() call triggered.
  - Stress: 50 rapid queries, coalescing verified via spy count.

---

### Feature: AP/CKPT — Periodic Auto-Checkpointing

**Rationale:** Users who never think about checkpoints accumulate unbounded patch chains, making materialization increasingly expensive. A checkpoint policy eliminates this silently.

#### AP/CKPT/1 — Add checkpointPolicy option to WarpGraph.open()

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to configure automatic checkpointing so materialization stays fast without manual intervention.
- **Requirements:**
  - Add `checkpointPolicy: { every: number }` option to `WarpGraph.open()`.
  - `every` = number of patches since last checkpoint before auto-checkpoint triggers.
  - Validate: `every` must be positive integer.
  - Store as instance property.
- **Acceptance Criteria:**
  - `WarpGraph.open({ ..., checkpointPolicy: { every: 500 } })` succeeds.
  - Invalid values rejected with clear error.
- **Scope:** Option parsing and storage.
- **Out of Scope:** Actual checkpoint triggering (that's AP/CKPT/2–3).
- **Estimated Hours:** 1
- **Estimated LOC:** ~20 prod + ~40 test
- **Blocked by:** None
- **Blocking:** AP/CKPT/3
- **Definition of Done:** Option accepted, validated, stored.
- **Test Plan:**
  - Golden path: open with valid policy.
  - Known failures: `every: 0`, `every: -1`, `every: 'foo'`.

#### AP/CKPT/2 — Track patch count since last checkpoint

- **Status:** `CLOSED`
- **User Story:** As the system, I need to know how many patches have been applied since the last checkpoint to decide when to auto-checkpoint.
- **Requirements:**
  - During `materialize()`, count patches loaded since the last checkpoint (or total if no checkpoint).
  - Store count as `_patchesSinceCheckpoint` on WarpGraph instance.
  - Increment on each local commit.
- **Acceptance Criteria:**
  - After materialize with checkpoint + 10 patches, count = 10.
  - After materialize with no checkpoint + 50 patches, count = 50.
  - After local commit, count increments by 1.
- **Scope:** Counting only. No triggering.
- **Out of Scope:** Remote patch counting.
- **Estimated Hours:** 2
- **Estimated LOC:** ~30 prod + ~80 test
- **Blocked by:** None
- **Blocking:** AP/CKPT/3
- **Definition of Done:** Count accurately tracks patches since checkpoint.
- **Test Plan:**
  - Golden path: checkpoint → 10 patches → materialize → count = 10.
  - Edge cases: no checkpoint exists, count starts from zero.

#### AP/CKPT/3 — Wire auto-checkpoint into materialize() path

- **Status:** `CLOSED`
- **User Story:** As a developer, I want checkpoints created automatically when my patch count exceeds the threshold.
- **Requirements:**
  - At the end of `materialize()`, if `checkpointPolicy` is set and `_patchesSinceCheckpoint >= policy.every`, call `createCheckpoint()`.
  - Reset `_patchesSinceCheckpoint` after successful checkpoint.
  - Log checkpoint creation via LoggerPort.
  - Do not block the materialize return on checkpoint failure — log warning and continue.
- **Acceptance Criteria:**
  - With `checkpointPolicy: { every: 5 }`, after 5 patches, `materialize()` creates a checkpoint.
  - After auto-checkpoint, next materialize is incremental from new checkpoint.
  - Checkpoint failure does not break materialize.
- **Scope:** Wire trigger into materialize path.
- **Out of Scope:** Checkpoint policy based on time or size.
- **Estimated Hours:** 3
- **Estimated LOC:** ~40 prod + ~120 test
- **Blocked by:** AP/CKPT/1, AP/CKPT/2
- **Blocking:** None
- **Definition of Done:** Auto-checkpointing works end-to-end. Incremental materialize benefits confirmed.
- **Test Plan:**
  - Golden path: 5 patches → materialize → checkpoint created → next materialize is incremental.
  - Known failures: checkpoint creation fails → materialize still succeeds.
  - Edge cases: exactly at threshold, just below threshold, policy not set.

---

### Feature: AP/HOOK — Post-Merge Git Hook for Staleness Notification

**Rationale:** When a `git pull` or merge brings in new warp refs, the local cached state is silently stale. A lightweight hook provides immediate feedback.

#### AP/HOOK/1 — Write post-merge hook script

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to be notified when a git pull changes warp refs so I know to rematerialize.
- **Requirements:**
  - Shell script that runs after `git merge` / `git pull`.
  - Compares warp refs before and after merge (using `git diff` on refs/warp/).
  - If any refs changed, prints: `[warp] Writer refs changed during merge. Call materialize() to see updates.`
  - Exit 0 always (informational, never blocks merge).
- **Acceptance Criteria:**
  - After `git pull` that changes warp refs, warning printed.
  - After `git pull` with no warp ref changes, no output.
  - Hook never causes merge to fail.
- **Scope:** post-merge hook only.
- **Out of Scope:** post-rebase, post-checkout, automatic rematerialization.
- **Estimated Hours:** 2
- **Estimated LOC:** ~40 hook script + ~60 test
- **Blocked by:** None
- **Blocking:** AP/HOOK/2
- **Definition of Done:** Hook detects warp ref changes and prints warning.
- **Test Plan:**
  - Golden path: simulate merge with ref changes → warning printed.
  - Edge cases: no warp refs at all, refs directory doesn't exist.

#### AP/HOOK/2 — Integrate hook into install scripts

- **Status:** `CLOSED`
- **User Story:** As a developer, I want the post-merge hook installed automatically alongside existing hooks.
- **Requirements:**
  - Add `post-merge` to the hooks installed by `scripts/setup-hooks.js`.
  - Document in README or GUIDE.md.
- **Acceptance Criteria:**
  - After `npm install`, post-merge hook is active.
  - Existing pre-commit hook unaffected.
- **Scope:** Installation wiring.
- **Out of Scope:** Uninstall script.
- **Estimated Hours:** 1
- **Estimated LOC:** ~20 prod + ~20 test
- **Blocked by:** AP/HOOK/1
- **Blocking:** None
- **Definition of Done:** Hook installed automatically on npm install.
- **Test Plan:**
  - Golden path: fresh npm install → hook exists in .git/hooks/.
  - Edge cases: .git/hooks doesn't exist (created).

---

## Milestone 2 — GROUNDSKEEPER (v7.2.0)

**Self-Managing Infrastructure**

Once the materialize tax is gone, the next friction layer is infrastructure that requires manual babysitting: indexes, GC, and frontier tracking.

### Feature: GK/IDX — Index Staleness Tracking

**Rationale:** Users can't tell if their bitmap index is stale. Today it's a mystery. Storing the frontier at build time makes staleness detection a cheap O(writers) ref comparison.

#### GK/IDX/1 — Store frontier snapshot in index metadata at build time

- **Status:** `CLOSED`
- **User Story:** As the system, I need to record the frontier when an index was built so I can later detect staleness.
- **Requirements:**
  - At `BitmapIndexBuilder.serialize()` time, accept and store current frontier (writer ID → tip SHA map).
  - **Authoritative format:** Write `frontier.cbor` blob in the index tree using the existing CborCodec. CBOR gives deterministic bytes, faster parsing on the hot staleness-check path, and prevents manual edits from creating lies.
  - **Debug artifact:** Also write `frontier.json` blob as a human-readable debug artifact, generated from the same data. This is optional output — the system never reads from it.
  - CBOR payload: `{ version: 1, writerCount: N, frontier: { "alice": "abc...", "bob": "def..." } }`.
  - JSON payload: identical structure, canonical JSON (sorted keys, no whitespace variance, UTF-8).
  - On read (GK/IDX/2), prefer `frontier.cbor`; fall back to `frontier.json` if CBOR missing (forward compat during rollout).
- **Acceptance Criteria:**
  - Built index contains `frontier.cbor` with correct writer tips.
  - Built index contains `frontier.json` as debug artifact.
  - Existing index loading code ignores both files if not present (backward compat).
- **Scope:** Write frontier metadata at build time.
- **Out of Scope:** Reading/comparing frontier (that's GK/IDX/2).
- **Estimated Hours:** 3
- **Estimated LOC:** ~60 prod + ~80 test
- **Blocked by:** None
- **Blocking:** GK/IDX/2
- **Definition of Done:** Index tree contains frontier metadata in both CBOR (authoritative) and JSON (debug). Backward compatible with existing indexes.
- **Test Plan:**
  - Golden path: build index → frontier.cbor present with correct data, frontier.json present and matches.
  - Edge cases: empty frontier (no writers), single writer.
  - Round-trip: CBOR encode → decode matches original frontier map.

#### GK/IDX/2 — Detect and report index staleness on load

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to know if my index is stale so I can decide whether to rebuild.
- **Requirements:**
  - On `loadIndex()`, read `frontier.cbor` (or `frontier.json` fallback) from index tree.
  - Compare stored frontier against current writer refs.
  - **Default behavior: warn only.** If diverged, log warning via LoggerPort: `[warp] Index is stale. N writers have advanced since last build. Call rebuildIndex() to update.`
  - **Opt-in rebuild:** Add `autoRebuild: boolean` option (default `false`). When `true`, trigger rebuild on staleness. Users must explicitly opt in to expensive work.
  - Warning message must include clear "what to do next" guidance.
- **Acceptance Criteria:**
  - Stale index → warning logged with recovery guidance.
  - Fresh index → no warning.
  - `autoRebuild: true` → index rebuilt automatically.
  - `autoRebuild: false` (default) → warning only, no rebuild.
- **Scope:** Staleness detection and optional auto-rebuild.
- **Out of Scope:** Incremental index update (always full rebuild).
- **Estimated Hours:** 4
- **Estimated LOC:** ~60 prod + ~120 test
- **Blocked by:** GK/IDX/1
- **Blocking:** None
- **Definition of Done:** Stale indexes detected and reported with guidance. Auto-rebuild works only when explicitly enabled.
- **Test Plan:**
  - Golden path: build index → advance writer → load → warning logged with guidance.
  - Golden path: build index → load immediately → no warning.
  - Golden path: build index → advance writer → load with autoRebuild:true → index rebuilt.
  - Known failures: index has no frontier.cbor/frontier.json (legacy) → no warning, no crash.
  - Edge cases: new writer added since index build, writer removed.

---

### Feature: GK/GC — Auto-GC After Materialization

**Rationale:** `maybeRunGC()` exists but is never called unless the user remembers. Wire it into the materialize path so tombstones are cleaned up automatically.

#### GK/GC/1 — Wire GC check into post-materialize path

- **Status:** `CLOSED`
- **User Story:** As a developer, I want tombstones cleaned up automatically so I don't have to think about GC.
- **Requirements:**
  - Accept `gcPolicy` option on `WarpGraph.open()`: `{ enabled: boolean, tombstoneRatioThreshold?: number, ... }`.
  - **Default behavior: warn only.** When no `gcPolicy` is set (or `enabled: false`), log a warning via LoggerPort when thresholds are exceeded but do NOT execute GC. Users must never be surprised by expensive work they didn't ask for.
  - **Opt-in execution:** When `gcPolicy: { enabled: true }` is set, after `materialize()` completes (and after optional auto-checkpoint), check `getGCMetrics()` against policy thresholds and execute GC if exceeded.
  - Flow: `materialize() → apply patches → maybe checkpoint → maybe warn/GC`.
  - Log GC execution and results via LoggerPort.
  - GC failure does not break materialize — log warning and continue.
- **Acceptance Criteria:**
  - No gcPolicy set + 40% tombstone ratio → warning logged, GC does NOT run.
  - `gcPolicy: { enabled: true }` + 40% tombstone ratio (threshold 30%) → GC runs automatically.
  - `gcPolicy: { enabled: true }` + 10% tombstone ratio → GC does not run.
  - GC failure logged but materialize still returns valid state.
- **Scope:** Wire existing GC into materialize path with opt-in semantics.
- **Out of Scope:** New GC algorithms, concurrent GC.
- **Estimated Hours:** 3
- **Estimated LOC:** ~30 prod + ~100 test
- **Blocked by:** None (uses existing GC infrastructure)
- **Blocking:** None
- **Definition of Done:** GC warns by default, runs only when explicitly enabled, and never surprises users with unexpected latency.
- **Test Plan:**
  - Golden path: gcPolicy enabled + many tombstones → materialize → GC runs.
  - Golden path: gcPolicy absent + many tombstones → warning logged, no GC.
  - Known failures: GC throws → materialize still succeeds.
  - Edge cases: exactly at threshold, gcPolicy not configured, gcPolicy enabled with custom thresholds.

---

### Feature: GK/FRONTIER — Frontier Change Detection

**Rationale:** A cheap way to check "has anything changed?" without full materialization enables efficient polling and is the foundation for the PULSE milestone's watch API.

#### GK/FRONTIER/1 — Implement hasFrontierChanged() method

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to cheaply check if the graph has new data without materializing.
- **Requirements:**
  - `graph.hasFrontierChanged()` compares `_cachedState.observedFrontier` against current writer refs.
  - Returns `boolean`.
  - O(writers) cost — one ref read per writer.
  - If `_cachedState` is null, returns `true` (unknown = assume changed).
- **Acceptance Criteria:**
  - No changes since materialize → returns `false`.
  - New patch committed by another writer → returns `true`.
  - No prior materialize → returns `true`.
- **Scope:** Read-only comparison method.
- **Out of Scope:** File-system watching, push notifications.
- **Estimated Hours:** 3
- **Estimated LOC:** ~40 prod + ~100 test
- **Blocked by:** None
- **Blocking:** PL/WATCH/2
- **Definition of Done:** Method returns correct result for all frontier states.
- **Test Plan:**
  - Golden path: materialize → no changes → false. Materialize → external commit → true.
  - Edge cases: new writer appears, writer ref deleted, empty graph.
  - Stress: call 1000 times in sequence — consistent results, no leaks.

---

## Milestone 3 — WEIGHTED (v7.3.0)

**Edge Properties**

Extends the data model to support properties on edges, enabling weighted graphs, typed relationships, and richer domain models.

### Feature: WT/EPKEY — EdgePropKey Encoding

**Rationale:** Edge properties need a deterministic, injective key encoding that avoids collisions with node property keys and is reversible for deserialization.

#### WT/EPKEY/1 — Design and implement encode/decode utilities

- **Status:** `CLOSED`
- **User Story:** As the system, I need a canonical encoding for edge property keys that is injective, reversible, and collision-free with node property keys.
- **Requirements:**
  - `encodeEdgePropKey(from, to, label, propKey)` → deterministic string.
  - `decodeEdgePropKey(encoded)` → `{ from, to, label, propKey }`.
  - Encoding must be injective (no two distinct tuples produce the same key).
  - Must not collide with existing `encodePropKey(nodeId, key)` format (`"nodeId\0key"`).
  - Use a distinct separator or prefix to namespace edge props.
- **Acceptance Criteria:**
  - Round-trip: encode → decode === original for all valid inputs.
  - No collision with node property keys.
  - Deterministic (same input always produces same output).
- **Scope:** Pure encode/decode functions.
- **Out of Scope:** Integration with JoinReducer or patches.
- **Estimated Hours:** 3
- **Estimated LOC:** ~60 prod + ~100 test
- **Blocked by:** None
- **Blocking:** WT/OPS/1
- **Definition of Done:** Encode/decode passes round-trip, injectivity, and collision-freedom tests.
- **Test Plan:**
  - Golden path: encode → decode round-trip for typical edge + property.
  - Fuzz: 10,000 random (from, to, label, propKey) tuples — all round-trip correctly.
  - Edge cases: empty strings, strings containing separator characters, unicode.

---

### Feature: WT/OPS — Patch Ops for Edge Properties

**Rationale:** Edge properties need CRDT semantics (LWW) consistent with node properties, stored in the existing prop map via EdgePropKey.

#### WT/OPS/1 — Extend PatchBuilderV2 with edge property ops

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to set properties on edges using the patch builder API.
- **Requirements:**
  - Add `setEdgeProperty(from, to, label, key, value)` to `PatchBuilderV2`.
  - Generates a `PropSet` op with `edgePropKey`-encoded key.
  - Validates that edge exists in current state (or was added in current patch).
- **Acceptance Criteria:**
  - `patch.setEdgeProperty('a', 'b', 'likes', 'weight', 0.8)` succeeds.
  - Property stored under edge prop key namespace.
- **Scope:** Patch builder API extension.
- **Out of Scope:** Query-time retrieval (that's WT/OPS/3).
- **Estimated Hours:** 3
- **Estimated LOC:** ~50 prod + ~80 test
- **Blocked by:** WT/EPKEY/1
- **Blocking:** WT/OPS/2, WT/OPS/3
- **Definition of Done:** Edge properties can be set via patch builder.
- **Test Plan:**
  - Golden path: add edge → set edge property → commit succeeds.
  - Known failures: set property on non-existent edge → error.
  - Edge cases: set property on edge added in same patch.

#### WT/OPS/2 — LWW semantics for edge properties in JoinReducer

- **Status:** `CLOSED`
- **User Story:** As the system, concurrent edge property writes must resolve deterministically via LWW.
- **Requirements:**
  - Edge property `PropSet` ops processed identically to node property `PropSet` ops in JoinReducer.
  - LWW ordering: lamport → writerId → patchSha → opIndex.
  - No special-case logic — the existing LWW path handles edge props via key namespace.
- **Acceptance Criteria:**
  - Two writers set same edge property concurrently → higher EventId wins.
  - Result matches deterministic re-materialization.
- **Scope:** Verify and test existing LWW path with edge prop keys.
- **Out of Scope:** New CRDT semantics for edge props.
- **Estimated Hours:** 2
- **Estimated LOC:** ~20 prod + ~120 test
- **Blocked by:** WT/OPS/1
- **Blocking:** None
- **Definition of Done:** Concurrent edge property writes resolve deterministically.
- **Test Plan:**
  - Golden path: two writers set same edge prop → materialize → LWW winner correct.
  - Fuzz: random interleaving of edge prop sets → deterministic result.
  - Edge cases: same lamport, different writers (writerId tiebreak).

#### WT/OPS/3 — Surface edge properties in materialization and queries

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to read edge properties after materialization.
- **Requirements:**
  - `getEdges()` returns edge objects with `props` field.
  - `query().outgoing()` / `.incoming()` results include edge props.
  - Edge props in query node snapshots (`edgesOut`, `edgesIn`) include props.
  - Canonical JSON ordering for edge props.
- **Acceptance Criteria:**
  - `getEdges()` returns `[{ from, to, label, props: { weight: 0.8 } }]`.
  - Query results include edge props when `select(['props'])` used.
- **Scope:** Read-side surface of edge properties.
- **Out of Scope:** Edge property filtering/indexing.
- **Estimated Hours:** 4
- **Estimated LOC:** ~80 prod + ~150 test
- **Blocked by:** WT/OPS/1
- **Blocking:** None
- **Definition of Done:** Edge properties visible in all read paths.
- **Test Plan:**
  - Golden path: set edge prop → materialize → getEdges returns props.
  - Golden path: query with outgoing → edge snapshot includes props.
  - Edge cases: edge with no props (empty object), edge with many props.

---

### Feature: WT/VIS — Edge Property Visibility Rules

**Rationale:** Edge properties must be invisible when their parent edge is tombstoned, and behavior on edge re-add must be well-defined.

#### WT/VIS/1 — Gate edge property visibility on edge aliveness

- **Status:** `CLOSED`
- **User Story:** As a developer, I expect edge properties to disappear when the edge is removed.
- **Requirements:**
  - `getEdges()` and query results omit props for edges not in `edgeAlive` OR-Set.
  - Property data remains in `prop` map (for potential re-add), but is not surfaced.
  - Re-adding a previously removed edge does NOT restore old properties (clean slate).
- **Acceptance Criteria:**
  - Remove edge → getEdges excludes it → props invisible.
  - Re-add same edge → props are empty (not restored from before removal).
- **Scope:** Visibility gating logic.
- **Out of Scope:** Property cleanup/GC.
- **Estimated Hours:** 3
- **Estimated LOC:** ~40 prod + ~100 test
- **Blocked by:** WT/OPS/3
- **Blocking:** None
- **Definition of Done:** Edge props correctly gated by edge aliveness.
- **Test Plan:**
  - Golden path: add edge with props → remove edge → props invisible → re-add → props empty.
  - Edge cases: concurrent add and remove with props.

---

### Feature: WT/SCHEMA — Schema v3 + Compatibility

**Rationale:** Edge properties require a schema version bump. Existing v2 data must remain readable.

#### WT/SCHEMA/1 — Define schema v3 format

- **Status:** `CLOSED`
- **User Story:** As the system, I need a new schema version that supports edge properties while remaining backward compatible.
- **Requirements:**
  - Bump patch schema to `3`.
  - Schema v3 patches may contain edge property `PropSet` ops with edge prop keys.
  - Schema v2 patches remain valid (no edge prop ops).
  - `WarpMessageCodec` handles both v2 and v3 decoding.
- **Acceptance Criteria:**
  - v3 patches encode/decode correctly.
  - v2 patches still load without error.
- **Scope:** Schema definition and codec update.
- **Out of Scope:** Migration tooling.
- **Estimated Hours:** 3
- **Estimated LOC:** ~60 prod + ~80 test
- **Blocked by:** WT/EPKEY/1
- **Blocking:** WT/SCHEMA/2

#### WT/SCHEMA/2 — Mixed-version sync safety

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to sync between v2 and v3 writers without data loss.
- **Requirements:**
  - **Decision: fail fast. Never silently drop data.**
  - v3 writer syncing with v2 writer: v2 patches applied normally (no edge props). This direction is safe.
  - v2 writer encountering v3 patch: throw `E_SCHEMA_UNSUPPORTED` with message: "Upgrade to >=7.3.0 (WEIGHTED) to sync edge properties."
  - **Rationale:** Silent dropping is data corruption with a smile. Users will sync, lose edge property semantics, and only notice when it's too late. Failing fast forces a conscious upgrade decision.
  - Exception: v3 patches containing only node/edge ops (no edge property ops) SHOULD be accepted by v2 readers — the schema bump alone is not a rejection criterion; only unknown op types trigger rejection.
- **Acceptance Criteria:**
  - v3→v2 sync with edge prop ops → `E_SCHEMA_UNSUPPORTED` error with upgrade guidance.
  - v3→v2 sync with only node/edge ops → succeeds (no edge prop ops to misunderstand).
  - v2→v3 sync → succeeds (v2 patches are always valid v3 input).
  - No silent data corruption in any direction.
- **Scope:** Sync compatibility behavior.
- **Out of Scope:** Online migration, schema negotiation protocol, explicit version downgrade path.
- **Estimated Hours:** 4
- **Estimated LOC:** ~60 prod + ~150 test
- **Blocked by:** WT/SCHEMA/1
- **Blocking:** None
- **Definition of Done:** Mixed-version sync tested. v2 readers fail fast on unknown ops with actionable error.
- **Test Plan:**
  - Golden path: v2→v3 sync succeeds.
  - Golden path: v3→v2 sync with edge prop ops → E_SCHEMA_UNSUPPORTED.
  - Golden path: v3→v2 sync with node-only ops → succeeds.
  - Known failures: unsupported schema error includes version and upgrade guidance.
  - Edge cases: v3 patch with only node ops (should work with v2).

---

## Milestone 4 — HANDSHAKE (v7.4.0)

**Multi-Writer Ergonomics**

The multi-writer story works but has sharp edges around writer identity, sync workflows, and error diagnostics.

### Feature: HS/WRITER — Simplify Writer Identity

**Rationale:** Three ways to get a writer (`writer()`, `writer('id')`, `createWriter()`) with different persistence semantics is confusing. Consolidate to two.

#### HS/WRITER/1 — Consolidate to two-form writer() API

- **Status:** `CLOSED`
- **User Story:** As a developer, I want one obvious way to get a writer so I don't have to understand three different methods.
- **Requirements:**
  - `graph.writer()` — stable identity, resolved from git config or generated and persisted on first use.
  - `graph.writer('explicit-id')` — explicit identity, no side effects.
  - `createWriter()` deprecated with console warning pointing to `writer()`.
  - `{ persist: 'config' }` option moves to the no-arg `writer()` form.
- **Acceptance Criteria:**
  - `graph.writer()` returns same ID across calls.
  - `graph.writer('alice')` returns writer with ID 'alice'.
  - `graph.createWriter()` logs deprecation warning.
- **Scope:** API consolidation with deprecation.
- **Out of Scope:** Removing `createWriter()` (keep for 1 minor version).
- **Estimated Hours:** 4
- **Estimated LOC:** ~60 prod + ~120 test
- **Blocked by:** None
- **Blocking:** None
- **Definition of Done:** Two-form API works. Deprecation warning emitted. Existing tests updated.
- **Test Plan:**
  - Golden path: `writer()` persists identity across calls.
  - Golden path: `writer('id')` uses explicit identity.
  - Known failures: `createWriter()` still works but warns.
  - Edge cases: git config not writable (fallback to in-memory).

---

### Feature: HS/SYNC — Sync-then-Materialize

**Rationale:** The most common sync footgun is syncing onto stale state, then forgetting to rematerialize. Make it a single operation.

#### HS/SYNC/1 — Add materialize option to syncWith()

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to sync and rematerialize in one call so I can't forget.
- **Requirements:**
  - Add `{ materialize: boolean }` option to `syncWith()` (default `false`).
  - When `true`, call `materialize()` after applying sync response.
  - Return value includes materialization result when enabled.
- **Acceptance Criteria:**
  - `syncWith(remote, { materialize: true })` returns fresh state.
  - `syncWith(remote)` preserves current behavior.
- **Scope:** Option wiring.
- **Out of Scope:** Automatic materialization without opt-in.
- **Estimated Hours:** 2
- **Estimated LOC:** ~20 prod + ~60 test
- **Blocked by:** None
- **Blocking:** None
- **Definition of Done:** Sync + materialize works as single call.
- **Test Plan:**
  - Golden path: sync with materialize → query returns remote data.
  - Edge cases: sync applies 0 patches → materialize still runs.

---

### Feature: HS/ERR — Actionable Error Messages

**Rationale:** "No cached state. Call materialize() first" doesn't distinguish between three different situations, each with a different fix.

#### HS/ERR/1 — Audit and classify existing error messages

- **Status:** `CLOSED`
- **User Story:** As a developer, I want error messages that tell me exactly what went wrong and how to fix it.
- **Requirements:**
  - Audit all error throws in WarpGraph.js and services.
  - Classify each by cause: never-materialized, stale-after-write, stale-after-sync, configuration, validation.
  - Document findings in a checklist for HS/ERR/2.
- **Acceptance Criteria:**
  - Complete audit report with each error classified.
- **Scope:** Audit and classification only.
- **Out of Scope:** Changing error messages (that's HS/ERR/2).
- **Estimated Hours:** 2
- **Estimated LOC:** ~0 prod (audit only, produces notes for HS/ERR/2)
- **Blocked by:** None
- **Blocking:** HS/ERR/2
- **Definition of Done:** Audit complete with classification of all error paths.
- **Test Plan:** N/A (research task).

#### HS/ERR/2 — Add error codes and recovery hints

- **Status:** `CLOSED`
- **User Story:** As a developer, I want error codes I can match on and human-readable recovery instructions.
- **Requirements:**
  - Each domain error gets a unique code (e.g., `E_STATE_NEVER_MATERIALIZED`, `E_STATE_STALE_WRITE`, `E_STATE_STALE_SYNC`).
  - Error `.message` includes recovery hint (e.g., "Call materialize() to load initial state").
  - Error `.code` property for programmatic matching.
  - Backward compatible: existing error types unchanged, codes added.
- **Acceptance Criteria:**
  - Each error path produces distinct code and actionable message.
  - `catch (e) { if (e.code === 'E_STATE_STALE_WRITE') ... }` works.
- **Scope:** Error codes and messages for state-related errors.
- **Out of Scope:** Error codes for all domain errors (scope to state errors first).
- **Estimated Hours:** 4
- **Estimated LOC:** ~80 prod + ~120 test
- **Blocked by:** HS/ERR/1
- **Blocking:** None
- **Definition of Done:** State errors distinguishable by code with recovery hints. Tests verify each error path.
- **Test Plan:**
  - Golden path: trigger each error condition → verify code and message.
  - Edge cases: error in async context preserves code.

---

### Feature: HS/CAS — CAS Failure Recovery

**Rationale:** When `commitPatch()` fails because another process updated the writer ref, the error is a generic Git ref-update failure. It should explain what happened and suggest retry.

#### HS/CAS/1 — Detect and surface CAS failures with guidance

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to know when my commit failed due to a concurrent write, not a Git error.
- **Requirements:**
  - Detect when `PatchBuilderV2.commit()` fails due to ref compare-and-swap mismatch.
  - Throw `WriterError` with code `WRITER_CAS_CONFLICT`.
  - Message: "Commit failed: writer ref was updated by another process. Re-materialize and retry."
  - Include `expectedSha` and `actualSha` in error properties for diagnostics.
- **Acceptance Criteria:**
  - Concurrent commit by another process → `WRITER_CAS_CONFLICT` error.
  - Error includes both expected and actual SHAs.
- **Scope:** Error detection and reporting.
- **Out of Scope:** Automatic retry logic.
- **Estimated Hours:** 3
- **Estimated LOC:** ~40 prod + ~80 test
- **Blocked by:** None
- **Blocking:** None
- **Definition of Done:** CAS failures produce descriptive error with recovery guidance.
- **Test Plan:**
  - Golden path: simulate concurrent ref update → verify error code and properties.
  - Edge cases: ref deleted between begin and commit.

---

### Feature: HS/DELGUARD — Deletion Guards

**Rationale:** `NodeRemove` doesn't check for attached data. Nodes get tombstoned, properties become orphaned, edges become dangling references. This is silent data corruption.

#### HS/DELGUARD/1 — Add onDeleteWithData policy option

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to configure what happens when I delete a node that has properties or edges.
- **Requirements:**
  - Add `onDeleteWithData: 'reject' | 'cascade' | 'warn'` option to `WarpGraph.open()`.
  - Default: `'warn'` (preserves current implicit behavior, made explicit).
  - Validate option value.
- **Acceptance Criteria:**
  - Option accepted and stored.
  - Invalid values rejected.
- **Scope:** Option parsing only.
- **Out of Scope:** Enforcement logic (that's HS/DELGUARD/2–3).
- **Estimated Hours:** 1
- **Estimated LOC:** ~15 prod + ~30 test
- **Blocked by:** None
- **Blocking:** HS/DELGUARD/2, HS/DELGUARD/3

#### HS/DELGUARD/2 — Implement reject and warn modes

- **Status:** `CLOSED`
- **User Story:** As a developer, I want node deletion to fail or warn when the node has attached data.
- **Requirements:**
  - **Two-layer validation:**
    - **PatchBuilder (best-effort):** When `removeNode()` is called, check cached state for attached edges/props. If found, fail early (reject) or warn immediately. This catches most issues at build time with zero network cost.
    - **Commit path (authoritative):** In `commitPatch()`, before finalizing, re-inspect `NodeRemove` ops against the state at commit time (post-CAS). This is the ground truth because patches may be built against stale state.
  - `'reject'`: throw error listing the attached data.
  - `'warn'`: log warning via LoggerPort, proceed with deletion.
  - **Rationale:** Fail early when possible, recheck at commit time because of CAS and sync realities.
- **Acceptance Criteria:**
  - Reject mode: delete node with props → error thrown, commit aborted.
  - Reject mode: delete node with edges → error thrown, commit aborted.
  - Warn mode: delete node with props → warning logged, commit succeeds.
  - Delete node with no data → succeeds in all modes.
  - Best-effort validation catches issues even when commit-time check isn't reached.
- **Scope:** Reject and warn validation at both patch-build and commit time.
- **Out of Scope:** Cascade mode (that's HS/DELGUARD/3).
- **Estimated Hours:** 4
- **Estimated LOC:** ~80 prod + ~150 test
- **Blocked by:** HS/DELGUARD/1
- **Blocking:** None
- **Definition of Done:** Reject and warn modes work correctly at both validation layers.
- **Test Plan:**
  - Golden path: reject mode blocks deletion of node with props.
  - Golden path: reject mode blocks deletion of node with edges.
  - Golden path: warn mode logs and proceeds.
  - Golden path: best-effort validation catches issue at build time (before commit).
  - Edge cases: node with both props and edges, node with only outgoing edges, node with only incoming edges, stale state at build time but fresh at commit time.

#### HS/DELGUARD/3 — Implement cascade mode

- **Status:** `CLOSED`
- **User Story:** As a developer, I want the option to automatically clean up edges and properties when I delete a node.
- **Requirements:**
  - `'cascade'`: auto-generate `EdgeRemove` ops for all connected edges and clear properties before `NodeRemove`.
  - Generated ops use current state's observed dots.
  - Generated ops appear in the committed patch (auditable).
- **Acceptance Criteria:**
  - Cascade mode: delete node with 3 edges → patch contains 3 EdgeRemove + NodeRemove.
  - After cascade delete, no orphaned properties or dangling edges.
  - Materialized state is clean.
- **Scope:** Cascade deletion logic.
- **Out of Scope:** Recursive cascade (deleting connected nodes).
- **Estimated Hours:** 5
- **Estimated LOC:** ~100 prod + ~180 test
- **Blocked by:** HS/DELGUARD/1
- **Blocking:** None
- **Definition of Done:** Cascade mode produces clean state. Generated ops visible in patch.
- **Test Plan:**
  - Golden path: cascade delete node with edges and props → clean state.
  - Fuzz: random graph → cascade delete random node → materialize → no orphans.
  - Edge cases: node with self-loop, node with both in and out edges to same peer.

---

## Milestone 5 — COMPASS (v7.5.0)

**Advanced Query Language**

The fluent query builder is functional but limited. As graphs get larger, users need filtering, aggregation, and multi-hop traversal without writing imperative loops.

### Feature: CP/WHERE — Property Filters with Object Syntax

**Rationale:** `.where()` currently only accepts predicate functions. Object shorthand covers the 80% case (equality checks) more concisely.

#### CP/WHERE/1 — Implement object shorthand in where()

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to filter nodes by property equality without writing a function.
- **Requirements:**
  - `where({ role: 'admin' })` filters nodes where `props.role === 'admin'`.
  - `where({ role: 'admin', active: true })` requires all properties to match (AND).
  - Object form and function form can be mixed via chaining: `.where({ role: 'admin' }).where(n => n.props.age > 18)`.
  - Detect argument type (object vs function) and dispatch accordingly.
- **Acceptance Criteria:**
  - Object filter matches nodes with exact property values.
  - Multiple properties = AND semantics.
  - Chained where() calls = AND semantics.
  - Non-existent property in filter → node excluded.
- **Scope:** Equality filters via object syntax.
- **Out of Scope:** Comparison operators ($gt, $lt, etc.), nested property paths.
- **Estimated Hours:** 3
- **Estimated LOC:** ~40 prod + ~120 test
- **Blocked by:** None
- **Blocking:** None
- **Definition of Done:** Object where filters work alongside existing predicate filters.
- **Test Plan:**
  - Golden path: `where({ role: 'admin' })` returns only admin nodes.
  - Golden path: chained object + function filters.
  - Edge cases: empty object (matches all), property value is null, property value is array.

---

### Feature: CP/MULTIHOP — Multi-Hop Traversal in Queries

**Rationale:** Multi-hop today requires chaining multiple `.outgoing()` calls or dropping to the imperative `traverse` API. A depth range parameter makes common patterns one-liners.

#### CP/MULTIHOP/1 — Add depth option to outgoing/incoming

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to traverse 1–3 hops in a single query call.
- **Requirements:**
  - `outgoing(label, { depth: [1, 3] })` traverses 1 to 3 hops.
  - `outgoing(label, { depth: 2 })` shorthand for exactly 2 hops.
  - Default depth: `[1, 1]` (current behavior).
  - Result includes all nodes reachable within depth range (union).
  - Cycle detection: visited nodes not re-expanded.
  - Deterministic output ordering.
- **Acceptance Criteria:**
  - `depth: [1, 3]` returns nodes at hop 1, 2, and 3.
  - `depth: 2` returns nodes at exactly hop 2.
  - Cycles don't cause infinite loops.
- **Scope:** Depth range for query traversal.
- **Out of Scope:** Returning path information, weighted traversal.
- **Estimated Hours:** 5
- **Estimated LOC:** ~80 prod + ~200 test
- **Blocked by:** None
- **Blocking:** None
- **Definition of Done:** Multi-hop traversal works with depth ranges. Deterministic and cycle-safe.
- **Test Plan:**
  - Golden path: linear chain A→B→C→D, depth [1,3] from A returns B,C,D.
  - Golden path: depth 2 from A returns C only.
  - Fuzz: random graph, depth [1,5] → all results reachable within 5 hops.
  - Edge cases: cycle in graph, disconnected components, depth [0,0] (start node only).

---

### Feature: CP/AGG — Aggregation

**Rationale:** Count/sum/avg over matched nodes without materializing the full result set.

#### CP/AGG/1 — Implement aggregate() method

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to compute counts and sums over query results without fetching all nodes.
- **Requirements:**
  - `query().match('order:*').aggregate({ count: true, sum: 'props.total' }).run()`.
  - Returns `{ stateHash, count: number, sum: number }` (no `nodes` array).
  - Supported aggregations: `count`, `sum`, `avg`, `min`, `max`.
  - Property path must be dot-notation string.
  - Non-numeric values for sum/avg/min/max are skipped with optional warning.
  - `aggregate()` is terminal — calling `.select()` or `.outgoing()` after it throws.
- **Acceptance Criteria:**
  - Count returns correct node count.
  - Sum computes correctly over numeric property.
  - Non-numeric values silently skipped.
  - aggregate + select throws.
- **Scope:** Basic aggregation functions.
- **Out of Scope:** Group-by, having, nested aggregations.
- **Estimated Hours:** 5
- **Estimated LOC:** ~100 prod + ~180 test
- **Blocked by:** None
- **Blocking:** None
- **Definition of Done:** Aggregations produce correct results. Non-numeric handling defined.
- **Test Plan:**
  - Golden path: 10 order nodes with `total` prop → count=10, sum=correct.
  - Golden path: avg, min, max on numeric props.
  - Known failures: aggregate() + select() → error.
  - Edge cases: all non-numeric values (sum=0? or NaN?), empty match set, single node.

---

## Milestone 6 — LIGHTHOUSE (v7.6.0)

**Observability**

The library is opaque at runtime. Users can't see what's happening without adding their own instrumentation.

### Feature: LH/STATUS — graph.status() API

**Rationale:** A single method that reports everything about the graph's operational state. Today this information is scattered across multiple internal properties.

#### LH/STATUS/1 — Implement graph.status() method

- **Status:** `CLOSED`
- **User Story:** As a developer, I want a single call that tells me everything about my graph's health.
- **Requirements:**
  - Returns:
    ```javascript
    {
      cachedState: 'fresh' | 'stale' | 'none',
      patchesSinceCheckpoint: number,
      tombstoneRatio: number,
      writers: number,
      frontier: { [writerId]: string },
    }
    ```
  - `cachedState`: 'none' if never materialized, 'stale' if dirty flag set or frontier changed, 'fresh' otherwise.
  - Patch count from AP/CKPT/2 tracking (or computed from refs).
  - Tombstone ratio from existing `getGCMetrics()`.
  - Writers discovered from refs.
  - O(writers) cost, no materialization triggered.
- **Acceptance Criteria:**
  - Returns correct values for each field.
  - Does not trigger materialization.
- **Scope:** Status reporting method.
- **Out of Scope:** Historical status, status streaming.
- **Estimated Hours:** 4
- **Estimated LOC:** ~60 prod + ~120 test
- **Blocked by:** AP/INVAL/1 (dirty flag), AP/CKPT/2 (patch count)
- **Blocking:** LH/CLI/1
- **Definition of Done:** Status returns accurate operational health. Tested for all state combinations.
- **Test Plan:**
  - Golden path: fresh graph → status shows 'none' → materialize → 'fresh' → commit → 'stale'.
  - Edge cases: no writers, no checkpoint, no cached state.

---

### Feature: LH/TIMING — Operation Timing in LoggerPort

**Rationale:** The LoggerPort infrastructure exists but isn't wired into most operations.

#### LH/TIMING/1 — Add structured timing to core operations

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to see how long each operation takes so I can identify bottlenecks.
- **Requirements:**
  - Wrap `materialize()`, `syncWith()`, `createCheckpoint()`, `rebuildIndex()`, `runGC()` with timing.
  - Use existing `ClockPort` for timestamps.
  - Log via `LoggerPort` at info level: `[warp] materialize completed in 142ms (23 patches)`.
  - Include operation-specific metrics (patch count, sync applied count, etc.).
- **Acceptance Criteria:**
  - Each operation logs timing on completion.
  - Timing uses injected ClockPort (testable).
- **Scope:** Timing for 5 core operations.
- **Out of Scope:** Per-patch timing, flame graphs, tracing spans.
- **Estimated Hours:** 3
- **Estimated LOC:** ~50 prod + ~80 test
- **Blocked by:** None
- **Blocking:** None
- **Definition of Done:** Core operations emit timing logs. Verified with test logger.
- **Test Plan:**
  - Golden path: materialize with test logger → timing message captured.
  - Edge cases: operation fails → timing still logged with error context.

---

### Feature: LH/CLI — CLI Status Enhancement

**Rationale:** `git warp check` exists but should surface the full `graph.status()` output.

#### LH/CLI/1 — Wire graph.status() into CLI check output

- **Status:** `CLOSED`
- **User Story:** As a developer, I want `git warp check` to show the same info as `graph.status()`.
- **Requirements:**
  - `git warp check` outputs all fields from `graph.status()`.
  - JSON mode: raw status object.
  - Human mode: formatted table with color-coded staleness.
- **Acceptance Criteria:**
  - `git warp check --json` returns full status object.
  - Human output shows staleness, patch count, tombstone ratio, writer count.
- **Scope:** CLI wiring.
- **Out of Scope:** New CLI commands.
- **Estimated Hours:** 2
- **Estimated LOC:** ~30 prod + ~40 test (BATS)
- **Blocked by:** LH/STATUS/1
- **Blocking:** None
- **Definition of Done:** CLI check outputs full status. BATS tests verify JSON and human output.
- **Test Plan:**
  - Golden path: `git warp check --json` → valid JSON with all fields.
  - Edge cases: empty graph, no checkpoint.

---

### Feature: LH/RECEIPTS — Tick Receipts

**Rationale:** During `materialize()`, the system applies patches and discards all decision information. When two writers set the same property concurrently, LWW picks a winner and the losing write vanishes. For multi-writer production use, "why does this node have this value?" needs an answer. Receipts are also the foundation for provenance in HOLOGRAM.

#### LH/RECEIPTS/1 — Define receipt data structure

- **Status:** `CLOSED`
- **User Story:** As the system, I need a well-defined structure for recording materialization decisions.
- **Requirements:**
  - Define `TickReceipt` type:
    ```javascript
    {
      patchSha: string,
      writer: string,
      lamport: number,
      ops: Array<{
        op: string,          // 'NodeAdd' | 'PropSet' | etc.
        target: string,      // node or edge key
        result: 'applied' | 'superseded' | 'redundant',
        reason?: string,     // e.g., "LWW: writer bob at lamport 43 wins"
      }>
    }
    ```
  - Immutable after creation.
  - Canonical JSON serialization.
- **Acceptance Criteria:**
  - Type is importable and constructible.
  - Serializes to deterministic JSON.
- **Scope:** Type definition only.
- **Out of Scope:** Emission logic (that's LH/RECEIPTS/2).
- **Estimated Hours:** 2
- **Estimated LOC:** ~40 prod + ~30 test
- **Blocked by:** None
- **Blocking:** LH/RECEIPTS/2

#### LH/RECEIPTS/2 — Emit receipts during patch application

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to see exactly what happened during materialization — which ops were applied and which were superseded.
- **Requirements:**
  - Add `{ receipts: true }` option to `materialize()`.
  - When enabled, `JoinReducer.join()` records a `TickReceipt` for each patch.
  - For `PropSet`: record whether LWW applied or superseded (and who won).
  - For OR-Set add: record whether dot was new or re-add.
  - For OR-Set remove: record whether remove was effective.
  - Return receipts in materialize result: `{ state, receipts }`.
  - **Zero-cost invariant:** When `{ receipts: false }` (default), strictly zero overhead — no receipt array allocated, no decision strings constructed, no allocations on the hot path. This is non-negotiable. Receipts must never become a permanent perf tax that leaks into normal materialization.
- **Acceptance Criteria:**
  - `materialize({ receipts: true })` returns receipts array.
  - Each receipt corresponds to one patch with per-op decisions.
  - LWW conflicts show winner info in reason.
  - Default call has no receipt overhead.
- **Scope:** Receipt emission in JoinReducer.
- **Out of Scope:** Receipt persistence, receipt querying.
- **Estimated Hours:** 6
- **Estimated LOC:** ~120 prod + ~200 test
- **Blocked by:** LH/RECEIPTS/1
- **Blocking:** HG/IO/1 (foundation for provenance)
- **Definition of Done:** Receipts accurately describe all materialization decisions. Zero overhead when disabled.
- **Test Plan:**
  - Golden path: two writers set same prop → receipt shows winner and loser.
  - Golden path: add + concurrent remove → receipt shows OR-Set decision.
  - Known failures: receipts disabled → no receipt in result.
  - Fuzz: random 50-patch materialization → receipt count matches patch count.
  - Edge cases: empty patch (no ops), single-writer (no conflicts).

---

## Milestone 7 — PULSE (v7.7.0)

**Subscriptions & Reactivity**

Enable developers to react to graph changes without polling.

### Feature: PL/DIFF — State Diff Engine

**Rationale:** To notify subscribers of changes, we need a deterministic diff between two materialized states.

#### PL/DIFF/1 — Implement deterministic state diff

- **Status:** `CLOSED`
- **User Story:** As the system, I need to compute what changed between two materialized states.
- **Requirements:**
  - `diffStates(before, after)` returns:
    ```javascript
    {
      nodes: { added: string[], removed: string[] },
      edges: { added: EdgeKey[], removed: EdgeKey[] },
      props: { set: Array<{key, oldValue, newValue}>, removed: Array<{key, oldValue}> }
    }
    ```
  - Deterministic output ordering (sorted keys/IDs).
  - Handles null `before` (initial state = everything added).
  - O(N) where N = state size (single-pass comparison).
- **Acceptance Criteria:**
  - Adding a node shows up in `nodes.added`.
  - Removing a node shows up in `nodes.removed`.
  - Property change shows old and new value.
  - Output is deterministic across runs.
- **Scope:** Pure function, no integration with materialization.
- **Out of Scope:** Edge property diffs (deferred until WT lands).
- **Estimated Hours:** 4
- **Estimated LOC:** ~80 prod + ~150 test
- **Blocked by:** None
- **Blocking:** PL/SUB/1
- **Definition of Done:** Diff correctly captures all state changes. Deterministic.
- **Test Plan:**
  - Golden path: add/remove nodes/edges/props → diff reflects changes.
  - Edge cases: identical states (empty diff), null before, empty both.
  - Fuzz: random state pair → diff applied to before produces after.

---

### Feature: PL/SUB — graph.subscribe()

**Rationale:** Polling-based change detection is wasteful. Subscription allows reactive updates.

#### PL/SUB/1 — Implement subscribe/unsubscribe

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to register handlers that fire when the graph changes.
- **Requirements:**
  - `graph.subscribe({ onChange(diff), onError?(err) })` returns `{ unsubscribe() }`.
  - After `materialize()`, if state changed, compute diff and call `onChange` for all subscribers.
  - Error in one handler doesn't block others — caught and forwarded to `onError` if provided.
  - Multiple subscribers supported.
- **Acceptance Criteria:**
  - Subscribe → commit → materialize → onChange called with diff.
  - Unsubscribe → no more calls.
  - Handler error isolated.
- **Scope:** Post-materialize subscription.
- **Out of Scope:** Real-time push (fs.watch integration is PL/WATCH).
- **Estimated Hours:** 4
- **Estimated LOC:** ~80 prod + ~150 test
- **Blocked by:** PL/DIFF/1
- **Blocking:** PL/WATCH/1
- **Definition of Done:** Subscribe, unsubscribe, error isolation all work.
- **Test Plan:**
  - Golden path: subscribe → commit → materialize → handler called.
  - Golden path: unsubscribe → no more calls.
  - Known failures: handler throws → other handlers still called.
  - Edge cases: subscribe during materialize, unsubscribe in handler.

#### PL/SUB/2 — Optional initial replay

- **Status:** `CLOSED`
- **User Story:** As a developer subscribing to an existing graph, I want an initial snapshot so I don't miss current state.
- **Requirements:**
  - `subscribe({ onChange, replay: true })` immediately fires `onChange` with diff from empty state to current.
  - Only fires if `_cachedState` is available.
  - If `_cachedState` is null, replay deferred until first materialize.
- **Acceptance Criteria:**
  - With replay: subscribe after materialize → immediate onChange with full state as additions.
  - Without replay: no immediate call.
- **Scope:** Initial replay option.
- **Out of Scope:** Historical replay from specific point.
- **Estimated Hours:** 2
- **Estimated LOC:** ~30 prod + ~60 test
- **Blocked by:** PL/SUB/1
- **Blocking:** None
- **Definition of Done:** Replay fires correct initial diff.
- **Test Plan:**
  - Golden path: materialize → subscribe with replay → handler called immediately.
  - Edge cases: no cached state → replay deferred.

---

### Feature: PL/WATCH — graph.watch(pattern)

**Rationale:** Not all subscribers care about all changes. Pattern-based filtering reduces noise.

#### PL/WATCH/1 — Implement pattern-based filtering

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to watch only specific nodes for changes.
- **Requirements:**
  - `graph.watch('user:*', { onChange(diff) })` — only fires for changes matching the glob pattern.
  - Pattern applied to node IDs in diff.
  - Returns `{ unsubscribe() }`.
  - Reuses subscription infrastructure from PL/SUB.
- **Acceptance Criteria:**
  - `watch('user:*')` fires for user node changes, not for order node changes.
  - Pattern supports same glob syntax as `query().match()`.
- **Scope:** Client-side filtering of diffs.
- **Out of Scope:** Server-side filtering, edge-pattern matching.
- **Estimated Hours:** 3
- **Estimated LOC:** ~50 prod + ~100 test
- **Blocked by:** PL/SUB/1
- **Blocking:** None
- **Definition of Done:** Watch filters diffs by pattern. Only matching changes trigger handler.
- **Test Plan:**
  - Golden path: watch('user:*') → user change fires, order change doesn't.
  - Edge cases: pattern matches no nodes, pattern is '*' (all), empty diff after filtering.

#### PL/WATCH/2 — Integrate with frontier change detection

- **Status:** `CLOSED`
- **User Story:** As a developer, I want `watch()` to optionally poll for remote changes using frontier detection.
- **Requirements:**
  - Add `{ poll: number }` option to `watch()` — interval in ms.
  - When set, periodically call `hasFrontierChanged()` and auto-materialize if changed.
  - Uses `setInterval` internally; cleaned up on `unsubscribe()`.
  - Minimum poll interval: 1000ms.
- **Acceptance Criteria:**
  - `watch('user:*', { poll: 5000 })` checks every 5s.
  - Remote change detected → auto-materialize → handler fires.
  - Unsubscribe stops polling.
- **Scope:** Polling-based remote change detection.
- **Out of Scope:** fs.watch on refs directory (future optimization).
- **Estimated Hours:** 3
- **Estimated LOC:** ~50 prod + ~100 test
- **Blocked by:** GK/FRONTIER/1, PL/WATCH/1
- **Blocking:** None
- **Definition of Done:** Polling watch detects remote changes and notifies subscribers.
- **Test Plan:**
  - Golden path: watch with poll → external commit → handler fires within poll interval.
  - Edge cases: unsubscribe stops timer, minimum interval enforced.

---

## Milestone 8 — HOLOGRAM (v8.0.0)

**Provenance & Holography**

Implements the theory from Papers III–IV. The mathematical foundations for provenance payloads, slicing, and wormholes are fully developed in the papers but not yet implemented.

### Feature: HG/IO — In/Out Declarations on Patches

**Rationale:** The gate that unlocks the rest of HOLOGRAM. Declared read/write sets on each patch make provenance queries possible without full replay.

#### HG/IO/1 — Extend PatchV2 with reads/writes fields

- **Status:** `CLOSED`
- **User Story:** As the system, I need each patch to declare which nodes it reads and writes for provenance tracking.
- **Requirements:**
  - Add optional `reads: string[]` and `writes: string[]` fields to PatchV2.
  - Auto-populate during `commitPatch()` by inspecting ops:
    - `NodeAdd(X)` → writes X.
    - `NodeRemove(X)` → reads X.
    - `EdgeAdd(A→B)` → reads A, reads B, writes edge key.
    - `EdgeRemove(A→B)` → reads edge key.
    - `PropSet(X, key)` → reads X, writes X.
  - Store as part of patch blob (CBOR-encoded).
  - Backward compatible: missing fields treated as unknown (full replay required).
- **Acceptance Criteria:**
  - Committed patch includes accurate reads/writes arrays.
  - Legacy patches without fields load correctly.
- **Scope:** Patch metadata extension.
- **Out of Scope:** Index building (that's HG/IO/2).
- **Estimated Hours:** 4
- **Estimated LOC:** ~60 prod + ~120 test
- **Blocked by:** LH/RECEIPTS/2 (receipt infrastructure informs I/O classification)
- **Blocking:** HG/IO/2, HG/SLICE/1
- **Definition of Done:** Patches carry accurate I/O declarations. Backward compatible.
- **Test Plan:**
  - Golden path: addNode + setProperty + addEdge → reads/writes correctly populated.
  - Edge cases: empty patch (ops list empty but valid), legacy patch loads.

#### HG/IO/2 — Build nodeId-to-patchSha index

- **Status:** `CLOSED`
- **User Story:** As the system, I need to quickly answer "which patches affected node X?" without replaying all patches.
- **Requirements:**
  - Build index `Map<nodeId, Set<patchSha>>` from I/O declarations.
  - Updated incrementally during materialization.
  - Persisted as part of checkpoint (optional: separate tree blob).
  - Query: `graph.patchesFor(nodeId)` returns `string[]` of contributing patch SHAs.
- **Acceptance Criteria:**
  - Index accurately maps nodes to contributing patches.
  - Incremental update after new patches.
- **Scope:** Index construction and query.
- **Out of Scope:** Causal cone computation (that's HG/SLICE/1).
- **Estimated Hours:** 5
- **Estimated LOC:** ~100 prod + ~150 test
- **Blocked by:** HG/IO/1
- **Blocking:** HG/SLICE/1
- **Definition of Done:** Index built, persisted, queryable. Accurate for all test cases.
- **Test Plan:**
  - Golden path: 3 patches affecting node X → patchesFor('X') returns 3 SHAs.
  - Edge cases: node with no patches (added then removed?), patches from multiple writers.
  - Stress: 1000 patches → index build time reasonable.

---

### Feature: HG/PROV — Provenance Payloads

**Rationale:** Implements the boundary encoding `(U_0, P)` from Paper III as a first-class type with monoid operations.

#### HG/PROV/1 — Implement ProvenancePayload class

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to package a sequence of patches as a transferable provenance payload.
- **Requirements:**
  - `ProvenancePayload` class with:
    - `constructor(patches)` — ordered patch sequence.
    - `concat(other)` — monoid composition (concatenation).
    - `static identity()` — empty payload.
    - `get length` — patch count.
    - `replay(initialState)` — deterministic materialization.
  - Immutable after construction.
  - Monoid laws: `identity.concat(p) === p`, `p.concat(identity) === p`, `(a.concat(b)).concat(c) === a.concat(b.concat(c))`.
- **Acceptance Criteria:**
  - Monoid laws hold.
  - `replay()` produces same state as full materialization of same patches.
- **Scope:** Payload type with monoid operations and replay.
- **Out of Scope:** Serialization format, BTR packaging.
- **Estimated Hours:** 4
- **Estimated LOC:** ~60 prod + ~120 test
- **Blocked by:** None
- **Blocking:** HG/SLICE/1, HG/WORM/1, HG/BTR/1
- **Definition of Done:** Monoid laws verified. Replay matches full materialization.
- **Test Plan:**
  - Golden path: construct → concat → replay → correct state.
  - Fuzz: random payload pairs → associativity holds.
  - Edge cases: identity, single-patch payload, very long payload.

---

### Feature: HG/SLICE — Slice Materialization

**Rationale:** Given a target node, materialize only the patches that contribute to that node's current state. This is the "partial materialization by slicing" theorem from Paper III.

#### HG/SLICE/1 — Compute backward causal cone and partial materialize

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to materialize only the data relevant to a specific node instead of the full graph.
- **Requirements:**
  - `graph.materializeSlice(nodeId)` returns `{ state, receipts? }` containing only the causal cone for that node.
  - Uses I/O index (HG/IO/2) to compute backward cone D(v).
  - Walks index: target node → contributing patches → their read dependencies → recursively.
  - Constructs `ProvenancePayload` from cone patches (topologically sorted).
  - Replays payload against empty state.
- **Acceptance Criteria:**
  - Slice produces correct property values for target node.
  - Slice is smaller than full materialization (measured in patch count).
  - Result matches extracting target node from full materialization.
- **Scope:** Backward cone + partial replay.
- **Out of Scope:** Forward cone, incremental slice updates.
- **Estimated Hours:** 6
- **Estimated LOC:** ~120 prod + ~200 test
- **Blocked by:** HG/IO/2, HG/PROV/1
- **Blocking:** None
- **Definition of Done:** Slice materialization matches full materialization for target node. Fewer patches processed.
- **Test Plan:**
  - Golden path: 100-patch graph, slice for 1 node → processes < 100 patches → correct result.
  - Edge cases: node depends on all patches (degenerate case), node with no dependencies.
  - Fuzz: random graph → slice → compare with full materialize extraction.

---

### Feature: HG/WORM — Wormhole Compression

**Rationale:** Compress multi-tick segments into single edges carrying sub-payloads. Useful for checkpointing long histories while preserving provenance.

#### HG/WORM/1 — Implement wormhole compression

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to compress a range of patches into a single wormhole that preserves provenance.
- **Requirements:**
  - `graph.createWormhole(fromPatchSha, toPatchSha)` → `WormholeEdge`.
  - Wormhole contains sub-payload (ProvenancePayload of compressed segment).
  - Payload monoid: concatenating two consecutive wormhole payloads yields the combined wormhole's payload.
  - Materialization that encounters a wormhole replays its sub-payload.
- **Acceptance Criteria:**
  - Wormhole + remaining patches produces same state as all patches.
  - Two consecutive wormholes compose correctly.
- **Scope:** Wormhole creation and replay.
- **Out of Scope:** Automatic wormhole creation policy, storage optimization.
- **Estimated Hours:** 6
- **Estimated LOC:** ~100 prod + ~180 test
- **Blocked by:** HG/PROV/1
- **Blocking:** None
- **Definition of Done:** Wormhole compression preserves materialization correctness. Composition works.
- **Test Plan:**
  - Golden path: 100 patches → compress first 50 into wormhole → materialize → same result.
  - Golden path: two consecutive wormholes → compose → same result.
  - Edge cases: wormhole over single patch, wormhole over empty range.

---

### Feature: HG/BTR — Boundary Transition Records

**Rationale:** Tamper-evident packaging for auditable exchange of graph segments between parties who don't share full history.

#### HG/BTR/1 — Implement BTR packaging format

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to package a graph segment as a verifiable artifact for exchange.
- **Requirements:**
  - BTR binds `(h_in, h_out, U_0, P, t, kappa)`:
    - `h_in`: hash of input state.
    - `h_out`: hash of output state.
    - `U_0`: initial state snapshot.
    - `P`: provenance payload.
    - `t`: timestamp.
    - `kappa`: authentication tag (HMAC or signature).
  - `createBTR(initialState, payload, key)` → `BTR`.
  - `verifyBTR(btr, key)` → `{ valid: boolean, reason?: string }`.
  - Serializable to CBOR.
- **Acceptance Criteria:**
  - Created BTR verifies correctly.
  - Tampered BTR fails verification.
  - Replay of BTR produces `h_out`.
- **Scope:** BTR creation and verification.
- **Out of Scope:** Key management, certificate chains.
- **Estimated Hours:** 5
- **Estimated LOC:** ~100 prod + ~150 test
- **Blocked by:** HG/PROV/1
- **Blocking:** None
- **Definition of Done:** BTR creation, verification, and tamper detection work.
- **Test Plan:**
  - Golden path: create BTR → verify → valid.
  - Known failures: tamper payload → verify → invalid.
  - Edge cases: empty payload, large payload.

---

### Feature: HG/FORK — Prefix Forks

**Rationale:** Git-style branching at the WARP layer enables what-if analysis, safe experimentation, and undo.

#### HG/FORK/1 — Implement graph.fork()

- **Status:** `CLOSED`
- **User Story:** As a developer, I want to fork a graph at a specific point to experiment without affecting the original.
- **Requirements:**
  - `graph.fork({ from: writerId, at: patchSha })` → new `WarpGraph` instance.
  - Fork shares history up to `patchSha` (Git content addressing = automatic dedup).
  - Fork gets a new writer ID.
  - Original graph unaffected by fork operations.
- **Acceptance Criteria:**
  - Fork materializes same state as original at fork point.
  - Writes to fork don't appear in original.
  - Writes to original after fork don't appear in fork.
- **Scope:** Fork creation with shared prefix.
- **Out of Scope:** Fork merging (merge back), fork comparison.
- **Estimated Hours:** 6
- **Estimated LOC:** ~100 prod + ~200 test
- **Blocked by:** None
- **Blocking:** None
- **Definition of Done:** Fork creates independent graph sharing history. Mutual isolation verified.
- **Test Plan:**
  - Golden path: fork → write to fork → original unchanged.
  - Golden path: fork → write to original → fork unchanged.
  - Edge cases: fork at tip (empty divergence), fork at genesis.
  - Stress: fork, write 100 patches to each → both materialize correctly.

---

## Milestone 9 — ECHO (v9.0.0)

**Observer Geometry (Speculative)**

Paper IV defines observers as resource-bounded functors and introduces rulial distance. This is the most theoretical milestone and the furthest from implementation, but has concrete engineering applications.

### Feature: EC/VIEW — Observer-Scoped Views

**Rationale:** Different users legitimately see different projections of the same graph. Access control and data minimization are natural observer applications.

#### EC/VIEW/1 — Define observer configuration

- **Status:** `OPEN`
- **User Story:** As a developer, I want to define named observers that project the graph into scoped views.
- **Requirements:**
  - `graph.observer(name, config)` where config specifies:
    - `match: string` — glob pattern for visible nodes.
    - `expose: string[]` — property paths to include.
    - `redact: string[]` — property paths to exclude (takes precedence over expose).
  - Observer returns a read-only view object with same query/traverse API as WarpGraph.
  - View is computed from current materialized state.
- **Acceptance Criteria:**
  - Observer view shows only matching nodes with allowed properties.
  - Redacted properties not accessible.
  - View supports `query()`, `traverse.*`, `hasNode()`.
- **Scope:** Observer definition and view projection.
- **Out of Scope:** Observer persistence, observer composition.
- **Estimated Hours:** 6
- **Estimated LOC:** ~120 prod + ~200 test
- **Blocked by:** None
- **Blocking:** EC/COST/1
- **Definition of Done:** Observer views correctly project and redact. Read-only query API works.
- **Test Plan:**
  - Golden path: observer matching 'user:*' → only user nodes visible.
  - Golden path: redact 'props.ssn' → property not in view.
  - Edge cases: expose and redact overlap (redact wins), empty match, observer on empty graph.

---

### Feature: EC/COST — Translation Cost Estimation

**Rationale:** Given two observer definitions, estimate the cost of translating between their views. Useful for system design.

#### EC/COST/1 — Implement MDL cost estimation

- **Status:** `BLOCKED`
- **User Story:** As a system designer, I want to estimate how much information is lost when translating between two observer views.
- **Requirements:**
  - `graph.translationCost(observerA, observerB)` returns `{ cost: number, breakdown: {...} }`.
  - Cost based on MDL (Minimum Description Length) of the translation function.
  - Factors: nodes visible in A but not B, properties exposed in A but redacted in B, structural differences.
  - Normalized to [0, 1] range (0 = identical views, 1 = completely disjoint).
- **Acceptance Criteria:**
  - Identical observers → cost 0.
  - Completely disjoint observers → cost 1.
  - Superset observer → cost > 0 (information loss in one direction).
- **Scope:** Cost estimation based on observer configs.
- **Out of Scope:** Optimal translation synthesis, distortion metrics.
- **Estimated Hours:** 5
- **Estimated LOC:** ~80 prod + ~120 test
- **Blocked by:** EC/VIEW/1
- **Blocking:** None
- **Definition of Done:** Cost estimation produces meaningful values for test cases.
- **Test Plan:**
  - Golden path: identical observers → 0, disjoint → 1, subset → intermediate.
  - Edge cases: one observer sees nothing, both see everything.

---

### Feature: EC/TEMPORAL — Temporal Queries

**Rationale:** CTL*-style temporal logic over materialized history enables "was this always true?" and "does this eventually hold?" queries.

#### EC/TEMPORAL/1 — Implement always/eventually operators

- **Status:** `OPEN`
- **User Story:** As a developer, I want to query temporal properties of graph history.
- **Requirements:**
  - `graph.temporal.always(nodeId, predicate, { since: tick })` — true if predicate held at every tick since `since`.
  - `graph.temporal.eventually(nodeId, predicate, { since: tick })` — true if predicate held at some tick since `since`.
  - Requires full history access (replay from `since` to current).
  - Predicate receives node snapshot at each tick.
- **Acceptance Criteria:**
  - `always('X', n => n.props.status === 'active', { since: 0 })` returns true if always active.
  - `eventually('X', n => n.props.status === 'merged')` returns true if ever merged.
- **Scope:** Two temporal operators (always, eventually) over single-node history.
- **Out of Scope:** Path quantifiers (forAll/exists paths), branching-time semantics.
- **Estimated Hours:** 6
- **Estimated LOC:** ~100 prod + ~180 test
- **Blocked by:** HG/IO/1 (needs patch-level history access)
- **Blocking:** None
- **Definition of Done:** Temporal operators produce correct results against known histories.
- **Test Plan:**
  - Golden path: node status changes active → inactive → always('active') returns false.
  - Golden path: node eventually becomes 'merged' → eventually('merged') returns true.
  - Edge cases: node didn't exist at `since` tick, predicate never true, single-tick history.

---

## Non-Goals

Things this project should not try to become:

- **A general-purpose database.** No SQL, no ACID transactions, no connection pooling.
- **A real-time system.** Git's I/O model is fundamentally batch-oriented. No WebSocket push, no sub-millisecond latency.
- **A distributed consensus system.** CRDTs give eventual consistency without coordination. If you need strong consistency or leader election, use a different tool.
- **A physics engine.** Paper V (emergent dynamics, Schrodinger-type evolution) is fascinating mathematics but not an implementation target.

---

## Totals

| Milestone | Features | Tasks | Est. Hours | Est. LOC |
|-----------|----------|-------|------------|----------|
| AUTOPILOT | 4 | 10 | 22 | ~1,075 |
| GROUNDSKEEPER | 3 | 4 | 13 | ~680 |
| WEIGHTED | 4 | 7 | 22 | ~1,110 |
| HANDSHAKE | 5 | 8 | 25 | ~1,035 |
| COMPASS | 3 | 3 | 13 | ~720 |
| LIGHTHOUSE | 4 | 5 | 17 | ~890 |
| PULSE | 3 | 5 | 16 | ~820 |
| HOLOGRAM | 6 | 7 | 36 | ~1,780 |
| ECHO | 3 | 3 | 17 | ~820 |
| **Total** | **35** | **52** | **181** | **~8,930** |
