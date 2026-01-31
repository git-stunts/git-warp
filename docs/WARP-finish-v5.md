# WARP V5 Completion Plan

## Executive Summary

Four components remain to complete the WARP V5 implementation:

| Phase | Component | Purpose | LOC | Complexity |
|-------|-----------|---------|-----|------------|
| 1 | Benchmarks | Performance regression suite | ~300 | Low |
| 2 | Checkpoint V5 Format | `appliedVV` tracking + compaction | ~400 | Medium |
| 3 | Network Sync Protocol | Writer discovery + patch exchange | ~600 | High |
| 4 | GC Policy | Automatic compaction thresholds | ~350 | Medium |

**Total**: ~1,650 LOC across 7-9 new files

### Phase Dependencies

```
Phase 1: Benchmarks ──────────────────┐
         (no dependencies)            │ (parallel)
                                      │
Phase 2: Checkpoint V5 Format ────────┤
         (no dependencies)            │
                                      │
         ┌────────────────────────────┤
         │                            │
         ▼                            ▼
Phase 3: Network Sync          Phase 4: GC Policy
(depends on Phase 2)           (depends on Phase 2)
```

**Phases 1 and 2 can start immediately in parallel.** Benchmarks validate performance; Checkpoints establish correctness. Neither blocks the other.

---

## Critical Invariants (MUST BE ENFORCED)

### Invariant 1: State Resume Rule

> **RULE**: Materialize/resume ALWAYS loads `state.cbor` (full ORSet internals). `visible.cbor` is an optional cache only, NEVER authoritative.

