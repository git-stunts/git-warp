# Public Surface Inventory For Worldline/Optic Pivot

## Hill

Inventory the current public and public-adjacent graph-opening, materialize,
worldline, observer, and optic surfaces before changing API shape. Slice 114 is
done when the next implementation slices can point to a concrete surface map
instead of relying on memory.

## Method

Evidence was gathered from:

- `index.ts`
- `src/domain/WarpGraph.ts`
- `src/domain/WarpApp.ts`
- `src/domain/WarpCore.ts`
- `src/domain/capabilities/QueryCapability.ts`
- `src/domain/capabilities/MaterializeCapability.ts`
- `src/domain/capabilities/ProvenanceCapability.ts`
- `src/domain/capabilities/StrandCapability.ts`
- `src/domain/services/Worldline.ts`
- `src/domain/services/query/Observer.ts`
- `src/domain/services/optic/*`
- `README.md`
- `docs/API_REFERENCE.md`
- `docs/READINGS_AND_OPTICS.md`
- `test/type-check/consumer.ts`

Representative queries:

```text
rg -n "\bopenWarpGraph\b|\bWarpApp\b|\bWarpCore\b|\bmaterialize[A-Za-z]*\b|\bWorldline\b|\bObserver\b|\bOptic\b|\bReading\b" index.ts src test/type-check docs/API_REFERENCE.md docs/READINGS_AND_OPTICS.md README.md
rg -n "export .*openWarpGraph|export .*WarpApp|export .*WarpCore|export .*Worldline|export .*Observer|export .*Optic|export .*Materialize|export .*Reading" index.ts src/**/*.ts
```

## Executive Findings

| Finding | Evidence | Disposition |
|---------|----------|-------------|
| The package still defaults to `WarpApp`, not `openWarpGraph()`. | `index.ts:490-491` says `WarpApp` is the default export and still calls it the v15 product-facing API. | Slice 115 must decide whether the new worldline-first function becomes the preferred named entrypoint only, or whether default export posture also changes later. |
| First-use docs are graph-first. | `README.md:18-39`, `docs/API_REFERENCE.md:60-75`, and `docs/READINGS_AND_OPTICS.md:6-14` start from `openWarpGraph()`. | Slices 123-125 should rewrite first-use paths after the new API exists. |
| `openWarpGraph()` is a capability bag and already hides direct full materialization. | `src/domain/WarpGraph.ts:93-112` exposes moments and flat aliases but no direct `materialize`; type tests assert `graphBag.materialize` is invalid in `test/type-check/consumer.ts:513-520`. | Good implementation substrate for `openWarpWorldline()`, because it exposes `patches` and `query` without direct full materialize. |
| `WarpCore` is the materialization-heavy substrate/tooling surface. | `src/domain/WarpCore.ts:17-18` describes replay/materialization/provenance, and `src/domain/WarpCore.ts:58-60`, `77`, and `91-92` expose materialize methods. | Keep as compatibility/diagnostic/substrate API. Do not build the new product API by subclassing `WarpCore`. |
| `WarpApp` is product-facing and already omits direct `materialize()`, but exposes `core()`. | `src/domain/WarpApp.ts:95-118` says product-facing and includes `core()`, while `src/domain/WarpApp.ts:153-166` exposes worldline/observer. | Existing app facade can remain compatibility. New handle should be stricter and avoid a core escape hatch. |
| `Worldline` and `Observer` are exported through the root barrel. | `index.ts:349-358` exports `Worldline`, selectors, `QueryBuilder`, and `Observer`. | Reuse these surfaces where possible. |
| `Worldline.optic()` exists but optic classes are not root-exported. | `src/domain/services/Worldline.ts:110-124` returns `WorldlineOptic`; `index.ts:349-358` does not export `WorldlineOptic`, `NodeOptic`, or optic read results. | Slice 115/116 must decide if optic return types become root exports or remain reachable only through methods. |
| The current query capability still describes itself as materialized graph reads. | `src/domain/capabilities/QueryCapability.ts:1-6` says "materialized graph" while methods include `worldline()` and `observer()`. | Slice 120/124 should update wording after the new API lands. |
| Materialize-named surfaces span full-state, coordinate, checkpoint, strand, provenance, CLI, and sync options. | `src/domain/capabilities/MaterializeCapability.ts:42-53`, `src/domain/capabilities/StrandCapability.ts:33-41`, `src/domain/capabilities/ProvenanceCapability.ts:18-22`, and docs references in `docs/API_REFERENCE.md:1282-1290`, `1360-1374`, `1466-1490`. | Slice 121 needs classification, not blanket deletion. |

