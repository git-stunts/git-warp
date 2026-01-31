# WARP V5 Completion Handoff

## Mission

Complete the WARP V5 implementation for EmptyGraph. The core CRDT primitives are done and tested. You need to implement 4 remaining phases: Benchmarks, Checkpoint V5 Format, Network Sync, and GC Policy.

**Estimated work**: ~1,650 LOC across 7-9 new files

---

## What V5 Is

WARP V5 upgrades EmptyGraph from LWW-based deterministic fold to **true lattice confluence** using OR-Set CRDTs.

**Key semantic change**:
- V4 (LWW): Concurrent add + tombstone → highest EventId wins (could be tombstone)
- V5 (OR-Set): Concurrent add + remove → **add survives** (remove only affects observed dots)

This enables masterless collaboration where concurrent operations don't accidentally delete each other's work.

---

## What's Already Done (V5 Core)

All 1,412 tests pass. The following files exist and are tested:

### CRDT Primitives
| File | Purpose |
|------|---------|
| `src/domain/crdt/Dot.js` | Unique operation ID (writerId, counter) |
| `src/domain/crdt/VersionVector.js` | Causality tracking, pointwise-max merge |
| `src/domain/crdt/ORSet.js` | Global OR-Set with add-wins semantics, includes `orsetCompact()` |

### V5 Types and Reducer
| File | Purpose |
|------|---------|
| `src/domain/types/WarpTypesV2.js` | Schema:2 ops with dots/observedDots |
| `src/domain/services/JoinReducer.js` | V5 reducer: `reduceV5()`, `joinStates()`, `applyOpV2()` |
| `src/domain/services/StateSerializerV5.js` | Visible projection serialization, `computeStateHashV5()` |

### Migration and Builder
| File | Purpose |
|------|---------|
| `src/domain/services/MigrationService.js` | `migrateV4toV5()` for upgrade boundary |
| `src/domain/services/PatchBuilderV2.js` | Fluent builder for schema:2 patches |

### Modified Files
| File | Changes |
|------|---------|
| `src/domain/MultiWriterGraph.js` | Schema option, `join()` method with receipts |
| `src/domain/services/CheckpointService.js` | Basic schema-aware serialization (needs Phase 2 enhancement) |

---

## What Remains (4 Phases)

Detailed plan: `docs/WARP-finish-v5.md`

### Phase 1: Benchmarks (~300 LOC)
**Files to create**:
- `test/benchmark/ReducerV5.benchmark.js`
- `test/benchmark/Compaction.benchmark.js`

**Key requirements**:
- Soft targets (warn) + hard limits (fail CI)
- Warmup runs, median of N measurements
- Log Node version, CPU, heap delta (allocation watchdog)
- 10K patches < 5s soft target, < 10s hard limit

### Phase 2: Checkpoint V5 Format (~400 LOC)
**Files to create**:
- `src/domain/services/CheckpointSerializerV5.js`

**Files to modify**:
- `src/domain/services/CheckpointService.js`
- `src/domain/services/WarpMessageCodec.js`
- `src/domain/MultiWriterGraph.js`

**Key requirements**:
- `state.cbor` is AUTHORITATIVE (full ORSet internals)
- `visible.cbor` is CACHE ONLY
- `appliedVV` computed from actual dots in state (not `patch.context`)
- Backfill rejection using **graph reachability** (not lamport!)
- Divergence detection for forked writer chains

### Phase 3: Network Sync (~600 LOC)
**Files to create**:
- `src/domain/services/SyncProtocol.js`
- `src/domain/services/DeltaEncoder.js` (Phase 3.5, after patch sync works)

**Files to modify**:
- `src/domain/MultiWriterGraph.js`

**Key requirements**:
- Frontier-based per-writer chain sync
- Patch enumeration by walking commit graph between SHAs
- Divergence detection when SHA walk doesn't hit expected ancestor
- Delta encoding deferred to Phase 3.5 with property test

### Phase 4: GC Policy (~350 LOC)
**Files to create**:
- `src/domain/services/GCPolicy.js`
- `src/domain/services/GCMetrics.js`

**Files to modify**:
- `src/domain/MultiWriterGraph.js`

**Key requirements**:
- `shouldRunGC(metrics, policy)` with configurable thresholds
- `executeGC(state, appliedVV)` only compacts tombstoned dots ≤ appliedVV
- tombstoneRatio = tombstones / (tombstones + liveDots)

---

## Critical Invariants (MUST ENFORCE)

### 1. State Resume Rule
> Materialize/resume ALWAYS loads `state.cbor`. `visible.cbor` is cache only, NEVER authoritative.

### 2. appliedVV Definition
> `appliedVV` = max dot counters from scanning actual dots in `state.nodeAlive` and `state.edgeAlive`. NOT merged `patch.context`. Naturally includes migration synthetic dots.

### 3. Backfill Rejection (Graph Reachability)
> After schema:2 checkpoint, reject patches that don't extend the per-writer chain beyond checkpoint frontier head. Use `isAncestor()` graph walk, NOT lamport comparison.

### 4. Per-Writer Chain Linearity
> Per-writer patch chain is linear (single parent). Divergence = configuration error, not supported mode. Detect and reject.

### 5. Compaction Safety
> Compact only dots that are BOTH tombstoned AND ≤ `appliedVV`. NEVER compact live dots. NEVER use `patch.context` for GC.

---

## Key Code Patterns

### Computing appliedVV (scan actual dots)
```javascript
export function computeAppliedVV(state) {
  const vv = createVersionVector();
  for (const [element, dots] of state.nodeAlive.entries) {
    for (const encodedDot of dots) {
      const dot = decodeDot(encodedDot);
      const current = vv.get(dot.writerId) || 0;
      vv.set(dot.writerId, Math.max(current, dot.counter));
    }
  }
  // Same for edgeAlive...
  return vv;
}
```

