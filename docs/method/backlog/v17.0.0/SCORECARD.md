# SSTS Scorecard — v17.0.0 Kill Plans

Each plan scored against SSTS principles (P1–P7) and practices.

```
✅ = plan addresses this
⚠️ = plan is silent — needs amendment
❌ = plan contradicts this
```

---

## API_capability-interfaces

| Rule | Score | Note |
|------|-------|------|
| P1: Runtime-backed forms | ⚠️ | Plan says "interface" for capabilities. SSTS says interface = ports. Capabilities ARE ports (contracts between domain and consumers), so this is correct. But the plan doesn't say the controllers that IMPLEMENT them are classes. |
| P2: Boundary validation | ⚠️ | Plan is silent on where input validation lives. Do capabilities validate args, or do controllers? Answer: controllers validate in constructors/methods. Plan should say. |
| P3: Behavior on owning type | ✅ | The whole point — behavior lives on the controller, capability is the contract. |
| P4: Schemas at boundaries | ⚠️ | Plan is silent. Some capability methods accept raw option objects. Should those be validated with schemas at the capability boundary? |
| P5: Serialization is codec's problem | ✅ | Capabilities don't know about CBOR/Git. |
| P6: Single source of truth | ✅ | Controller IS the implementation. Interface IS the contract. No duplication. |
| P7: Runtime dispatch | ✅ | No tag switching. Methods on objects. |
| No option bags | ❌ | Several capability methods will accept `options: Record<string, unknown>`. That's an anonymous bag. Each options param needs a named type. |
| One thing per file | ✅ | One interface per file. |
| 500 LOC | ✅ | Interfaces are ~30 LOC each. |

**Amendments needed:**
1. Name every options parameter type — no `Record<string, unknown>`.
2. State that controllers validate inputs in methods. Capabilities are the contract; controllers are the enforcement.

---

## API_warpgraph-factory

| Rule | Score | Note |
|------|-------|------|
| P1: Runtime-backed forms | ⚠️ | `WarpGraph` is an interface, not a class. It's a frozen plain object. Does a frozen record satisfy P1? It has no invariants, identity, or behavior of its own — it's a composition root. Interfaces are for ports, and this IS a port. Acceptable. |
| P2: Boundary validation | ⚠️ | `openWarpGraph(deps)` — the deps need validation. Plan is silent. Who validates that persistence is real, graphName is non-empty, writerId is canonical? |
| P3: Behavior on owning type | ✅ | Each capability namespace owns its behavior. |
| P6: Single source of truth | ⚠️ | Plan says "initially wraps WarpRuntime.open() internally." That means two boot paths exist during migration. Plan should explicitly state when the old one dies. |
| No option bags | ⚠️ | `WarpGraphDeps` is mentioned but not defined. Is it a named type or a bag? Must be a named type with documented fields. |
| Object.freeze | ✅ | Plan explicitly says `Object.freeze()`. |

**Amendments needed:**
1. Define `WarpGraphDeps` as a named type with validated fields.
2. `openWarpGraph` validates deps at the boundary (non-empty graphName, valid writerId, etc.).
3. State the deadline: WarpRuntime.open() dies when API_kill-warpruntime ships.

---

## GOD_query-controller

| Rule | Score | Note |
|------|-------|------|
| P1: Runtime-backed forms | ✅ | `NodeContent`, `EdgeContent` are classes. QueryReads is a class. |
| P2: Boundary validation | ⚠️ | Plan doesn't say where nodeId/edgeId validation happens. `hasNode("")` — who rejects? |
| P3: Behavior on owning type | ✅ | Content accessors own content behavior. Reads own read behavior. |
| P7: Runtime dispatch | ✅ | No tag switching. defineProperty sludge dies. |
| No option bags | ⚠️ | `observer(nameOrConfig, config, options)` — that 3-arg overload is a boolean trap. Needs cleanup. |
| interface for ports only | ✅ | `MaterializedStateProvider` and `IndexProvider` are ports. |
| One thing per file | ✅ | 3 files, 3 concerns. |
| 500 LOC | ✅ | All ~250–350. |

**Amendments needed:**
1. Define input validation policy: empty strings, null nodeIds, etc.
2. Clean up observer's 3-arg overload — named params or separate methods.

---

## GOD_materialize-controller

| Rule | Score | Note |
|------|-------|------|
| P1: Runtime-backed forms | ⚠️ | `MaterializeHelpers.ts` is pure functions. That's fine — not every module needs a class. But the "state caching" concern in the controller is stateful and might deserve its own class (StateCacheManager?). |
| P3: Behavior on owning type | ✅ | Pipeline owns materialization. Cache owns caching. Helpers are pure. |
| P5: Serialization is codec's problem | ⚠️ | `_persistSeekCacheEntry` encodes state for caching. Is that serialization? It uses the codec port, so technically yes — the codec handles it. But the plan should confirm the cache module doesn't inline encoding. |
| No option bags | ⚠️ | `materialize(options)` — what shape is `options`? Named type needed. |
| 500 LOC | ✅ | All ~200–400. |
| Browser-capable | ⚠️ | Seek cache uses filesystem. The cache module must go through ports, not direct fs. Plan says `SeekCachePort` — good. |