Rationale: If `visible.cbor` is used to resume, OR-Set internals (dots) are lost, which breaks:
- Future remove semantics (can't populate `observedDots`)
- Delta encoding (can't compute what remote is missing)
- Compaction safety (can't identify which dots are tombstoned)

### Invariant 2: appliedVV Definition

> **RULE**: `appliedVV` is the max dot counters actually present in the checkpoint's state, computed by scanning all dots in `state.nodeAlive` and `state.edgeAlive` entries.

This is NOT the merged `patch.context` (which is what writers claim to have seen). It is the actual dots that exist in the state.

**Important**: Because `appliedVV` is derived from state, it **naturally includes migration synthetic dots**. If you migrate from v4, those synthetic dots are in the ORSets and will be counted. Do NOT compute `appliedVV` from "patches since last checkpoint"—that would miss the migration baseline.

### Invariant 3: Backfill Rejection (Graph Reachability)

> **RULE**: After a schema:2 checkpoint, reject patches that do not extend the per-writer chain beyond checkpoint frontier head.

**This is a graph property, not a timestamp property.** Lamport is not reliable for causality checks because:
- Frontier is `Map<writerId, headSha>`, not lamport
- Lamport can be spoofed or have edge cases with equal values

The correct check is **reachability**: if an incoming patch is an ancestor of (or equal to) the checkpoint head for that writer, it's backfill and must be rejected.

### Invariant 4: Per-Writer Chain Linearity

> **RULE**: Per-writer patch chain is linear (single parent). Divergence is impossible under normal operation.

If two devices write as the same writerId without coordination, they create a fork. This is a configuration error, not a supported mode. If divergence is detected, reject the patch and require manual repair.

### Invariant 5: Compaction Safety

> **RULE**: Compact only dots that are BOTH:
> 1. Tombstoned (in `set.tombstones`)
> 2. ≤ `appliedVV` (covered by checkpoint)

NEVER compact live dots. NEVER compact based on `patch.context`.

---

## Phase 1: V5 Benchmark Suite

**Goal**: Performance regression tracking (reporting + trend-based, not strict pass/fail).

### Files to Create

| File | Purpose |
|------|---------|
| `test/benchmark/ReducerV5.benchmark.js` | V5 reducer scaling tests |
| `test/benchmark/Compaction.benchmark.js` | orsetCompact() performance |

### Benchmark Design (Avoids Flapping + Allocation Watchdog)

```javascript
// ReducerV5.benchmark.js
import { performance } from 'perf_hooks';
import os from 'os';

const BENCHMARK_CONFIG = {
  warmupRuns: 2,
  measuredRuns: 5,
  // Soft targets - log warnings, don't fail CI
  targets: {
    1000: 1000,    // 1K patches: 1s target
    5000: 3000,    // 5K patches: 3s target
    10000: 5000,   // 10K patches: 5s target (spec requirement)
    25000: 15000,  // 25K patches: 15s target
  },
  // Hard limits - only these fail CI (2x target for CI tolerance)
  hardLimits: {
    10000: 10000,  // 10K patches: 10s hard limit
  },
};

function runBenchmark(patchCount) {
  const patches = generateV5Patches(patchCount);

  // Warmup
  for (let i = 0; i < BENCHMARK_CONFIG.warmupRuns; i++) {
    reduceV5(patches);
  }

  // Force GC before measurement (if available)
  if (global.gc) global.gc();
  const heapBefore = process.memoryUsage().heapUsed;

  // Measured runs
  const times = [];
  let state;
  for (let i = 0; i < BENCHMARK_CONFIG.measuredRuns; i++) {
    const start = performance.now();
    state = reduceV5(patches);
    times.push(performance.now() - start);
  }

  // Memory measurement
  const heapAfter = process.memoryUsage().heapUsed;
  const heapDelta = heapAfter - heapBefore;

  // Return median
  times.sort((a, b) => a - b);
  return {
    median: times[Math.floor(times.length / 2)],
    min: times[0],
    max: times[times.length - 1],
    heapDeltaMB: (heapDelta / 1024 / 1024).toFixed(2),
    nodeVersion: process.version,
    platform: `${os.platform()}-${os.arch()}`,
    cpus: os.cpus()[0]?.model,
  };
}

describe('reduceV5 benchmarks', () => {
  it.each([1000, 5000, 10000, 25000])('benchmark %i patches', (count) => {
    const result = runBenchmark(count);

    // Log results (for trend tracking)
    console.log(`[BENCHMARK] ${count} patches: ${result.median.toFixed(0)}ms median`);
    console.log(`  Range: ${result.min.toFixed(0)}-${result.max.toFixed(0)}ms`);
    console.log(`  Heap delta: ${result.heapDeltaMB}MB`);
    console.log(`  Node: ${result.nodeVersion}, CPU: ${result.cpus}`);

    // Soft target warning
    const target = BENCHMARK_CONFIG.targets[count];
    if (target && result.median > target) {
      console.warn(`  WARNING: Exceeds target of ${target}ms`);
    }

    // Hard limit enforcement (CI failure)
    const hardLimit = BENCHMARK_CONFIG.hardLimits[count];
    if (hardLimit) {
      expect(result.median).toBeLessThan(hardLimit);
    }
  });
});
```

### Dependencies
- None - can start immediately (parallel with Phase 2)

---

## Phase 2: Checkpoint V5 Format with appliedVV

**Goal**: Track `appliedVV` in checkpoints and integrate `orsetCompact()` during checkpoint creation.

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/domain/services/CheckpointSerializerV5.js` | Create | Full state serialization |
| `src/domain/services/CheckpointService.js` | Modify | V5 checkpoint creation with compaction |
| `src/domain/services/WarpMessageCodec.js` | Modify | Add `eg-checkpoint: v5` marker |

### Checkpoint V5 Tree Structure

```
<checkpoint_commit_tree>/
├── state.cbor           # AUTHORITATIVE: Full V5 state (ORSets + props)
├── visible.cbor         # CACHE ONLY: Visible projection for fast queries
├── frontier.cbor        # Writer frontiers (Map<writerId, patchSha>)
└── appliedVV.cbor       # Version vector of dots in state (for compaction)
```

**Commit message trailers:**
```
eg-kind: checkpoint
eg-schema: 2
eg-checkpoint: v5
eg-state-hash: <sha256 of visible projection>
```

### Key Functions

```javascript
// CheckpointSerializerV5.js

/**
 * Serializes full V5 state including ORSet internals.
 * This is the AUTHORITATIVE checkpoint format.
 */
export function serializeFullStateV5(state)

/**
 * Deserializes full V5 state. Used for resume.
 */
export function deserializeFullStateV5(buffer)

/**
 * Computes appliedVV by scanning all dots in state.
 * This is NOT merged patch.context - it's actual dots present.
 *
 * NOTE: This naturally includes migration synthetic dots because
 * they are stored in the ORSets after migrateV4toV5().
 */
export function computeAppliedVV(state) {
  const vv = createVersionVector();

  // Scan nodeAlive dots
  for (const [element, dots] of state.nodeAlive.entries) {
    for (const encodedDot of dots) {
      const dot = decodeDot(encodedDot);
      const current = vv.get(dot.writerId) || 0;
      vv.set(dot.writerId, Math.max(current, dot.counter));
    }
  }

  // Scan edgeAlive dots
  for (const [element, dots] of state.edgeAlive.entries) {
    for (const encodedDot of dots) {
      const dot = decodeDot(encodedDot);
      const current = vv.get(dot.writerId) || 0;
      vv.set(dot.writerId, Math.max(current, dot.counter));
    }
  }

  return vv;
}
```

```javascript
// CheckpointService.js (enhanced for V5)

export async function createV5({
  persistence, graphName, state, frontier,
  parents = [], compact = true
}) {
  // 1. Compute appliedVV from actual state dots
  const appliedVV = computeAppliedVV(state);

  // 2. Optionally compact (only tombstoned dots ≤ appliedVV)
  let checkpointState = state;
  if (compact) {
    checkpointState = cloneStateV5(state);
    orsetCompact(checkpointState.nodeAlive, appliedVV);
    orsetCompact(checkpointState.edgeAlive, appliedVV);
  }

  // 3. Serialize full state (AUTHORITATIVE)
  const stateBuffer = serializeFullStateV5(checkpointState);

  // 4. Serialize visible projection (CACHE)
  const visibleBuffer = serializeStateV5(checkpointState);
  const stateHash = computeStateHashV5(checkpointState);

  // 5. Serialize frontier and appliedVV
  const frontierBuffer = serializeFrontier(frontier);
  const appliedVVBuffer = vvSerialize(appliedVV);

  // 6. Write tree and commit
  // ...
}
```

### Backfill Rejection (Graph Reachability)

```javascript
// MultiWriterGraph.js

/**
 * Checks if ancestorSha is an ancestor of descendantSha.
 * Walks the commit graph (linear per-writer chain assumption).
 */
async _isAncestor(ancestorSha, descendantSha) {
  if (!ancestorSha || !descendantSha) return false;
  let cur = descendantSha;

  while (cur) {
    if (cur === ancestorSha) return true;
    const commit = await this._persistence.readCommit(cur);
    cur = commit.parents?.[0] ?? null;  // Linear chain assumption
  }

  return false;
}

/**
 * Determines relationship between incoming patch and checkpoint head.
 * @returns {'same' | 'ahead' | 'behind' | 'diverged'}
 */
async _relationToCheckpointHead(ckHead, incomingSha) {
  if (incomingSha === ckHead) return 'same';
  if (await this._isAncestor(ckHead, incomingSha)) return 'ahead';     // Incoming extends checkpoint
  if (await this._isAncestor(incomingSha, ckHead)) return 'behind';    // Incoming is backfill
  return 'diverged';  // Neither is ancestor of the other (fork!)
}

/**
 * Validates an incoming patch against checkpoint frontier.
 * Uses graph reachability, NOT lamport timestamps.
 */
async _validatePatchAgainstCheckpoint(writerId, incomingSha, checkpoint) {
  if (!checkpoint || checkpoint.schema !== 2) return;  // No V5 checkpoint yet

  const ckHead = checkpoint.frontier.get(writerId);
  if (!ckHead) return;  // Checkpoint didn't include this writer

  const relation = await this._relationToCheckpointHead(ckHead, incomingSha);

  if (relation === 'same' || relation === 'behind') {
    throw new Error(
      `Backfill rejected for writer ${writerId}: ` +
      `incoming patch is ${relation} checkpoint frontier`
    );
  }

  if (relation === 'diverged') {
    throw new Error(
      `Writer fork detected for ${writerId}: ` +
      `incoming patch does not extend checkpoint head. ` +
      `This is invalid unless you implement fork repair.`
    );
  }

  // relation === 'ahead' => OK
}
```

### Dependencies
- None - can start immediately (parallel with Phase 1)

---

## Phase 3: Network Sync Protocol

**Goal**: Enable efficient synchronization between replicas using frontier-based per-writer chain sync.

### Protocol Choice: Frontier-Based Per-Writer Chains

We choose this because:
1. We already have per-writer patch refs from v4 multi-writer
2. Patches are enumerable by walking commit graph between SHAs
3. No VV needed for patch inventory (VV is for delta encoding and compaction, not patch diff)

### Key Assumption: Linear Per-Writer Chains

> **ASSUMPTION**: Per-writer patch chain is linear (each patch commit has exactly one parent for that writer chain). Divergence is impossible under normal operation.

If divergence occurs (two devices writing as same writerId), the sync will detect it and reject. This is a configuration error requiring manual intervention, not a supported mode.

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/domain/services/SyncProtocol.js` | Create | Core sync protocol |
| `src/domain/services/DeltaEncoder.js` | Create | Delta-state encoding (Phase 3.5) |
| `src/domain/MultiWriterGraph.js` | Modify | Add sync API methods |

### Sync Protocol Flow

```
LOCAL                                    REMOTE
  │                                         │
  │──── SyncRequest ───────────────────────>│
  │  { frontier: Map<writerId, headSha> }   │
  │                                         │
  │<─── SyncResponse ──────────────────────│
  │  { frontier: Map<writerId, headSha>,    │
  │    patches: Map<writerId, PatchV2[]> }  │
  │                                         │
  │  (apply via reduceV5)                   │
  │                                         │
```

### Patch Enumeration Rule

> **RULE**: For each writer, patches are enumerated by walking the commit graph from `toSha` back to `fromSha` (exclusive).

If the walk reaches `null` without hitting `fromSha`, this indicates divergence (the two SHAs are not on the same linear chain).

```javascript
// SyncProtocol.js

/**
 * Loads patches for a writer between two SHAs.
 * Walks commit graph from `toSha` back to `fromSha` (exclusive).
 *
 * @throws {Error} If fromSha is not an ancestor of toSha (divergence)
 */
export async function loadPatchRange(persistence, graphName, writerId, fromSha, toSha) {
  const patches = [];
  let currentSha = toSha;

  while (currentSha && currentSha !== fromSha) {
    const commit = await persistence.readCommit(currentSha);
    const message = commit.message;
    const decoded = decodePatchMessage(message);

    if (decoded.schema !== 2) {
      throw new Error(`Unexpected schema ${decoded.schema} in sync`);
    }

    const patchBuffer = await persistence.readBlob(decoded.patchOid);
    const patch = deserializePatchV2(patchBuffer);

    patches.unshift({ patch, sha: currentSha });  // Prepend (oldest first)
    currentSha = commit.parents[0] || null;
  }

  // Divergence detection: if fromSha was specified but we didn't hit it
  if (fromSha && currentSha === null) {
    throw new Error(
      `Divergence detected for writer ${writerId}: ` +
      `${toSha} does not descend from ${fromSha}. ` +
      `This indicates a forked writer chain.`
    );
  }

  return patches;
}

/**
 * Computes what patches each side needs.
 */
export function computeSyncDelta(localFrontier, remoteFrontier) {
  const needFromRemote = new Map();
  const needFromLocal = new Map();
  const newWritersForLocal = [];
  const newWritersForRemote = [];

  // Writers remote has that local doesn't
  for (const [writerId, remoteHead] of remoteFrontier) {
    const localHead = localFrontier.get(writerId);
    if (!localHead) {
      newWritersForLocal.push(writerId);
      needFromRemote.set(writerId, { from: null, to: remoteHead });
    } else if (localHead !== remoteHead) {
      needFromRemote.set(writerId, { from: localHead, to: remoteHead });
    }
  }

  // Writers local has that remote doesn't
  for (const [writerId, localHead] of localFrontier) {
    const remoteHead = remoteFrontier.get(writerId);
    if (!remoteHead) {
      newWritersForRemote.push(writerId);
      needFromLocal.set(writerId, { from: null, to: localHead });
    } else if (localHead !== remoteHead) {
      needFromLocal.set(writerId, { from: remoteHead, to: localHead });
    }
  }

  return { needFromRemote, needFromLocal, newWritersForLocal, newWritersForRemote };
}
```

### Phase 3.5: Delta Encoding (Optimization, After Patch Sync Proven)

Delta encoding is deferred until patch-based sync is proven correct. When implemented:

```javascript
// DeltaEncoder.js (Phase 3.5)

/**
 * Encodes state delta for transfer.
 * Only includes entries with dots > remoteAppliedVV.
 */
export function encodeDelta(state, remoteAppliedVV)

/**
 * Decodes and applies delta via joinStates.
 */
export function decodeDelta(delta, localState)
```

**Required property test:**
```javascript
it('delta encoding is equivalent to full state join', () => {
  fc.assert(fc.property(stateArb, stateArb, (local, remote) => {
    // remoteAppliedVV is what the receiver (local) already has
    const localAppliedVV = computeAppliedVV(local);

    // Method 1: Delta encoding (send only what local is missing)
    const delta = encodeDelta(remote, localAppliedVV);
    const result1 = decodeDelta(delta, local);

    // Method 2: Full state join
    const result2 = joinStates(local, remote);

    // Must produce identical state
    return computeStateHashV5(result1) === computeStateHashV5(result2);
  }));
});
```

### Dependencies
- Phase 2 (checkpoint V5 for frontier tracking)

---

## Phase 4: Garbage Collection Policy

**Goal**: Define when compaction runs and implement automatic GC.

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/domain/services/GCPolicy.js` | Create | Policy config and execution |
| `src/domain/services/GCMetrics.js` | Create | Metrics collection |
| `src/domain/MultiWriterGraph.js` | Modify | Add GC API methods |

### Default Policy

```javascript
export const DEFAULT_GC_POLICY = {
  tombstoneRatioThreshold: 0.3,      // 30% tombstones triggers GC
  entryCountThreshold: 50000,         // 50K entries triggers GC
  minPatchesSinceCompaction: 1000,    // Min patches between GCs
  maxTimeSinceCompaction: 86400000,   // 24 hours max between GCs
  compactOnCheckpoint: true,          // Auto-compact on checkpoint
  backgroundCompaction: false,        // Foreground by default
};
```

### Key Functions

```javascript
// GCPolicy.js

export function shouldRunGC(metrics, policy) {
  const reasons = [];

  if (metrics.tombstoneRatio > policy.tombstoneRatioThreshold) {
    reasons.push(`tombstone ratio ${(metrics.tombstoneRatio * 100).toFixed(1)}% > ${policy.tombstoneRatioThreshold * 100}%`);
  }

  if (metrics.totalEntries > policy.entryCountThreshold) {
    reasons.push(`entry count ${metrics.totalEntries} > ${policy.entryCountThreshold}`);
  }

  if (metrics.patchesSinceCompaction > policy.minPatchesSinceCompaction) {
    reasons.push(`patches since compaction ${metrics.patchesSinceCompaction} > ${policy.minPatchesSinceCompaction}`);
  }

  const timeSince = Date.now() - metrics.lastCompactionTime;
  if (timeSince > policy.maxTimeSinceCompaction) {
    reasons.push(`time since compaction ${timeSince}ms > ${policy.maxTimeSinceCompaction}ms`);
  }

  return {
    shouldRun: reasons.length > 0,
    reasons,
  };
}

/**
 * Executes GC. Only compacts tombstoned dots ≤ appliedVV.
 */
export function executeGC(state, appliedVV) {
  const before = {
    nodeEntries: countEntries(state.nodeAlive),
    edgeEntries: countEntries(state.edgeAlive),
    tombstones: state.nodeAlive.tombstones.size + state.edgeAlive.tombstones.size,
  };

  const start = performance.now();
  orsetCompact(state.nodeAlive, appliedVV);
  orsetCompact(state.edgeAlive, appliedVV);
  const elapsed = performance.now() - start;

  const after = {
    nodeEntries: countEntries(state.nodeAlive),
    edgeEntries: countEntries(state.edgeAlive),
    tombstones: state.nodeAlive.tombstones.size + state.edgeAlive.tombstones.size,
  };

  return {
    nodesCompacted: before.nodeEntries - after.nodeEntries,
    edgesCompacted: before.edgeEntries - after.edgeEntries,
    tombstonesRemoved: before.tombstones - after.tombstones,
    durationMs: elapsed,
  };
}
```

```javascript
// GCMetrics.js

export function collectGCMetrics(state) {
  const nodeEntries = countEntries(state.nodeAlive);
  const edgeEntries = countEntries(state.edgeAlive);
  const nodeTombstones = state.nodeAlive.tombstones.size;
  const edgeTombstones = state.edgeAlive.tombstones.size;

  // Count live dots (non-tombstoned)
  const nodeLiveDots = countLiveDots(state.nodeAlive);
  const edgeLiveDots = countLiveDots(state.edgeAlive);
  const totalLiveDots = nodeLiveDots + edgeLiveDots;
  const totalTombstones = nodeTombstones + edgeTombstones;

  return {
    nodeEntries,
    edgeEntries,
    nodeTombstones,
    edgeTombstones,
    totalEntries: nodeEntries + edgeEntries,
    // Stable ratio: tombstones / (tombstones + liveDots)
    tombstoneRatio: (totalTombstones + totalLiveDots) > 0
      ? totalTombstones / (totalTombstones + totalLiveDots)
      : 0,
    patchesSinceCompaction: 0,  // Tracked externally
    lastCompactionTime: 0,       // Tracked externally
  };
}
```

### Dependencies
- Phase 2 (checkpoint V5 with `appliedVV`)

---

## Test Requirements Summary

### Phase 1 (Benchmarks)
- [ ] 10K patch reduce tracking (soft target: 5s, hard limit: 10s)
- [ ] orsetCompact() tracking (soft target: 100ms for 10K entries)
- [ ] Benchmark output includes Node version, CPU, median/min/max
- [ ] **Allocation watchdog**: log heap delta per benchmark (no CI failure, just tracking)

### Phase 2 (Checkpoint V5)
- [ ] Resume from `state.cbor` produces correct state
- [ ] `visible.cbor` matches `state.cbor` visible projection
- [ ] `appliedVV` computed from actual dots (includes migration synthetic dots)
- [ ] Compaction preserves state hash
- [ ] Backfill rejection uses graph reachability (not lamport)
- [ ] Divergence detection throws on forked writer chains

### Phase 3 (Network Sync)
- [ ] Bidirectional sync produces identical state on both sides
- [ ] Sync is idempotent (re-sync produces same result)
- [ ] Patch enumeration by SHA walking is correct
- [ ] Divergence detected when walk doesn't hit expected ancestor
- [ ] New writer discovery works
- [ ] (Phase 3.5) Delta-state = full state join (property test)

### Phase 4 (GC Policy)
- [ ] Policy triggers correctly on thresholds
- [ ] Memory decreases after compaction
- [ ] Compaction only removes tombstoned dots ≤ appliedVV
- [ ] tombstoneRatio uses tombstones / (tombstones + liveDots)

---

## Risk Areas

| Risk | Mitigation |
|------|------------|
| Checkpoint resume from wrong file | Explicit rule: always `state.cbor` |
| appliedVV misses migration dots | Scan actual dots from state (naturally includes migration) |
| Backfill based on lamport (wrong) | Use graph reachability instead |
| Writer fork goes undetected | Explicit divergence detection in backfill check and sync |
| Sync missing patches | Divergence detection when SHA walk fails |
| Delta encoding bugs | Property test equivalence; defer to Phase 3.5 |
| Benchmark flapping | Soft targets + hard limits; median of N runs |
| OR-Sets get "fast and fat" | Allocation watchdog tracks heap delta |

---

## Checklist for Reviewer Approval

### Checkpoints
- [x] State resume rule: always load `state.cbor`
- [x] `appliedVV` definition: computed from dots actually present (includes migration)
- [x] Backfill rule: graph reachability, not lamport

### Sync
- [x] Per-writer chain linearity stated as invariant
- [x] Divergence detection in both backfill check and sync SHA walk
- [x] Frontier-based per-writer chain sync as baseline protocol
- [x] Patch enumeration: walk commit graph between SHAs
- [x] Delta encoding: optional Phase 3.5 after patch sync proven

### Benchmarks
- [x] Reporting/trend suite with soft targets
- [x] Hard limits only for CI (2x target)
- [x] Includes warmup, median of N runs, Node/CPU info
- [x] Allocation watchdog: heap delta tracking

### Phase Order
- [x] Phase 1 and Phase 2 can start immediately (parallel)