## Root Export Inventory

| Export | Source | Current role | Recommended v18 posture |
|--------|--------|--------------|---------------------------|
| default `WarpApp` | `index.ts:490-491` | Default product-facing facade from an older release posture. | Compatibility default for v18. Do not remove in this branch. |
| `WarpApp` | `index.ts:349-351`, `src/domain/WarpApp.ts:95-107` | Curated app facade with patch, worldline, observer, sync, content, strand helpers, and `core()` escape hatch. | Legacy/compatibility app facade. Deprecate after the stricter worldline handle exists. |
| `WarpCore` | `index.ts:349-351`, `src/domain/WarpCore.ts:17-22` | Full plumbing-facing surface for replay, materialization, provenance, comparison, GC, strands, sync, effects, and fork. | Substrate/tooling compatibility surface. Keep available, but stop positioning it as product API. |
| `openWarpGraph` | `index.ts:346-347`, `src/domain/WarpGraph.ts:372-376` | Newer frozen capability-bag composition root. | Advanced compatibility composition root. Likely implementation dependency for `openWarpWorldline()`. |
| `Worldline` | `index.ts:352`, `src/domain/services/Worldline.ts:73-174` | Read handle for live, coordinate, or strand sources. Supports `seek()`, direct reads, query, traversal, observer, and bounded optic access. | Keep and center. New public handle should return `Worldline` read handles rather than recreate reads. |
| `WorldlineSelector` | `index.ts:353` | Runtime-backed selector base for live, coordinate, and strand sources. | Keep as advanced read-source concept. |
| `LiveSelector` | `index.ts:354` | Runtime-backed live-worldline selector. | Keep as advanced read-source concept. |
| `CoordinateSelector` | `index.ts:355` | Runtime-backed coordinate selector. | Keep as advanced read-source concept. |
| `StrandSelector` | `index.ts:356` | Runtime-backed strand selector. | Keep as advanced read-source concept. |
| `Observer` | `index.ts:358`, `src/domain/services/query/Observer.ts:109-205` | Read-only filtered view with source, state hash, query, traversal, and direct reads. | Keep and center as optic/read aperture companion. |
| `QueryBuilder` | `index.ts:357` | Fluent query surface for `Worldline`, `Observer`, and direct query capability. | Keep; docs should frame it as an optic/query over a worldline or observer. |
| `PatchBuilder`, `PatchSession`, `Writer` | `index.ts:359-361` | Write/session surfaces used by graph/core/app APIs. | Keep; new handle can delegate to `PatchCapability.patch()` and expose a commit callback without requiring users to import these first. |

## Graph-Opening Surface Inventory

| Surface | Open shape | Public positioning today | Actual risk | Recommendation |
|---------|------------|--------------------------|-------------|----------------|
| `WarpApp.open(options)` | Static method on default and named export. | Product-facing facade, but docs also mark it deprecated in favor of `openWarpGraph()`. | Mixed messaging: root default says product-facing, API reference says deprecated. `core()` exposes all substrate methods. | Preserve, then deprecate in favor of new worldline-first handle once replacement exists. |
| `WarpCore.open(options)` | Static method on named export. | Legacy facade in API reference, full plumbing surface in source docs. | Exposes materialize-first API directly. | Keep for tooling/diagnostics. Do not use as new app entrypoint. |
| `openWarpGraph(deps)` | Named root export. | Current API reference public entrypoint. | Graph capability bag remains graph-first and still exposes nested diagnostic materialize surfaces. | Keep as advanced composition root; wrap it for new worldline entrypoint. |
| `openWarpGraphRuntime(...)` | Internal module export in `src/domain/warp/WarpGraphRuntimeBridge.ts`. | Not root-exported. | Runtime seam, not package API. | Do not document as public. |
| `openWarpCoreRuntimeProduct(...)` | Internal module export in `src/domain/warp/WarpCoreRuntimeProduct.ts`. | Not root-exported. | Runtime seam, not package API. | Do not document as public. |

## Materialize Surface Inventory