**Amendments needed:**
1. Name the `options` type for each public method.
2. Confirm cache encoding goes through CodecPort, not inline.

---

## GOD_strand-service

| Rule | Score | Note |
|------|-------|------|
| P3: Behavior on owning type | ✅ | Dissolving the facade pushes behavior to sub-services. |
| P6: Single source of truth | ✅ | No duplication — sub-services ARE the truth. |
| No option bags | ⚠️ | `create(options = {})` — anonymous bag. Named type needed. |
| One thing per file | ⚠️ | Plan says "dissolve" but doesn't confirm the sub-services each stay under 500 LOC. StrandDescriptorStore is already 643 LOC — pushing more behavior into it makes it worse. |

**Amendments needed:**
1. Name all option types.
2. Verify sub-service LOC after dissolution. If StrandDescriptorStore exceeds 500, split IT too.

---

## GOD_incremental-index-updater

| Rule | Score | Note |
|------|-------|------|
| P1: Runtime-backed forms | ✅ | `IndexNodeUpdater` and `IndexEdgeUpdater` already own the split behavior. |
| P2: Boundary validation | ⚠️ | Remaining live residue is shard-I/O and raw-shape cleanup, now owned by `PROTO_purge-boundary-leaks`. |
| P3: Behavior on owning type | ✅ | The god split already happened; behavior moved to the owning helpers. |
| interface for ports only | ✅ | `ShardPort` already exists. |
| 500 LOC | ✅ | `IncrementalIndexUpdater.ts` is now 495 LOC. |

**Remaining owner notes:**
1. `PROTO_purge-boundary-leaks`
2. `MODEL_incremental-index-updater-shape-sludge`

---

## GOD_query-builder

| Rule | Score | Note |
|------|-------|------|
| P3: Behavior on owning type | ✅ | Builder accumulates. Runner executes. |
| P6: Single source of truth | ⚠️ | Builder state is the source of truth for the query. But what type is it? Plan doesn't name the intermediate representation. A `QueryPlan` value object would make the builder → runner handoff explicit. |
| No option bags | ⚠️ | `run()` currently returns a bag of results. Named result type needed. |
| 500 LOC | ✅ | Both under 500 with the runner split. |

**Amendments needed:**
1. Name the intermediate representation (`QueryPlan` or similar).
2. Name the result type.

---

## Former remaining-big-files residue

`GOD_remaining-big-files` closed in cycle `0058`. The named files are now
already below the 500 LOC ceiling, and the only still-serious index-builder
residue was closed in `0057`.

The real remaining owner notes are:

1. `CORE_streaming-memory-audit`
2. `PROTO_purge-boundary-leaks`

---

## SLUDGE items

### SLUDGE_host-bag-injection
| P3 | ✅ | Kills external dispatch through host. |
| No bags | ✅ | Specific typed deps, not a host reference. |

### SLUDGE_content-access-duplication
| P3 | ✅ | Content accessors own content behavior. |
| P1 | ✅ | NodeContent/EdgeContent are runtime-backed. |

### SLUDGE_detached-graph-duplication
| P6 | ✅ | One function, one file. |

**No amendments needed for sludge items. They're clean.**

---

## Summary of all amendments needed

1. **Name every options/result type.** No `Record<string, unknown>`,
   no anonymous bags. Every public method parameter and return value
   gets a named type. (Affects: capability interfaces, materialize,
   strand, query-builder)
2. **Input validation policy.** Controllers validate at method entry.
   Empty strings, null IDs, invalid selectors — rejected with domain
   errors. (Affects: capability interfaces, query-controller)
3. **`WarpGraphDeps` is a named validated type.** `openWarpGraph`
   validates at the boundary. (Affects: factory)
4. **Observer 3-arg overload cleanup.** Named params or separate
   methods. (Affects: query-controller)
5. **StrandDescriptorStore LOC check.** If dissolution pushes it over
   500, split it. (Affects: strand-service)
6. **Shard data validated after deserialization.** (Affects:
   incremental-index-updater)
7. **QueryPlan intermediate type.** Builder → runner handoff is
   explicit. (Affects: query-builder)
8. **Assessment/diff result types.** Decide: class or record, based
   on whether they have behavior. (Affects: remaining-big-files)
9. **WarpRuntime.open() death date.** Stated explicitly: dies when
   API_kill-warpruntime ships. (Affects: factory)
