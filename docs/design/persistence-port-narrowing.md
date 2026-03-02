# RFC: GraphPersistencePort Narrowing (B145)

**Status:** DESIGN
**Author:** HEX_AUDIT → M14.T7
**Date:** 2026-03-02
**Scope:** JSDoc + minor runtime cleanup — no behavioral changes

---

## Problem

`GraphPersistencePort` is a 23-method composite assembled at import time by
copying every method from five focused ports onto a single prototype
(`src/ports/GraphPersistencePort.js:36–53`):

| Focused Port | Methods | Count |
|---|---|---|
| CommitPort | commitNode, showNode, getNodeInfo, logNodes, logNodesStream, countNodes, commitNodeWithTree, nodeExists, getCommitTree, ping | 10 |
| BlobPort | writeBlob, readBlob | 2 |
| TreePort | writeTree, readTree, readTreeOids, emptyTree | 4 |
| RefPort | updateRef, readRef, deleteRef, listRefs, compareAndSwapRef | 5 |
| ConfigPort | configGet, configSet | 2 |
| **Total** | | **23** |

This violates the **Interface Segregation Principle**: every service that
accepts `GraphPersistencePort` appears to depend on all 23 methods even when
it uses only 2–5. Adding a method to any focused port silently widens the
contract for all consumers.

**ConfigPort is nearly dead.** Only `patch.methods.js` calls `configGet` and
`configSet` (for writer-ID auto-discovery). No other domain service uses
either method. ConfigPort contributes 2 methods to the composite for a single
consumer.

The focused ports already exist as separate classes (`src/ports/CommitPort.js`,
`BlobPort.js`, `TreePort.js`, `RefPort.js`, `ConfigPort.js`). Several services
already declare focused port intersections in their JSDoc. The infrastructure
is in place — we just need to finish the migration.

---

## Service-to-Port Matrix

The matrix below maps every domain service and warp method file to the focused
ports it actually calls at runtime.

### Domain Services

| Service File | Commit | Blob | Tree | Ref | Config |
|---|---|---|---|---|---|
| AuditReceiptService.js | commitNodeWithTree | writeBlob | writeTree | compareAndSwapRef, readRef | |
| AuditVerifierService.js | getNodeInfo, getCommitTree | readBlob | readTreeOids | listRefs, readRef | |
| BitmapIndexReader.js | | readBlob | | | |
| CheckpointService.js | commitNodeWithTree, showNode | readBlob, writeBlob | readTreeOids, writeTree | | |
| HealthCheckService.js | ping | | | | |
| IndexRebuildService.js | | writeBlob | writeTree | readRef | |
| IndexStalenessChecker.js | | readBlob | | | |
| LogicalIndexReader.js | | readBlob | | | |
| MaterializedViewService.js | | writeBlob | writeTree | | |
| PatchBuilderV2.js | commitNodeWithTree, showNode | readBlob, writeBlob | writeTree | readRef, updateRef | |
| PropertyIndexReader.js | | readBlob | | | |
| StreamingBitmapIndexBuilder.js | | readBlob, writeBlob | writeTree | | |
| SyncController.js | | | | readRef | |
| SyncProtocol.js | getNodeInfo, showNode | readBlob | | | |
| WormholeService.js | getNodeInfo, nodeExists | readBlob | | | |

### Warp Method Files

| Method File | Commit | Blob | Tree | Ref | Config |
|---|---|---|---|---|---|
| checkpoint.methods.js | commitNode, getNodeInfo | readBlob | | readRef, updateRef | |
| fork.methods.js | getNodeInfo, nodeExists | | | listRefs, readRef, updateRef | |
| materialize.methods.js | showNode | | | | |
| materializeAdvanced.methods.js | getNodeInfo | readBlob | readTreeOids | readRef | |
| patch.methods.js | getNodeInfo, showNode | readBlob | | listRefs, readRef | configGet, configSet |
| provenance.methods.js | getNodeInfo | readBlob | | | |
| query.methods.js | | readBlob | | | |
| Writer.js | showNode | | | readRef | |

### Key Observations

1. **Blob-only services** (5): BitmapIndexReader, IndexStalenessChecker,
   LogicalIndexReader, PropertyIndexReader, query.methods.js — need only
   `BlobPort`.

2. **Blob+Tree services** (3): MaterializedViewService,
   StreamingBitmapIndexBuilder, IndexRebuildService — need `BlobPort & TreePort`
   (plus RefPort for IndexRebuildService).

3. **ConfigPort** is used by exactly one consumer: `patch.methods.js`.

4. **No service needs all 5 ports.** The widest consumers (PatchBuilderV2,
   AuditVerifierService) need 4 ports but never ConfigPort.

---

## Design

### Phase 1 — JSDoc Narrowing (Low Risk)

Update `@param` type annotations on every service constructor and function to
declare the intersection of focused ports actually used, replacing the generic
`GraphPersistencePort` type.

**Pattern:**

```javascript
// Before:
/** @param {import('../ports/GraphPersistencePort.js').default} persistence */

// After (example for BitmapIndexReader — blob-only):
/** @param {import('../ports/BlobPort.js').default} persistence */

// After (example for CheckpointService — commit + blob + tree):
/** @param {import('../ports/CommitPort.js').default & import('../ports/BlobPort.js').default & import('../ports/TreePort.js').default} persistence */
```