| Surface | Location | Current exposure | Recommended classification |
|---------|----------|------------------|----------------------------|
| `WarpCore.materialize()` | `src/domain/WarpCore.ts:58`, implemented through `MaterializeCapability`. | Directly reachable on `WarpCore`; type-checked as public in `test/type-check/consumer.ts:315-317`. | Deprecated application read path; supported compatibility/substrate method. |
| `WarpCore.materializeCoordinate()` | `src/domain/WarpCore.ts:59`, `MaterializeCapability`. | Directly reachable on `WarpCore`. | Deprecated application coordinate read path; replace with worldline coordinate reads where possible. |
| `WarpCore.materializeAt()` | `src/domain/WarpCore.ts:60`, `MaterializeCapability`. | Directly reachable on `WarpCore`. | Deprecated application checkpoint read path; diagnostic/substrate. |
| `WarpCore.verifyIndex()` | `src/domain/WarpCore.ts:61`, `MaterializeCapability`. | Directly reachable on `WarpCore`. | Diagnostic/substrate, not deprecated as materialize read path. |
| `WarpCore.invalidateIndex()` | `src/domain/WarpCore.ts:62`, `MaterializeCapability`. | Directly reachable on `WarpCore`. | Diagnostic/substrate. |
| `graph.provenance.materializeSlice()` | `src/domain/WarpGraph.ts:339-346`, `ProvenanceCapability`. | Nested public capability on `openWarpGraph()` result. | Diagnostic/provenance inspection. Keep but classify. |
| `graph.strands.materializeStrand()` | `src/domain/WarpGraph.ts:301-315`, `StrandCapability`. | Nested public capability on `openWarpGraph()` result and direct on `WarpCore`. | Speculative-lane diagnostic/preview snapshot. Keep but classify. |
| `syncWith(..., { materialize })` | `SyncCapability` option documented in API reference. | Public option on sync. | Compatibility convenience. Keep out of first-use docs; classify in slice 121. |
| CLI `git warp materialize` | `docs/API_REFERENCE.md:1360-1367`, command implementation. | Operator command in docs. | Diagnostic/operator command, not app read model. |
| CLI `git warp strand materialize` | `docs/API_REFERENCE.md:1466-1472`, command implementation. | Operator command in docs. | Diagnostic/speculative-lane inspection. |

## Worldline, Observer, And Optic Surface Inventory

| Surface | Location | Current capability | Gap for pivot |
|---------|----------|--------------------|---------------|
| `QueryCapability.worldline(options?)` | `src/domain/capabilities/QueryCapability.ts:75` | Creates live, coordinate, or strand `Worldline` read handles. | It is reached through `graph.query`, not the top-level product entrypoint. |
| `QueryCapability.observer(...)` | `src/domain/capabilities/QueryCapability.ts:76-80` | Convenience observer creation from graph query capability. | Docs should prefer observer creation from a worldline when the read basis matters. |
| `Worldline.source` | `src/domain/services/Worldline.ts:96-98` | Exposes selected source as live, coordinate, or strand DTO. | Good; new handle can expose or forward this without materialize language. |
| `Worldline.seek(options?)` | `src/domain/services/Worldline.ts:100-108` | Returns a new worldline pinned to a requested source. | Good; likely enough for first historical API slice. |
| `Worldline.optic()` | `src/domain/services/Worldline.ts:110-124` | Returns bounded checkpoint-tail `WorldlineOptic` for live worldlines when source exists. | Important but narrow. Docs must state current bounded/live-only scope. |
| `Worldline.hasNode/getNodes/getNodeProps/getEdges` | `src/domain/services/Worldline.ts:137-150` | Direct reads through delegate observer. | Good first-use read surface. |
| `Worldline.query()` | `src/domain/services/Worldline.ts:161-163` | Fluent query over the worldline read model. | Good optic/query surface. |
| `Worldline.observer(...)` | `src/domain/services/Worldline.ts:165-173` | Creates observer pinned to the worldline source. | Core pivot surface. |
| `Observer.name/source/stateHash` | `src/domain/services/query/Observer.ts:147-157` | Read-only observation metadata. | Useful for observation artifact language, but not a full reading envelope yet. |
| `Observer.seek(options?)` | `src/domain/services/query/Observer.ts:178-185` | Recreates observer at a new source. | Good migration path for historical observer reads. |
| `Observer.query()/traverse/direct reads` | `src/domain/services/query/Observer.ts:191-205` and following methods. | Read-only filtered query/traversal/read handle. | Good first-use read surface. |
| `WorldlineOptic.node(nodeId)` | `src/domain/services/optic/WorldlineOptic.ts:5-15` | Starts a node optic. | Not root-exported; return type leaks from `Worldline.optic()`. |
| `NodeOptic.read()` | `src/domain/services/optic/NodeOptic.ts:18-20` | Reads node liveness with read identity. | Not root-exported. |
| `NodeOptic.prop(key)` | `src/domain/services/optic/NodeOptic.ts:22-28` | Starts property optic. | Not root-exported. |
| `NodePropertyOptic.read()` | `src/domain/services/optic/NodePropertyOptic.ts:20-22` | Reads property value with read identity. | Not root-exported. |
| `NodeOpticReadResult` | `src/domain/services/optic/NodeOpticReadResult.ts:3-17` | Carries node id, liveness, and read identity. | Not root-exported; needed if users type optic results explicitly. |
| `NodePropertyOpticReadResult` | `src/domain/services/optic/NodePropertyOpticReadResult.ts:4-23` | Carries node id, key, existence, value, and read identity. | Not root-exported; needed if users type optic results explicitly. |