### Backfill Check (graph reachability)
```javascript
async _isAncestor(ancestorSha, descendantSha) {
  let cur = descendantSha;
  while (cur) {
    if (cur === ancestorSha) return true;
    const commit = await this._persistence.readCommit(cur);
    cur = commit.parents?.[0] ?? null;
  }
  return false;
}

async _validatePatchAgainstCheckpoint(writerId, incomingSha, checkpoint) {
  const ckHead = checkpoint.frontier.get(writerId);
  if (!ckHead) return;

  if (incomingSha === ckHead) throw new Error('Backfill: same as checkpoint');
  if (await this._isAncestor(incomingSha, ckHead)) throw new Error('Backfill: behind checkpoint');
  if (!(await this._isAncestor(ckHead, incomingSha))) throw new Error('Divergence detected');
  // OK: incoming is ahead of checkpoint
}
```

### Sync Patch Enumeration (SHA walk)
```javascript
async function loadPatchRange(persistence, writerId, fromSha, toSha) {
  const patches = [];
  let cur = toSha;
  while (cur && cur !== fromSha) {
    const commit = await persistence.readCommit(cur);
    // ... load patch ...
    patches.unshift({ patch, sha: cur });
    cur = commit.parents?.[0] ?? null;
  }
  if (fromSha && cur === null) {
    throw new Error(`Divergence: ${toSha} doesn't descend from ${fromSha}`);
  }
  return patches;
}
```

---

## Running Tests

```bash
cd /Users/james/git/git-stunts/empty-graph

# Run all tests
npm test

# Run specific test file
npm test -- test/unit/domain/crdt/ORSet.test.js

# Run benchmarks (when created)
npm test -- test/benchmark/

# Current test count: 1,412 passing
```

---

## File Locations

```
/Users/james/git/git-stunts/empty-graph/
├── src/domain/
│   ├── crdt/
│   │   ├── Dot.js              # ✅ Done
│   │   ├── VersionVector.js    # ✅ Done
│   │   ├── ORSet.js            # ✅ Done
│   │   └── LWW.js              # ✅ Unchanged (props use this)
│   ├── types/
│   │   ├── WarpTypes.js        # V4 types
│   │   └── WarpTypesV2.js      # ✅ Done - V5 types
│   ├── services/
│   │   ├── Reducer.js          # V4 reducer (keep for compatibility)
│   │   ├── JoinReducer.js      # ✅ Done - V5 reducer
│   │   ├── StateSerializer.js  # V4 serializer
│   │   ├── StateSerializerV5.js # ✅ Done - V5 visible projection
│   │   ├── CheckpointService.js # Needs Phase 2 enhancement
│   │   ├── CheckpointSerializerV5.js # 📝 Create in Phase 2
│   │   ├── MigrationService.js # ✅ Done
│   │   ├── PatchBuilder.js     # V4 builder
│   │   ├── PatchBuilderV2.js   # ✅ Done - V5 builder
│   │   ├── SyncProtocol.js     # 📝 Create in Phase 3
│   │   ├── DeltaEncoder.js     # 📝 Create in Phase 3.5
│   │   ├── GCPolicy.js         # 📝 Create in Phase 4
│   │   └── GCMetrics.js        # 📝 Create in Phase 4
│   └── MultiWriterGraph.js     # ✅ Modified, needs more in Phase 2-4
├── test/
│   ├── unit/domain/
│   │   ├── crdt/               # ✅ All CRDT tests
│   │   ├── properties/         # ✅ Property tests (fast-check)
│   │   └── services/
│   │       └── JoinReducer.integration.test.js  # ✅ Killer tests
│   └── benchmark/
│       ├── Reducer.benchmark.js # V4 benchmark (reference)
│       ├── ReducerV5.benchmark.js # 📝 Create in Phase 1
│       └── Compaction.benchmark.js # 📝 Create in Phase 1
└── docs/
    ├── WARP-finish-v5.md       # Detailed implementation plan
    └── WARP-V5-HANDOFF.md      # This file
```

---

## Implementation Order

```
Phase 1 + Phase 2 in parallel (no dependencies)
         │
         ▼
Phase 3 (depends on Phase 2 checkpoint format)
         │
         ▼
Phase 4 (depends on Phase 2 appliedVV)
```

**Recommended sequence**:
1. Phase 2 first (correctness foundation)
2. Phase 1 in parallel (performance validation)
3. Phase 3 after Phase 2 complete
4. Phase 4 last (easy once GC primitives exist)

---

## Gotchas

1. **Don't use lamport for backfill check** - Use graph reachability. Lamport can lie.

2. **appliedVV is from state, not patches** - If you compute from "patches since checkpoint", you miss migration baseline dots.

3. **visible.cbor is never authoritative** - Someone will try to "optimize" by loading visible.cbor. Don't let them.

4. **Per-writer chains must be linear** - If divergence happens, it's a config error. Detect and reject, don't try to merge forks.

5. **Compact only tombstoned dots** - Never compact live dots even if they're ≤ appliedVV.

6. **Delta encoding comes AFTER patch sync** - Don't try to optimize before correctness is proven.

---

## Success Criteria

1. All existing 1,412 tests still pass
2. Benchmarks show 10K patches < 10s (hard limit)
3. Checkpoint V5 round-trips correctly with compaction
4. Backfill rejection works via graph reachability
5. Sync produces identical state on both replicas
6. Divergence is detected and rejected
7. GC reduces memory without corrupting state

---

## Starting Point

Read `docs/WARP-finish-v5.md` for the full implementation plan with code snippets.

Start with Phase 2 (CheckpointSerializerV5.js) - it's the foundation everything else builds on.

Good luck. The lattice is the law.