**Specific type annotations per service:**

| Service | JSDoc Type |
|---|---|
| AuditReceiptService | `CommitPort & BlobPort & TreePort & RefPort` |
| AuditVerifierService | `CommitPort & BlobPort & TreePort & RefPort` |
| BitmapIndexReader | `BlobPort` |
| CheckpointService | `CommitPort & BlobPort & TreePort` |
| HealthCheckService | `CommitPort` |
| IndexRebuildService | `BlobPort & TreePort & RefPort` |
| IndexStalenessChecker | `BlobPort` |
| LogicalIndexReader | `BlobPort` |
| MaterializedViewService | `BlobPort & TreePort` |
| PatchBuilderV2 | `CommitPort & BlobPort & TreePort & RefPort` |
| PropertyIndexReader | `BlobPort` |
| StreamingBitmapIndexBuilder | `BlobPort & TreePort` |
| SyncController | `RefPort` |
| SyncProtocol | `CommitPort & BlobPort` |
| WormholeService | `CommitPort & BlobPort` |

For warp method files, the persistence is accessed via `this._persistence` on
WarpGraph. WarpGraph itself continues to accept the full composite — the
narrowing applies to the services it constructs and calls.

**Already done (verify, don't redo):** AuditReceiptService,
AuditVerifierService, CheckpointService, SyncProtocol, WormholeService,
PatchBuilderV2, HealthCheckService already declare focused port intersections.
Verify they match the matrix; update any that are incomplete.

### Phase 2 — Remove ConfigPort from Composite

ConfigPort's only consumer (`patch.methods.js`) accesses it through
`this._persistence` on WarpGraph. The methods `configGet`/`configSet` are used
solely for writer-ID auto-discovery via git config.

**Steps:**

1. In `patch.methods.js`, replace `this._persistence.configGet(key)` and
   `this._persistence.configSet(key, value)` with direct calls through a
   dedicated config accessor. Options:
   - **Option A (recommended):** Pass config methods as a separate parameter
     at WarpGraph construction. WarpGraph already has a `_writerId` field —
     the config lookup is only needed when `writerId` is not provided. Move
     the auto-discovery logic to `WarpGraph.open()` where it belongs.
   - **Option B:** Add a `_config` field to WarpGraph that holds just the
     ConfigPort, separate from `_persistence`.

2. Remove `ConfigPort` from the `focusedPorts` array in
   `GraphPersistencePort.js:33` (reducing the composite from 23 to 21 methods).

3. Remove the `ConfigPort` import from `GraphPersistencePort.js:5`.

4. Update the `FullPersistence` typedef in `WarpGraph.js:34` to remove the
   ConfigPort intersection member.

5. Verify `ConfigPort.js` is retained as a standalone port for adapters that
   still implement it (GitGraphAdapter, InMemoryGraphAdapter). It just won't
   be part of the composite.

**Risk:** Low. Only one consumer to migrate. No behavioral change.

### Phase 3 (Optional) — CorePersistence Typedef

A `CorePersistence` typedef already exists in
`src/domain/types/WarpPersistence.js`. Verify it matches
`CommitPort & BlobPort & TreePort & RefPort` (the 4-port intersection used by
the widest services). If it does, services needing 4 ports can reference it
instead of spelling out the full intersection.

This is cosmetic — only do it if the typedef is already correct and reduces
verbosity.

---

## Migration Plan

1. **Phase 1** — Sweep all service files, update JSDoc `@param` types.
   Verify existing annotations match the matrix. Run full test suite to
   confirm no behavioral regression (JSDoc changes are invisible to runtime).

2. **Phase 2** — Relocate configGet/configSet usage out of
   `patch.methods.js`'s persistence path. Remove ConfigPort from composite.
   Run full test suite.

3. **Phase 3** — Opportunistic. Introduce `CorePersistence` typedef usage
   where it reduces verbosity.

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| JSDoc changes introduce tsc/IDE false positives | Low | Phase 1 is purely additive — narrower types only tighten, they don't break |
| ConfigPort removal breaks adapter implementations | Low | Adapters still implement ConfigPort class; composite just stops including it |
| Missing method in focused port intersection | Low | Matrix was built from grep of actual call sites; verify with test suite |

---

## Verification

- `npm run test:local` — full unit + integration suite
- `WarpGraph.noCoordination.test.js` — multi-writer regression suite
- `grep -r 'configGet\|configSet' src/` — must show zero hits on `_persistence.configGet/Set` after Phase 2
- `grep -r 'GraphPersistencePort' src/domain/services/` — should show zero hits after Phase 1 (all narrowed to focused ports)

---

## Implementation Sequencing

**B145 is the safest to implement first.** JSDoc-only changes (Phase 1) plus
a small ConfigPort removal (Phase 2). Single session. No behavioral changes.
No risk of breaking multi-writer semantics.

**Gate:** `WarpGraph.noCoordination.test.js` must pass after each phase.

**Implementation order within the broader SOLID effort:** B145 → B144 → B143.
