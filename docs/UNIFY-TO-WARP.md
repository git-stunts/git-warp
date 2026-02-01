# Unify to WARP: Consolidation Plan

> One engine. Two façades. One default.

## Problem Statement

The repository has accumulated three "graph engines":

1. **EmptyGraph** (`index.js`) - Original single-writer, pre-WARP
2. **MultiWriterGraph schema:1** - WARP v4 (LWW fold)
3. **MultiWriterGraph schema:2** - WARP v5 (OR-Set CRDT)

This is entropy, not architecture. Maintaining parallel implementations means:
- Feature drift between engines
- Bugs fixed in one place but not another
- Users confused about which API to use
- Test surface multiplied unnecessarily

## Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Public API Layer                        │
├─────────────────────────┬───────────────────────────────────┤
│   EmptyGraph (façade)   │   MultiWriterGraph (real API)     │
│   - Legacy compat       │   - Full WARP v5 API              │
│   - Deprecation warning │   - schema:2 default              │
│   - Wraps single writer │   - Multi-writer native           │
└───────────┬─────────────┴───────────────┬───────────────────┘
            │                             │
            └──────────┬──────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                 WARP Core (single implementation)            │
│  - JoinReducer (schema:2 OR-Set, schema:1 LWW)              │
│  - CheckpointService                                         │
│  - SyncProtocol                                              │
│  - GCPolicy                                                  │
└─────────────────────────────────────────────────────────────┘
```

## Deprecation Policy

### EmptyGraph

**Status:** Deprecated engine; supported wrapper.

| Aspect | Policy |
|--------|--------|
| Engine code | Freeze. No new features. |
| Public API | Stable. Keep method signatures. |
| Implementation | Rewrite as wrapper over MultiWriterGraph |
| Timeline | Phase B (after V5 stabilization) |

**Runtime warning** (once per process):
```
[DEPRECATION] EmptyGraph is deprecated. Use MultiWriterGraph instead.
EmptyGraph will become a compatibility wrapper in v6.0.0.
```

### WARP v4 (schema:1)

**Status:** Legacy read/extend only.

| Aspect | Policy |
|--------|--------|
| New graphs | NOT allowed. Default is schema:2. |
| Existing graphs | Supported. Can read and extend. |
| Migration | Explicit via `MigrationService.migrateV4toV5()` |
| Auto-migration | NEVER. Migration is semantic, must be auditable. |

**Detection logic:**
```javascript
// On open:
if (existingCheckpoint?.schema === 1) {
  // Allow schema:1 for compatibility
} else if (hasSchema1Patches && !migrationCheckpoint) {
  // Require explicit migration
  throw new Error('Schema:1 history detected. Run migrateV4toV5() first.');
} else {
  // New graph: default to schema:2
  schema = 2;
}
```

### MultiWriterGraph

**Status:** The implementation. The future.

| Aspect | Policy |
|--------|--------|
| Default schema | 2 (OR-Set CRDT) |
| Single-writer | Just one writerId, same engine |
| New features | Land here first and only |

---

## Phase A: Immediate (Now)

### A.1: Default to schema:2

**File:** `src/domain/MultiWriterGraph.js`

```javascript
// Change default from 1 to 2
static async open({ persistence, graphName, writerId, schema = 2, gcPolicy = {} }) {
```

**File:** `index.js`

```javascript
// Update openMultiWriter to pass schema:2
static async openMultiWriter({ persistence, graphName, writerId, schema = 2 }) {
  return MultiWriterGraph.open({ persistence, graphName, writerId, schema });
}
```

### A.2: Add deprecation warning to EmptyGraph

**File:** `index.js`

```javascript
let _emptyGraphWarningShown = false;

export default class EmptyGraph {
  constructor(options) {
    if (!_emptyGraphWarningShown) {
      console.warn(
        '[DEPRECATION] EmptyGraph is deprecated. Use MultiWriterGraph instead. ' +
        'EmptyGraph will become a compatibility wrapper in v6.0.0.'
      );
      _emptyGraphWarningShown = true;
    }
    // ... existing constructor
  }
}
```

### A.3: Export migration API

**File:** `index.js`

Add to exports:
```javascript
import { migrateV4toV5 } from './src/domain/services/MigrationService.js';

export {
  // ... existing exports
  migrateV4toV5,
};
```

### A.4: Update README support matrix

**File:** `README.md`

Add section:
```markdown
## API Status

| API | Status | Use For |
|-----|--------|---------|
| `MultiWriterGraph` (schema:2) | **Recommended** | All new projects |
| `MultiWriterGraph` (schema:1) | Legacy | Existing v4 graphs only |
| `EmptyGraph` | Deprecated | Migration path only |

### Migration from EmptyGraph

EmptyGraph predates WARP and does not support multi-writer collaboration,
checkpoints, or CRDT merge semantics. New projects should use MultiWriterGraph.

### Migration from WARP v4 to v5

```javascript
import { migrateV4toV5 } from '@git-stunts/empty-graph';

await migrateV4toV5({ persistence, graphName });
// Creates a migration checkpoint, enabling schema:2 operations
```
```

---

## Phase B: Wrapper Implementation

### B.1: Create EmptyGraph wrapper

**Goal:** EmptyGraph becomes a thin façade over MultiWriterGraph.

**New file:** `src/domain/EmptyGraphWrapper.js`

```javascript
import MultiWriterGraph from './MultiWriterGraph.js';

const SINGLE_WRITER_ID = '__single__';

export default class EmptyGraphWrapper {
  constructor({ persistence, graphName = 'default', ...options }) {
    this._graphName = graphName;
    this._persistence = persistence;
    this._options = options;
    this._graph = null; // Lazy init
  }

  async _ensureGraph() {
    if (!this._graph) {
      this._graph = await MultiWriterGraph.open({
        persistence: this._persistence,
        graphName: this._graphName,
        writerId: SINGLE_WRITER_ID,
        schema: 2,
      });
    }
    return this._graph;
  }

  async createNode({ message, parents = [] }) {
    const graph = await this._ensureGraph();
    // Parse message as JSON to extract node data
    const data = JSON.parse(message);
    const nodeId = data.id || `node:${Date.now()}`;

    const patch = graph.createPatch();
    patch.addNode(nodeId);

    // Store original message as property
    patch.setProperty(nodeId, '_message', message);

    return patch.commit();
  }

  async materialize() {
    const graph = await this._ensureGraph();
    return graph.materialize();
  }

  // ... map other methods
}
```

### B.2: Method mapping table

| EmptyGraph Method | MultiWriterGraph Equivalent |
|-------------------|----------------------------|
| `createNode({ message, parents })` | `createPatch().addNode(id).setProperty(id, '_message', message).commit()` |
| `readNode(sha)` | Load from materialized state |
| `getNode(sha)` | Load from materialized state |
| `listNodes({ ref, limit })` | Materialize + filter |
| `iterateNodes({ ref })` | Materialize + iterate |
| `materialize()` | `materialize()` |
| `createCheckpoint()` | `createCheckpoint()` |
| `rebuildIndex()` | Keep as-is (bitmap index is separate concern) |
| `loadIndex()` | Keep as-is |
| `getParents()` | Keep as-is (uses bitmap index) |
| `getChildren()` | Keep as-is (uses bitmap index) |

**Note:** Some EmptyGraph methods (bitmap index, traversal) are orthogonal to WARP and can remain as-is. WARP handles the graph database; bitmap indexes handle DAG traversal.

### B.3: Swap implementation

**File:** `index.js`

```javascript
// Replace:
export default class EmptyGraph { ... }

// With:
import EmptyGraphWrapper from './src/domain/EmptyGraphWrapper.js';
export default EmptyGraphWrapper;
```

### B.4: Freeze old EmptyGraph engine

Move old implementation to `src/legacy/EmptyGraphLegacy.js` for reference, but do not use or maintain it.

---

## Phase C: Cleanup (Major Version Bump)

### C.1: Remove legacy code

- Delete `src/legacy/EmptyGraphLegacy.js`
- Remove schema:1 reducer code paths (optional, or keep for read-only)
- Simplify codebase

### C.2: Update major version

- Bump to v6.0.0
- Update CHANGELOG with breaking changes
- EmptyGraph wrapper is now the only EmptyGraph

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| schema:2 default | OR-Set CRDT is strictly better than LWW for new graphs |
| No auto-migration | Migration changes semantics; must be explicit and auditable |
| Single-writer = one writerId | Unifies codebase; single-writer gets all v5 benefits |
| Keep bitmap indexes | Orthogonal to WARP; useful for DAG traversal |
| Deprecate, don't delete | Gives users migration runway |

---

## What NOT To Do

1. **Don't auto-migrate schema:1 → schema:2 on open**
   - Migration is semantic (LWW → add-wins). Must be explicit.

2. **Don't add features to EmptyGraph engine**
   - Every new feature lands in MultiWriterGraph first and only.

3. **Don't keep parallel test suites**
   - Once wrapper is complete, EmptyGraph tests become integration tests for the wrapper.

4. **Don't rush Phase C**
   - Give users time to migrate. Deprecation warnings first.

---

## Success Criteria

- [ ] Phase A complete: schema:2 default, deprecation warnings, migration API exported
- [ ] Phase B complete: EmptyGraph is wrapper, old engine frozen
- [ ] Phase C complete: Legacy code removed, v6.0.0 released
- [ ] One test suite covers one engine
- [ ] README clearly states recommended API
- [ ] No feature drift between "engines" (because there's only one)

---

## Timeline

| Phase | When | Breaking? |
|-------|------|-----------|
| A | Now (v5.x) | No |
| B | After v5 stabilization | No (API preserved) |
| C | v6.0.0 | Yes (internal only) |