## Documentation Surface Inventory

| Document | Current public story | Required change |
|----------|----------------------|-----------------|
| `README.md` | Quick start imports `openWarpGraph()`, opens `graph`, writes through `graph.patches`, then reads through `graph.query.worldline()`. | Slice 123 should start from the new worldline handle and use graph/capability bag only in advanced section. |
| `docs/API_REFERENCE.md` | Calls `openWarpGraph()` the public entrypoint, says `WarpApp.open()` and `WarpCore.open()` are deprecated in favor of `openWarpGraph()`, and contains many materialize command/API examples. | Slice 125 should add the new entrypoint first, reclassify `openWarpGraph()`, and update legacy guidance. |
| `docs/READINGS_AND_OPTICS.md` | Already explains readings and optics, but names the v17 path as `openWarpGraph() -> graph.patches -> graph.query -> worldlines, observers, readings, optics`. | Slice 124 should rewrite this around `openWarpWorldline()` and classify current bounded optic limits. |
| `index.ts` module docs | Example imports default `WarpApp` and opens `WarpApp.open()`. | Slice 120 or 130 should align module docs with the new public entrypoint. |

## Type Surface Evidence

The consumer type-check currently locks the old surface:

| Evidence | Meaning |
|----------|---------|
| `test/type-check/consumer.ts:53-62` | Root imports include `openWarpGraph`, `WarpApp`, `WarpCore`, `Worldline`, selectors, and `Observer`. |
| `test/type-check/consumer.ts:283-317` | `WarpApp.open()`, `openWarpGraph()`, and `WarpCore.materialize()` are treated as compiling public APIs. |
| `test/type-check/consumer.ts:322-323` | `openWarpGraph().query.worldline()` and `.observer()` return exported `Worldline` and `Observer` types. |
| `test/type-check/consumer.ts:513-520` | `openWarpGraph()` result intentionally does not expose `materialize` directly or under `query`. |

Slice 122 should add parallel consumer checks for `openWarpWorldline()` and make
sure the new public docs do not require imports from private package paths.

## Recommended Cut Line For Slice 115

1. Add the new entrypoint as a named root export, not a default export change.
2. Build it over `openWarpGraph()` rather than `WarpCore.open()` so direct
   materialize methods are not present on the wrapper substrate.
3. Create a new runtime-backed handle instead of reusing `WarpApp`, because
   `WarpApp.core()` exposes the materialization-heavy substrate.
4. Keep the initial write API as a patch callback over the existing patch
   capability.
5. Return existing `Worldline` and `Observer` objects from read methods.
6. Decide whether to root-export optic classes before documenting typed optic
   result imports.
7. Do not deprecate or reword old APIs until the new entrypoint and tests exist.

## Slice 114 Acceptance

- The graph-opening surfaces are mapped.
- The materialize-named public and public-adjacent surfaces are classified.
- The worldline, observer, and optic surfaces are mapped.
- The next slice has a specific cut line for API naming and dependency contract.
